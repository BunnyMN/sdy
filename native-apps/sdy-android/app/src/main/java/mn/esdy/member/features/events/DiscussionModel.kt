package mn.esdy.member.features.events

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.time.Instant
import kotlin.math.ceil
import kotlin.math.max
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import mn.esdy.member.core.APIClient
import mn.esdy.member.core.APIError
import mn.esdy.member.core.Haptics
import mn.esdy.member.core.block
import mn.esdy.member.core.motions
import mn.esdy.member.core.pollVote
import mn.esdy.member.core.propose
import mn.esdy.member.core.reportMotion
import mn.esdy.member.core.vote
import mn.esdy.member.models.Motion
import mn.esdy.member.models.MotionList

/** Discussion and eID-signed votes on one event (components/events/EventDiscussion.tsx). */
@Stable
class DiscussionModel(
    val eventID: String,
    private val api: APIClient,
    private val context: Context,
    private val scope: CoroutineScope,
) {
    enum class SigningPhase { Starting, Waiting, Done, Failed }

    data class Signing(
        val motion: Motion,
        val choice: String,
        val code: String = "",
        val sessionID: String = "",
        val appLink: String? = null,
        val phase: SigningPhase = SigningPhase.Starting,
        val message: String? = null,
        val points: Double? = null,
        val deadline: Instant = Instant.now().plusSeconds(POLL_FOR_SECONDS),
    )

    var data by mutableStateOf<MotionList?>(null)
    var loadError by mutableStateOf<APIError?>(null)
    var actionError by mutableStateOf<String?>(null)
    var signing by mutableStateOf<Signing?>(null)
    var secondsLeft by mutableIntStateOf(0)
    var busy by mutableStateOf(false)
    private var watchJob: Job? = null
    private var timerJob: Job? = null
    private var resumedOnce = false

    suspend fun load() {
        try {
            data = api.motions(eventID)
            loadError = null
            resumePendingVote()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            loadError = APIError.wrap(e)
        }
    }

    fun reload() { scope.launch { load() } }

    /**
     * A vote left "signing" — the eID app was opened and the app came back —
     * is picked up once, by asking about the member's own vote.
     */
    private fun resumePendingVote() {
        if (resumedOnce || signing != null) return
        val data = data ?: return
        val pending = data.motions.firstOrNull { it.status == "voting" && it.myVote?.status == "signing" } ?: return
        val vote = pending.myVote ?: return
        resumedOnce = true
        signing = Signing(motion = pending, choice = vote.choice, phase = SigningPhase.Waiting)
        watch()
    }

    fun vote(motion: Motion, choice: String) {
        actionError = null
        // This vote is followed here; a later load must not reopen it as one
        // left behind (resumePendingVote), e.g. after the member cancels.
        resumedOnce = true
        signing = Signing(motion = motion, choice = choice, phase = SigningPhase.Starting)
        watchJob?.cancel()
        watchJob = scope.launch {
            val started = try {
                api.vote(eventID, motion.id, choice)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                signing = signing?.copy(phase = SigningPhase.Failed, message = APIError.wrap(e).message)
                Haptics.error()
                return@launch
            }
            // The sheet may have been closed while this was in flight.
            if (signing == null) return@launch
            signing = signing?.copy(
                code = started.verificationCode, sessionID = started.sessionId, appLink = started.appLink,
                phase = SigningPhase.Waiting, deadline = Instant.now().plusSeconds(POLL_FOR_SECONDS),
            )
            startTimer()
            started.appLink?.let { openLink(context, it) }
            pollLoop()
        }
    }

    private fun watch() {
        watchJob?.cancel()
        startTimer()
        watchJob = scope.launch { pollLoop() }
    }

    /** Restarts a waiting poll immediately (app returned to the foreground). */
    fun resume() {
        if (signing?.phase != SigningPhase.Waiting) return
        watch()
    }

    private suspend fun pollLoop() {
        var failures = 0
        while (scope.isActive) {
            val current = signing ?: return
            if (current.phase != SigningPhase.Waiting) return
            if (Instant.now() >= current.deadline) {
                signing = signing?.copy(phase = SigningPhase.Failed, message = "Хугацаа дууслаа. Санал тань зурагдаагүй тул дахин оролдоно уу.")
                stopTimer()
                return
            }
            delay(POLL_EVERY_MS)
            try {
                val result = api.pollVote(eventID, current.motion.id, current.sessionID)
                failures = 0
                when (result.state) {
                    "signed" -> {
                        signing = signing?.copy(phase = SigningPhase.Done, points = result.points)
                        stopTimer()
                        Haptics.success()
                        load()
                        return
                    }
                    "failed" -> {
                        signing = signing?.copy(phase = SigningPhase.Failed, message = reasonText(result.reason))
                        stopTimer()
                        Haptics.error()
                        load()
                        return
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                val wrapped = APIError.wrap(e)
                if (wrapped.kind == APIError.Kind.Cancelled) return
                failures += 1
                if (!wrapped.isNetwork || failures > TOLERATED_FAILURES) {
                    signing = signing?.copy(phase = SigningPhase.Failed, message = wrapped.message)
                    stopTimer()
                    load()
                    return
                }
            }
        }
    }

    fun cancelSigning() {
        watchJob?.cancel()
        watchJob = null
        stopTimer()
        signing = null
        reload()
    }

    /** Reports another member's issue to the event's organiser. */
    suspend fun report(motion: Motion, reason: String) {
        actionError = null
        try {
            api.reportMotion(eventID, motion.id, reason)
            Haptics.success()
            load()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            actionError = APIError.wrap(e).message
        }
    }

    /** Stops showing what this member raises; undone from Профайл. */
    suspend fun block(motion: Motion) {
        actionError = null
        try {
            api.block(motion.proposerId)
            Haptics.success()
            load()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            actionError = APIError.wrap(e).message
        }
    }

    /**
     * The signing sheet went away, however it was closed: nothing may keep
     * polling, ticking or opening the eID app behind it.
     */
    fun signingSheetDismissed() {
        watchJob?.cancel()
        watchJob = null
        stopTimer()
    }

    suspend fun propose(title: String, body: String): Boolean {
        busy = true
        try {
            api.propose(eventID, title, body)
            load()
            return true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            actionError = APIError.wrap(e).message
            return false
        } finally {
            busy = false
        }
    }

    private fun startTimer() {
        timerJob?.cancel()
        timerJob = scope.launch {
            while (isActive) {
                val s = signing ?: break
                secondsLeft = max(0, ceil((s.deadline.toEpochMilli() - System.currentTimeMillis()) / 1000.0).toInt())
                delay(1000)
            }
        }
    }

    private fun stopTimer() {
        timerJob?.cancel()
        timerJob = null
    }

    companion object {
        const val POLL_EVERY_MS = 2_000L
        const val POLL_FOR_SECONDS = 3L * 60
        const val TOLERATED_FAILURES = 3

        fun reasonText(reason: String?): String {
            val r = (reason ?: "").lowercase()
            if ("expire" in r || "timeout" in r) return "eID хүсэлтийн хугацаа дууслаа. Санал тань зурагдаагүй."
            if ("refus" in r || "reject" in r || "cancel" in r) return "Та eID апп дээр татгалзсан тул санал зурагдсангүй."
            if ("cover" in r || "mismatch" in r) return "Гарын үсэг энэ саналтай таарсангүй. Дахин оролдоно уу."
            return "Гарын үсэг зурагдсангүй. Дахин оролдоно уу."
        }

        /** Opens eID's link (the eID app when installed — iOS UIApplication.open). */
        fun openLink(context: Context, link: String) {
            try {
                context.startActivity(
                    Intent(Intent.ACTION_VIEW, Uri.parse(link)).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            } catch (_: Exception) {}
        }
    }
}
