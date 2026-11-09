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
class AppModel(val api: APIClient, private val context: Context) {
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
            phase = Phase.SignedIn
            applyLaunchArguments()
            scope.launch { loadPhoto() }
            refreshUnread()
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
            val switched = try { api.switchTenant(approved.tenantId); true } catch (e: Exception) { false }
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
        api.logout()
        clearLocal()
    }

    fun clearLocal() {
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
     */
    suspend fun switchBranch(tenantID: String) {
        api.switchTenant(tenantID)
        val identity = api.me()
        api.cacheScope = identity.tenantId
        me = identity
        record = try { api.memberRecord() } catch (e: Exception) { null }
        paths.values.forEach { it.clear() }
        epoch += 1
        refreshUnread()
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
            val bitmap = downsampled(context, uri) ?: throw APIError.decoding
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
                if (phase == Phase.SignedIn && target != null) openEvent(target.first)
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
        HomeRoute.from(AppConfig.launchArgument("SDYProfileRoute"))?.let { tab = Tab.Profile; setPath(Tab.Profile, listOf(Route.Home(it))) }
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
