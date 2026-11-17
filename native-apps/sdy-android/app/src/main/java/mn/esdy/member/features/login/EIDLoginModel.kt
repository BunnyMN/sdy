package mn.esdy.member.features.login

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.time.Instant
import kotlin.math.ceil
import kotlin.math.max
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import mn.esdy.member.core.*
import mn.esdy.member.models.EIDStart

/**
 * eID Mongolia sign-in: start a session, then long-poll until eID answers.
 *
 * Mirrors frontend/components/EIDLogin.tsx and the iOS EIDLoginModel: one
 * poll at a time (the server holds each for up to 25 s), a 400 ms gap, three
 * dropped connections tolerated, and the server's EXPIRED/REFUSED as the only
 * real ends. The poll also restarts the moment the app returns to the
 * foreground or eID's App Link reopens it.
 *
 * The sign-in begins on this phone: the session is handed to the eID
 * Mongolia app through eID's own https device link (`app_link`). When no
 * installed app claims that link, the session is dropped and the member is
 * offered the registration number instead — the request then goes to the eID
 * app on whichever phone holds it.
 */
class EIDLoginModel(
    private val api: APIClient,
    /** For opening the eID app; null in tests (they sign in by registration number). */
    private val context: Context?,
    private val scope: CoroutineScope,
    private val gapMs: Long = GAP_MS,
) {
    enum class Method { SamePhone, RegisterNumber }

    sealed interface Phase {
        data object Idle : Phase
        data object Starting : Phase
        data class Waiting(val started: EIDStart) : Phase
        data object Expired : Phase
        data object Refused : Phase
        data class Failed(val message: String) : Phase
        data object Success : Phase
    }

    var method by mutableStateOf(Method.SamePhone)
    var registerNumber by mutableStateOf("")
        private set
    var phase by mutableStateOf<Phase>(Phase.Idle)
        private set
    var secondsLeft by mutableStateOf<Int?>(null)
        private set
    /** The whole of the session's life, for the draining bar. */
    var totalSeconds by mutableIntStateOf(1)
        private set
    /** Why the registration form is showing (the eID app was not found). */
    var notice by mutableStateOf<String?>(null)

    private var pollJob: Job? = null
    private var countdownJob: Job? = null
    private var deadline: Instant = Instant.MAX
    private var hasDeadline = false
    var onSignedIn: (suspend () -> Unit)? = null

    fun updateRegisterNumber(value: String) { registerNumber = RegisterNumber.normalize(value) }

    val registerHint: String? get() = RegisterNumber.hint(registerNumber)
    val canStart: Boolean
        get() {
            if (phase == Phase.Starting || phase is Phase.Waiting) return false
            return method == Method.SamePhone || RegisterNumber.isValid(registerNumber)
        }
    val isBusy: Boolean get() = phase == Phase.Starting || phase is Phase.Waiting || phase == Phase.Success

    /** Back to the form for a registration number, nothing in flight. */
    fun showRegistration(notice: String? = null) {
        cancel()
        method = Method.RegisterNumber
        this.notice = notice
    }

    /** Sign in on this phone: start a session and hand it to the eID app. */
    fun startHere() {
        method = Method.SamePhone
        start()
    }

    fun start() {
        stop()
        notice = null
        phase = Phase.Starting
        val method = this.method
        val regno = registerNumber
        pollJob = scope.launch {
            val started = try {
                if (method == Method.RegisterNumber) api.eidStartByID(regno) else api.eidStartSamePhone()
            } catch (e: Throwable) {
                if (!isActive) return@launch
                phase = Phase.Failed(startMessage(APIError.wrap(e)))
                return@launch
            }
            if (!isActive) return@launch
            begin(started)
            PendingEIDSession.remember(started.sessionId, started.binding, started.expiresAt)
            if (method == Method.SamePhone && !AppConfig.fixturesEnabled) {
                if (context == null || !openApp(context, started)) {
                    showRegistration(APP_MISSING_NOTICE)
                    return@launch
                }
            }
            pollLoop(started)
        }
    }

    private fun begin(started: EIDStart) {
        val at = Formatters.parseDate(started.expiresAt)
        if (at != null) {
            deadline = at
            hasDeadline = true
            totalSeconds = max(1, ceil((at.toEpochMilli() - System.currentTimeMillis()) / 1000.0).toInt())
        } else {
            deadline = Instant.now().plusSeconds(BACKSTOP_SECONDS)
            hasDeadline = false
        }
        phase = Phase.Waiting(started)
        startCountdown()
    }

    /**
     * Restarts a waiting poll right away — after the app comes back to the
     * foreground, a long-poll that Android paused is likely dead.
     */
    fun resume(sessionFromLink: String? = null) {
        val current = phase
        if (current is Phase.Waiting) {
            pollJob?.cancel()
            pollJob = scope.launch { pollLoop(current.started) }
        } else if (sessionFromLink != null && (current == Phase.Idle || current == Phase.Starting)) {
            // The app was relaunched by eID's link: pick the session up — only
            // one this phone started, so a link from someone else cannot sign
            // the member into another account. Its binding goes with every poll.
            val started = PendingEIDSession.resumable(sessionFromLink) ?: return
            begin(started)
            pollJob?.cancel()
            pollJob = scope.launch { pollLoop(started) }
        }
    }

    private suspend fun pollLoop(started: EIDStart) {
        var failures = 0
        while (scope.isActive) {
            if (Instant.now() >= deadline) { finish(Phase.Expired); return }
            try {
                val result = api.eidPoll(started.sessionId, started.binding)
                failures = 0
                when (result.state.uppercase()) {
                    "COMPLETE" -> {
                        if (!api.tokens.hasToken) {
                            finish(Phase.Failed("eID баталгаажсан боловч нэвтрэх эрх олгогдсонгүй. Дахин оролдоно уу."))
                            return
                        }
                        finish(Phase.Success)
                        Haptics.success()
                        onSignedIn?.invoke()
                        return
                    }
                    "EXPIRED" -> { finish(Phase.Expired); return }
                    "REFUSED" -> { finish(Phase.Refused); return }
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Throwable) {
                val wrapped = APIError.wrap(e)
                if (wrapped.kind == APIError.Kind.Cancelled) return
                // The server no longer knows the session: it ran out.
                if (wrapped.status == 404) { finish(Phase.Expired); return }
                // A 4xx is an answer, not a dropped connection.
                val k = wrapped.kind
                if (k is APIError.Kind.Server && k.status in 400..499) { finish(Phase.Failed(pollMessage(wrapped))); return }
                if (k == APIError.Kind.Unauthorized) { finish(Phase.Failed(pollMessage(wrapped))); return }
                failures += 1
                if (failures > TOLERATED_FAILURES) { finish(Phase.Failed(pollMessage(wrapped))); return }
            }
            delay(gapMs)
        }
    }

    private fun finish(phase: Phase) {
        PendingEIDSession.forget()
        countdownJob?.cancel()
        countdownJob = null
        this.phase = phase
        if (phase is Phase.Failed || phase == Phase.Refused || phase == Phase.Expired) Haptics.error()
    }

    fun cancel() {
        stop()
        PendingEIDSession.forget()
        phase = Phase.Idle
    }

    private fun stop() {
        pollJob?.cancel()
        pollJob = null
        countdownJob?.cancel()
        countdownJob = null
        secondsLeft = null
    }

    private fun startCountdown() {
        countdownJob?.cancel()
        if (!hasDeadline) { secondsLeft = null; return }
        countdownJob = scope.launch {
            while (isActive) {
                val left = ceil((deadline.toEpochMilli() - System.currentTimeMillis()) / 1000.0).toInt()
                secondsLeft = max(0, left)
                if (left <= 0 && phase is Phase.Waiting) {
                    pollJob?.cancel()
                    PendingEIDSession.forget()
                    phase = Phase.Expired
                    return@launch
                }
                delay(1000)
            }
        }
    }

    companion object {
        const val GAP_MS = 400L
        const val TOLERATED_FAILURES = 3
        const val BACKSTOP_SECONDS = 15L * 60
        const val APP_MISSING_NOTICE = "eID Mongolia апп энэ утсанд олдсонгүй. Регистрийн дугаараа оруулбал хүсэлт таны eID апп руу очно — өөр утсан дээр байсан ч болно."

        /**
         * Opens the eID app with the session's device link — only an installed
         * app that claims it, never a browser (iOS: universalLinksOnly). False
         * when no such app is here; the caller then offers the registration number.
         */
        fun openApp(context: Context, started: EIDStart): Boolean {
            val link = started.appLink ?: return false
            val uri = try { Uri.parse(link) } catch (e: Exception) { return false }
            val intent = Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (Build.VERSION.SDK_INT >= 30) {
                return try {
                    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_REQUIRE_NON_BROWSER))
                    true
                } catch (e: ActivityNotFoundException) {
                    false
                }
            }
            // Before Android 11: open only if something other than a browser handles the link.
            val pm = context.packageManager
            val browsers = pm.queryIntentActivities(Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")), PackageManager.MATCH_ALL)
                .map { it.activityInfo.packageName }.toSet()
            val handlers = pm.queryIntentActivities(intent, PackageManager.MATCH_ALL)
                .map { it.activityInfo.packageName }.filter { it !in browsers && it != context.packageName }
            if (handlers.isEmpty()) return false
            return try {
                context.startActivity(intent.setPackage(handlers.first()))
                true
            } catch (e: ActivityNotFoundException) {
                false
            }
        }

        private fun knownText(error: APIError): String? = ErrorText.known[error.serverMessage.trim().lowercase()]

        /** The server's own sentence when it is a known one, else by status. */
        fun startMessage(error: APIError): String = knownText(error) ?: when (error.status) {
            400 -> "Регистрийн дугаараа шалгаад дахин оролдоно уу."
            403 -> "Энэ системд нэвтрэх эрх олгогдоогүй байна. Салбартаа хандана уу."
            404 -> "Энэ регистрийн дугаартай eID бүртгэл олдсонгүй. eID Mongolia аппаа идэвхжүүлсэн эсэхээ шалгана уу."
            429 -> ErrorText.fallback(429)
            502, 503, 504 -> "eID Mongolia-тай холбогдож чадсангүй. Түр хүлээгээд дахин оролдоно уу."
            else -> error.message
        }

        fun pollMessage(error: APIError): String =
            knownText(error)?.takeIf { error.serverMessage.lowercase() != "unauthorized" } ?: when (error.status) {
                401 -> "eID баталгаажуулалт амжилтгүй боллоо. Дахин оролдоно уу."
                // "eid_session_other_device" is known above; any other 403 is a sign-in refused.
                403 -> "Энэ системд нэвтрэх эрх олгогдоогүй байна. Салбартаа хандана уу."
                404 -> "eID хүсэлтийн хугацаа дууслаа. Дахин эхлүүлнэ үү."
                502, 503, 504 -> "eID Mongolia-тай холбогдож чадсангүй. Түр хүлээгээд дахин оролдоно уу."
                else -> error.message
            }
    }
}

/**
 * The "this phone" eID session in flight, kept across a relaunch: Android
 * may end the app while the member is in the eID app, and the link that
 * brings them back must match a session started here.
 */
object PendingEIDSession {
    private const val ID_KEY = "eid.pendingSession"
    private const val AT_KEY = "eid.pendingSessionAt"
    private const val EXPIRES_KEY = "eid.pendingSessionExpires"
    /** Longer than any eID session lives (EIDLoginModel's backstop). */
    private const val LIFETIME_MS = 15L * 60 * 1000

    /** The id and the end: SharedPreferences in the app, memory in tests and fixtures. */
    var defaults: KeyValues = KeyValues.Memory()
    /**
     * The binding proves to the server that this app started the session; it
     * is a credential for the poll, so it is kept Keystore-encrypted like the
     * session token (iOS: the Keychain), not in plain preferences.
     */
    var bindingStore: TokenStore = TokenStore.inMemory()

    fun install(context: Context) {
        defaults = KeyValues.Prefs(context.getSharedPreferences("sdy.prefs", Context.MODE_PRIVATE))
        bindingStore = TokenStore.persistent(context, account = "eid_binding")
    }

    fun remember(id: String, binding: String? = null, expiresAt: String? = null) {
        defaults.putString(ID_KEY, id)
        defaults.putLong(AT_KEY, System.currentTimeMillis())
        if (!expiresAt.isNullOrEmpty()) defaults.putString(EXPIRES_KEY, expiresAt) else defaults.remove(EXPIRES_KEY)
        if (!binding.isNullOrEmpty()) bindingStore.save(binding) else bindingStore.clear()
    }

    fun matches(id: String): Boolean {
        if (id.isEmpty() || defaults.getString(ID_KEY) != id) return false
        return System.currentTimeMillis() - defaults.getLong(AT_KEY) < LIFETIME_MS
    }

    /** The session as this phone kept it, for the poll after a relaunch: its binding and its end. Null for any other session. */
    fun resumable(id: String): EIDStart? {
        if (!matches(id)) return null
        return EIDStart.resuming(id, binding = bindingStore.token, expiresAt = defaults.getString(EXPIRES_KEY))
    }

    fun forget() {
        defaults.remove(ID_KEY)
        defaults.remove(AT_KEY)
        defaults.remove(EXPIRES_KEY)
        bindingStore.clear()
    }
}

/** A few small values kept between launches (iOS UserDefaults). */
interface KeyValues {
    fun getString(key: String): String?
    fun getLong(key: String): Long
    fun putString(key: String, value: String)
    fun putLong(key: String, value: Long)
    fun remove(key: String)

    class Prefs(private val prefs: android.content.SharedPreferences) : KeyValues {
        override fun getString(key: String) = prefs.getString(key, null)
        override fun getLong(key: String) = prefs.getLong(key, 0)
        override fun putString(key: String, value: String) = prefs.edit().putString(key, value).apply()
        override fun putLong(key: String, value: Long) = prefs.edit().putLong(key, value).apply()
        override fun remove(key: String) = prefs.edit().remove(key).apply()
    }

    class Memory : KeyValues {
        private val values = java.util.concurrent.ConcurrentHashMap<String, Any>()
        override fun getString(key: String) = values[key] as? String
        override fun getLong(key: String) = values[key] as? Long ?: 0
        override fun putString(key: String, value: String) { values[key] = value }
        override fun putLong(key: String, value: Long) { values[key] = value }
        override fun remove(key: String) { values.remove(key) }
    }
}
