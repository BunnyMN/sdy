package mn.esdy.member.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.graphics.Paint
import android.net.Uri
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.min
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mn.esdy.member.core.*
import mn.esdy.member.models.Me
import mn.esdy.member.models.MemberRecord

val LocalApp = staticCompositionLocalOf<AppModel> { error("No AppModel") }

/**
 * The signed-in state of the app and everything that moves between screens:
 * which tab is open, which event a link points at, a pending check-in
 * (iOS AppModel).
 */
class AppModel(val api: APIClient, /** For the profile photo picker; null in tests. */ private val context: Context?) {
    sealed interface Phase {
        data object Launching : Phase
        data object SignedOut : Phase
        data object SignedIn : Phase
        data class Failed(val error: APIError) : Phase
    }

    enum class Tab { Home, Events, Checkin, Dues, Profile }

    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    var phase by mutableStateOf<Phase>(Phase.Launching)
    var me by mutableStateOf<Me?>(null)
    var record by mutableStateOf<MemberRecord?>(null)
    var isOffline by mutableStateOf(false)
    var tab by mutableStateOf(Tab.Home)
    /** Bumped after a branch switch so every tab rebuilds from scratch. */
    var epoch by mutableIntStateOf(0)
    var signOutReason by mutableStateOf<String?>(null)
    var pendingCheckin by mutableStateOf<CheckinCode?>(null)
    /** Each tab's pushed screens (iOS eventsPath / homePath / the Profile path). */
    val paths: Map<Tab, SnapshotStateList<NavEntry>> = Tab.entries.associateWith { mutableStateListOf() }
    var unreadCount by mutableIntStateOf(0)
    /**
     * Bumped whenever the app returns to the foreground or eID returns to it,
     * so a waiting eID poll can restart at once.
     */
    var resumeTick by mutableIntStateOf(0)
    var eidReturnSession by mutableStateOf<String?>(null)
    /** The signed-in person's profile photo, shown on Home and Profile. */
    var photo by mutableStateOf<ImageBitmap?>(null)
    /** Screens that cover the tab bar (Өнгө төрх) while they are open. */
    var tabBarHidden by mutableIntStateOf(0)
    /** The sign-in screen's eID model, kept across activity recreation (see LoginScreen). */
    var eidLogin: Any? = null
    /** The first session check has been started (once per process). */
    var bootstrapStarted = false
    /**
     * A notification (or a link to a screen) opened before the app was
     * signed in — a cold launch from it, or a session that had to be renewed:
     * opened once it is (iOS pendingPush).
     */
    var pendingPush: PendingPush? = null
    data class PendingPush(val path: String?, val notificationID: String?)
    private var identityCheckedAt = 0L

    val hasApprovedBranch: Boolean get() = record?.approvedBranch != null

    /**
     * Whether the signed-in person may do this in the current branch. The
     * server decides; this only chooses what to show.
     */
    fun can(permission: String): Boolean {
        val me = me ?: return false
        return me.isAdmin || permission in me.permissions
    }

    init {
        api.onSessionEnded = { sessionEnded() }
        api.onReachability = { reachable -> if (isOffline == reachable) isOffline = !reachable }
        // Refused: perhaps a position was taken away. Read who we are again,
        // so the screens stop offering what the server no longer allows.
        api.onForbidden = { scope.launch { refreshIdentity(minimumIntervalMs = 30_000) } }
        // `SDYSignedOut` keeps the fixtures but starts at the sign-in screen.
        if (AppConfig.fixturesEnabled && AppConfig.launchArgument("SDYSignedOut") == null) api.tokens.save("fixture-token")
    }

    // region Navigation helpers

    fun setPath(tab: Tab, routes: List<Route>) { paths.getValue(tab).let { Nav(it).set(routes) } }
    fun setHomePath(vararg routes: HomeRoute) = setPath(Tab.Home, routes.map { Route.Home(it) })

    /** Tapping the open tab again goes back to its first screen (iOS). */
    fun select(tab: Tab) {
        if (this.tab == tab) Nav(paths.getValue(tab)).popToRoot() else this.tab = tab
    }

    // endregion

    // region Session

    suspend fun bootstrap() {
        if (!api.tokens.hasToken) { phase = Phase.SignedOut; return }
        try {
            loadIdentity()
            identityCheckedAt = System.currentTimeMillis()
            phase = Phase.SignedIn
            applyLaunchArguments()
            scope.launch { loadPhoto() }
            refreshUnread()
            openPendingPush()
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Throwable) {
            val error = APIError.wrap(e)
            if (error.kind == APIError.Kind.Unauthorized) clearLocal() else phase = Phase.Failed(error)
        }
    }

    /**
     * Who is signed in and which branch they belong to. A member whose
     * session sits in a workspace that is not one of their branches (their
     * personal home, say) is moved into their approved branch.
     */
    suspend fun loadIdentity() {
        var identity = api.me()
        api.cacheScope = identity.tenantId
        val record = api.memberRecord()
        val approved = record.approvedBranch
        if (approved != null && approved.hasAccess &&
            record.memberships.none { it.tenantId == identity.tenantId && it.hasAccess }
        ) {
            val switched = try { api.switchTenant(approved.tenantId); true } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { false }
            if (switched) identity = api.me()
        }
        api.cacheScope = identity.tenantId
        me = identity
        this.record = record
    }

    suspend fun signedIn() {
        signOutReason = null
        phase = Phase.Launching
        bootstrap()
        if (pendingCheckin == null || phase != Phase.SignedIn) return
        // Check-in is a branch member's tab; without a branch there is
        // nothing to check in to.
        if (hasApprovedBranch) tab = Tab.Checkin else pendingCheckin = null
    }

    suspend fun signOut() {
        pendingPush = null
        api.logout()
        clearLocal()
    }

    fun clearLocal() {
        // Also a 401-driven sign-out: a tap kept for the last person is not the next one's.
        pendingPush = null
        api.tokens.clear()
        api.cache.clearAll()
        me = null
        record = null
        tab = Tab.Home
        paths.values.forEach { it.clear() }
        unreadCount = 0
        eidReturnSession = null
        photo = null
        phase = Phase.SignedOut
    }

    /**
     * The eID session a link brought back, handed out once: a session left
     * here would be polled again by the next login screen.
     */
    fun takeEIDReturnSession(): String? = eidReturnSession.also { eidReturnSession = null }

    private fun sessionEnded() {
        if (phase != Phase.SignedIn) return
        clearLocal()
        signOutReason = "Нэвтрэх хугацаа дууссан. Дахин нэвтэрнэ үү."
    }

    /**
     * Moves the session to another branch. The token rotates; everything
     * loaded before belongs to the branch just left, so all tabs rebuild.
     *
     * Once the server has switched, the app is in the new branch whatever
     * happens next: if reading the new identity fails, the screens still
     * rebuild for the new branch (with no officer rights until /auth/me
     * answers) rather than show the old one while requests go to the new.
     */
    suspend fun switchBranch(tenantID: String) {
        val switched = api.switchTenant(tenantID)
        val newTenant = switched.tenantId.ifEmpty { tenantID }
        api.cacheScope = newTenant
        paths.values.forEach { it.clear() }
        try {
            val identity = api.me()
            api.cacheScope = identity.tenantId
            me = identity
            identityCheckedAt = System.currentTimeMillis()
        } catch (e: Throwable) {
            if (e !is kotlinx.coroutines.CancellationException) {
                try { record = api.memberRecord() } catch (_: Exception) {}
            }
            me = me?.copy(
                tenantId = newTenant,
                tenantName = record?.memberships?.firstOrNull { it.tenantId == newTenant }?.name ?: "",
                permissions = emptyList(),
                isAdmin = false,
            )
            identityCheckedAt = 0
            epoch += 1
            throw e
        }
        epoch += 1
        record = try { api.memberRecord() } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { null }
        refreshUnread()
    }

    /**
     * Reads /auth/me and the member record again: positions (and with them
     * permissions) change on the server while the app stays open.
     */
    suspend fun refreshIdentity(minimumIntervalMs: Long = 0) {
        val now = System.currentTimeMillis()
        if (phase != Phase.SignedIn || now - identityCheckedAt < minimumIntervalMs) return
        identityCheckedAt = now
        // What this refresh is about: a branch switch or sign-out meanwhile makes its answers stale.
        val startEpoch = epoch
        val startTenant = me?.tenantId
        fun stale() = phase != Phase.SignedIn || epoch != startEpoch || me?.tenantId != startTenant
        // Uncached: no signal is not an answer, and never a reason to go back to a cached branch.
        val identity = try { api.meFresh() } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { return }
        if (stale()) return
        if (identity.tenantId != me?.tenantId) {
            // Moved elsewhere (another device switched branch): rebuild.
            api.cacheScope = identity.tenantId
            paths.values.forEach { it.clear() }
            epoch += 1
        }
        if (identity != me) me = identity
        val expectEpoch = epoch
        val fresh = try { api.memberRecord(cached = false) } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { return }
        if (phase != Phase.SignedIn || epoch != expectEpoch || me?.tenantId != identity.tenantId) return
        if (fresh != record) record = fresh
    }

    /** Marks one notification read; the count drops only once the server agreed. */
    suspend fun markNotificationRead(id: String): Boolean = try {
        api.markRead(id)
        unreadCount = max(0, unreadCount - 1)
        true
    } catch (e: kotlinx.coroutines.CancellationException) {
        throw e
    } catch (e: Exception) {
        false
    }

    // endregion

    // region Profile photo

    /** Per person, so the next account on this phone never sees the last one's photo. */
    private val photoScope: String? get() = me?.let { "me-${it.id}" }

    /** Shows the last photo at once from the device, then asks the server. */
    suspend fun loadPhoto() {
        val scope = photoScope ?: return
        if (photo == null) {
            api.cache.load(scope, PHOTO_PATH)?.takeIf { it.isNotEmpty() }?.let { photo = decodeBitmap(it) }
        }
        try {
            val data = api.profilePhoto()
            // Signed out (or someone else signed in) while this was in flight.
            if (photoScope != scope) return
            if (data != null) {
                photo = decodeBitmap(data)
                api.cache.save(data, scope, PHOTO_PATH)
            } else {
                photo = null
                api.cache.save(ByteArray(0), scope, PHOTO_PATH)
            }
        } catch (e: Exception) {
            // Offline or a server hiccup: keep what the device had.
        }
    }

    /** Crops the picked image to the centre square, scales to 512 px and uploads it. */
    suspend fun setPhoto(uri: Uri) {
        val jpeg = withContext(Dispatchers.Default) {
            val bitmap = context?.let { downsampled(it, uri) } ?: throw APIError.decoding
            squareJPEG(bitmap) ?: throw APIError.decoding
        }
        api.uploadProfilePhoto(jpeg)
        photo = decodeBitmap(jpeg)
        photoScope?.let { api.cache.save(jpeg, it, PHOTO_PATH) }
        Haptics.success()
    }

    suspend fun removePhoto() {
        api.deleteProfilePhoto()
        photo = null
        photoScope?.let { api.cache.save(ByteArray(0), it, PHOTO_PATH) }
    }

    suspend fun reloadRecord() {
        try { record = api.memberRecord() } catch (_: Exception) {}
    }

    suspend fun refreshUnread() {
        try {
            val page = api.notifications()
            unreadCount = page.unread ?: page.items.count { !it.isRead }
        } catch (_: Exception) {}
    }

    // endregion

    // region Links

    /**
     * A tapped notification (FCM is not wired yet; the logic waits for it, as
     * iOS PushCenter). Before sign-in — the tap launched the app, or the
     * session must be renewed first — it waits, and opens once signed in.
     */
    fun openPushed(path: String?, notificationID: String? = null) {
        if (phase != Phase.SignedIn) {
            pendingPush = PendingPush(path, notificationID)
            return
        }
        scope.launch { openPush(path, notificationID) }
    }

    suspend fun openPendingPush() {
        if (phase != Phase.SignedIn) return
        val pending = pendingPush ?: return
        pendingPush = null
        openPush(pending.path, pending.notificationID)
    }

    private suspend fun openPush(path: String?, notificationID: String?) {
        // Opening a notification is reading it, as on the web.
        if (notificationID != null) try { api.markRead(notificationID) } catch (_: Exception) {}
        refreshUnread()
        if (path.isNullOrEmpty()) { tab = Tab.Home; setHomePath(HomeRoute.Notifications); return }
        try { openNotificationPath(path) } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) {}
    }

    fun handle(link: DeepLink) {
        when (link) {
            is DeepLink.CheckIn -> {
                if (phase == Phase.SignedIn && !hasApprovedBranch) return
                pendingCheckin = link.code
                if (phase == Phase.SignedIn) tab = Tab.Checkin
            }
            is DeepLink.EidCallback -> {
                eidReturnSession = link.sessionId
                resumeTick += 1
                val target = link.returnPath?.let { LinkParser.eventPath(it) }
                if (target != null) {
                    if (phase == Phase.SignedIn) openEvent(target.first)
                    // Not signed in yet (the session is being renewed): the
                    // screen it returns to opens once it is.
                    else pendingPush = PendingPush(link.returnPath, null)
                }
            }
        }
    }

    fun openEvent(id: String) {
        if (!hasApprovedBranch) return
        tab = Tab.Events
        setPath(Tab.Events, listOf(Route.Event(id)))
    }

    /**
     * Where a notification's link leads, for a push tapped anywhere: the
     * screen it names, or the notification list when it names none.
     */
    suspend fun openNotificationPath(path: String) {
        when (val target = resolveNotification(path)) {
            is NotificationTarget.Event -> openEvent(target.id)
            is NotificationTarget.TabTarget -> tab = target.tab
            is NotificationTarget.Screen -> { tab = Tab.Home; setHomePath(target.route) }
            NotificationTarget.Home -> { tab = Tab.Home; setHomePath() }
            NotificationTarget.None -> { tab = Tab.Home; setHomePath(HomeRoute.Notifications) }
        }
    }

    /**
     * Makes a notification's target reachable (switching branch for an event
     * in another one) and says where it is. Screens that need an approved
     * branch fall back to None without one.
     */
    suspend fun resolveNotification(path: String): NotificationTarget {
        val target = LinkParser.notificationTarget(path)
        return when {
            target is NotificationTarget.Event -> {
                if (!hasApprovedBranch && target.workspace == null) return NotificationTarget.None
                if (target.workspace != null && target.workspace != me?.tenantId) switchBranch(target.workspace)
                if (hasApprovedBranch) NotificationTarget.Event(target.id, null) else NotificationTarget.None
            }
            target is NotificationTarget.TabTarget ||
                target == NotificationTarget.Screen(HomeRoute.Participation) ||
                target == NotificationTarget.Screen(HomeRoute.Leaderboard) ->
                if (hasApprovedBranch) target else NotificationTarget.None
            else -> target
        }
    }

    private fun applyLaunchArguments() {
        when (AppConfig.launchArgument("SDYTab")) {
            "events" -> tab = Tab.Events
            "checkin" -> tab = Tab.Checkin
            "dues" -> tab = Tab.Dues
            "profile" -> tab = Tab.Profile
        }
        AppConfig.launchArgument("SDYEvent")?.let { openEvent(it) }
        HomeRoute.from(AppConfig.launchArgument("SDYHomeRoute"))?.let { setHomePath(it) }
        HomeRoute.from(AppConfig.launchArgument("SDYProfileRoute"))?.let { setPath(Tab.Profile, listOf(Route.Home(it))) }
        if (AppConfig.launchArgument("SDYCheckin") != null) {
            pendingCheckin = CheckinCode("7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "ab".repeat(24))
        }
    }

    // endregion

    companion object {
        private const val PHOTO_PATH = "profile_photo"

        fun decodeBitmap(data: ByteArray): ImageBitmap? =
            BitmapFactory.decodeByteArray(data, 0, data.size)?.asImageBitmap()

        /**
         * The picked file decoded at no more than `maxPixel` on its longest
         * side, orientation applied — a 48 MP photo decoded whole is ~190 MB.
         */
        fun downsampled(context: Context, uri: Uri, maxPixel: Int = 1024): Bitmap? = try {
            if (Build.VERSION.SDK_INT >= 28) {
                ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
                    val w = info.size.width
                    val h = info.size.height
                    val scale = min(1f, maxPixel.toFloat() / max(w, h))
                    decoder.setTargetSize(max(1, (w * scale).toInt()), max(1, (h * scale).toInt()))
                    decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                }
            } else {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
                var sample = 1
                while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxPixel) sample *= 2
                val bitmap = context.contentResolver.openInputStream(uri)?.use {
                    BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
                }
                val rotation = context.contentResolver.openInputStream(uri)?.use { ExifInterface(it).rotationDegrees } ?: 0
                if (bitmap != null && rotation != 0) {
                    Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(rotation.toFloat()) }, true)
                } else bitmap
            }
        } catch (e: Exception) {
            null
        }

        /**
         * A new 512×512 JPEG drawn from the image's pixels — orientation
         * applied, and none of the original file's metadata (location,
         * camera) carried over.
         */
        fun squareJPEG(image: Bitmap, side: Int = 512): ByteArray? {
            if (image.width <= 0 || image.height <= 0) return null
            val edge = min(image.width, image.height).toFloat()
            val scale = side / edge
            val drawW = image.width * scale
            val drawH = image.height * scale
            val out = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)
            Canvas(out).apply {
                drawColor(android.graphics.Color.BLACK)
                val m = Matrix().apply { postScale(scale, scale); postTranslate((side - drawW) / 2, (side - drawH) / 2) }
                drawBitmap(image, m, Paint(Paint.FILTER_BITMAP_FLAG))
            }
            return ByteArrayOutputStream().use { out.compress(Bitmap.CompressFormat.JPEG, 85, it); it.toByteArray() }
        }
    }
}
