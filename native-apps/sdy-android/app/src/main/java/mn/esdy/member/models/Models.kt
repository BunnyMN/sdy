@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package mn.esdy.member.models

import java.time.Instant
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNamingStrategy
import mn.esdy.member.core.Formatters

// Mirrors of the TypeScript types in frontend/lib/api/{client,member,events,dues}.ts
// and of the iOS app's Models.swift. snake_case on the wire: `my_status` → `myStatus`.
//
// Every list, flag, text and number has a default: the Go API may send `null`
// (a nil slice) or leave a field out, and `coerceInputValues` turns that null
// into the default, so one missing array never blanks a screen (iOS:
// DefaultEmpty / DefaultFalse / DefaultText / DefaultZero).

val ApiJson = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    explicitNulls = false
    isLenient = true
    namingStrategy = JsonNamingStrategy.SnakeCase
}

// region Auth & identity

@Serializable
data class Me(
    val id: String,
    val tenantId: String = "",
    val tenantName: String = "",
    val workspaceKind: String? = null,
    val name: String = "",
    val email: String = "",
    val isAdmin: Boolean = false,
    val permissions: List<String> = emptyList(),
)

@Serializable
data class Organisation(val id: String, val name: String = "", val slug: String = "")

@Serializable
data class Profile(
    val id: String,
    val name: String = "",
    val email: String = "",
    val organisations: List<Organisation> = emptyList(),
    val home: Organisation? = null,
)

@Serializable
data class Branch(val slug: String, val name: String = "", val parentSlug: String? = null) {
    val id: String get() = slug
}

@Serializable
data class BranchesResponse(val branches: List<Branch> = emptyList())

@Serializable
data class Tenant(val id: String, val name: String = "", val slug: String = "", val kind: String? = null)

@Serializable
data class TenantsResponse(
    val current: String = "",
    val tenants: List<Tenant> = emptyList(),
    val active: List<String> = emptyList(),
)

@Serializable
data class SwitchTenantResponse(val tenantId: String = "", val switched: Boolean = false, val expiresAt: String? = null)

@Serializable
data class LoginResponse(val expiresAt: String? = null, val sessionToken: String? = null)

@Serializable
data class EIDStart(
    val sessionId: String,
    val deviceLinkUrl: String? = null,
    val qrLinks: List<String> = emptyList(),
    val appLink: String? = null,
    val verificationCode: String = "",
    val expiresAt: String? = null,
    /** Ties the session to this app; sent back with every poll. */
    val binding: String? = null,
) {
    companion object {
        /** A session known only by its id (the app was reopened by eID's link). */
        fun resuming(id: String) = EIDStart(sessionId = id)
    }
}

@Serializable
data class EIDPoll(val state: String, val expiresAt: String? = null, val sessionToken: String? = null)

// endregion

// region Membership

@Serializable
data class Affiliation(
    val tenantId: String,
    val name: String = "",
    val slug: String = "",
    val isPrimary: Boolean = false,
    val status: String = "",
    val memberSince: String? = null,
    val hasAccess: Boolean = false,
    /** Албан тушаал (chair, board…); older servers send none. */
    val position: String? = null,
) {
    val id: String get() = tenantId
}

@Serializable
data class MemberProfile(
    val phone: String = "",
    val residence: String = "",
    val notificationsEnabled: Boolean = false,
) {
    val body: Map<String, Any?> get() = mapOf("phone" to phone, "residence" to residence, "notifications_enabled" to notificationsEnabled)
}

@Serializable
data class MemberHistory(
    val id: String,
    val tenantId: String = "",
    val branch: String = "",
    val fromStatus: String = "",
    val status: String = "",
    val reason: String = "",
    val createdAt: String = "",
)

@Serializable
data class MemberRecord(
    val memberships: List<Affiliation> = emptyList(),
    val profile: MemberProfile,
    val history: List<MemberHistory> = emptyList(),
    val hasMore: Boolean = false,
    val nextOffset: Int? = null,
) {
    /** An approved branch: a primary, active membership. */
    val approvedBranch: Affiliation? get() = memberships.firstOrNull { it.isPrimary && it.status == "active" }
    val hasPrimary: Boolean get() = memberships.any { it.isPrimary }
}

@Serializable
data class MyItem(
    val id: String,
    val sourceApp: String = "",
    val sourceRef: String = "",
    val provider: String = "",
    val code: String = "",
    val status: String = "",
    val answer: String = "",
    val openedAt: String = "",
    val updatedAt: String = "",
)

@Serializable
data class MyItemsResponse(val items: List<MyItem> = emptyList())

@Serializable
data class JoinResponse(
    val ok: Boolean = false,
    val joined: Boolean = false,
    val workspaceId: String? = null,
    val workspaceName: String? = null,
)

@Serializable
data class MembershipTransfer(
    val id: String,
    val fromTenantId: String = "",
    val fromName: String = "",
    val tenantId: String = "",
    val toName: String = "",
    val message: String = "",
    val status: String = "",
    val createdAt: String = "",
    val decidedAt: String? = null,
)

@Serializable
data class TransfersResponse(val requests: List<MembershipTransfer> = emptyList())

@Serializable
data class MemberNotification(
    val id: String,
    val kind: String = "",
    val title: String = "",
    val body: String = "",
    val path: String = "",
    val createdAt: String = "",
    val readAt: String? = null,
) {
    val isRead: Boolean get() = readAt != null
}

@Serializable
data class NotificationsPage(
    val items: List<MemberNotification> = emptyList(),
    val unread: Int? = null,
    val hasMore: Boolean = false,
    val nextOffset: Int? = null,
)

@Serializable
data class PersonalDuesHistory(
    val charges: List<ChargeLine> = emptyList(),
    val payments: List<PaymentLine> = emptyList(),
    val hasMore: Boolean = false,
    val nextOffset: Int? = null,
) {
    @Serializable
    data class ChargeLine(
        val id: String,
        val tenantId: String = "",
        val branch: String = "",
        val period: String = "",
        val amount: Double = 0.0,
        val paid: Double = 0.0,
        val balance: Double = 0.0,
        val waived: Boolean = false,
    )

    @Serializable
    data class PaymentLine(
        val id: String,
        val branch: String = "",
        val amount: Double = 0.0,
        val status: String = "",
        val reference: String = "",
        val reviewNote: String = "",
        val createdAt: String = "",
    )
}

@Serializable
data class PersonalParticipationHistory(
    val items: List<Item> = emptyList(),
    val entries: List<Entry> = emptyList(),
    val totalPoints: Double = 0.0,
    val hasMore: Boolean = false,
    val nextOffset: Int? = null,
) {
    @Serializable
    data class Item(
        val id: String,
        val branch: String = "",
        val title: String = "",
        val startsAt: String = "",
        val status: String = "",
        val points: Double = 0.0,
    )

    @Serializable
    data class Entry(
        val id: String,
        val branch: String = "",
        val title: String = "",
        val delta: Double = 0.0,
        val reason: String = "",
        val createdAt: String = "",
    )
}

@Serializable
data class DeletionStatus(
    /** none | pending | cancelled | completed. "pending" while the 30-day grace runs. */
    val status: String? = null,
    val requestedAt: String? = null,
    val deleteAfter: String? = null,
    val scheduledFor: String? = null,
    val purgeAt: String? = null,
    val graceDays: Int? = null,
) {
    val isPending: Boolean get() = (status ?: "").lowercase() == "pending"
    val deadline: String? get() = scheduledFor ?: deleteAfter ?: purgeAt
}

// endregion

// region Events

@Serializable
data class EventRecord(
    val id: String,
    val title: String = "",
    val description: String = "",
    val location: String = "",
    val startsAt: String = "",
    val endsAt: String? = null,
    val capacity: Int? = null,
    val status: String = "",
    val registered: Double = 0.0,
    val attended: Double = 0.0,
    val myStatus: String = "",
    val pointsValue: Double? = null,
    val votePoints: Double? = null,
) {
    val registeredCount: Int get() = registered.toInt()
    val attendedCount: Int get() = attended.toInt()
    val isFull: Boolean get() = capacity?.let { registeredCount >= it } ?: false
    val isOpen: Boolean get() = status == "planned"
    val startDate: Instant? get() = Formatters.parseDate(startsAt)
    val isUpcoming: Boolean get() = (startDate ?: Instant.MIN) >= Instant.now()

    /** "12/50 бүртгүүлсэн · 3 ирсэн" */
    val capacityText: String
        get() {
            val reg = capacity?.let { "$registeredCount/$it" } ?: "$registeredCount"
            return "$reg бүртгүүлсэн · $attendedCount ирсэн"
        }
}

@Serializable
data class EventsResponse(val events: List<EventRecord> = emptyList())

@Serializable
data class ActionResult(val status: String = "", val changed: Boolean = false, val points: Double? = null)

@Serializable
data class Participant(val userId: String, val name: String = "", val email: String = "", val status: String = "") {
    val id: String get() = userId
}

@Serializable
data class ParticipantsResponse(val participants: List<Participant> = emptyList())

@Serializable
data class MyEventsPage(
    val items: List<Item> = emptyList(),
    val hasMore: Boolean = false,
    val nextOffset: Int? = null,
) {
    @Serializable
    data class Item(
        val eventId: String,
        val title: String = "",
        val startsAt: String = "",
        val status: String = "",
        val points: Double = 0.0,
    ) {
        val id: String get() = eventId
    }
}

@Serializable
data class PointsPage(
    val total: Double = 0.0,
    val entries: List<Entry> = emptyList(),
    val hasMore: Boolean = false,
    val nextOffset: Int? = null,
) {
    @Serializable
    data class Entry(
        val id: String,
        val eventId: String = "",
        val title: String = "",
        val delta: Double = 0.0,
        val reason: String = "",
        val createdAt: String = "",
    )
}

@Serializable
data class MyVote(val choice: String = "", val status: String = "")

@Serializable
data class Motion(
    val id: String,
    val eventId: String = "",
    val title: String = "",
    val body: String = "",
    val proposerId: String = "",
    val proposerName: String = "",
    val status: String = "",
    val result: String = "",
    val yes: Double = 0.0,
    val no: Double = 0.0,
    val abstain: Double = 0.0,
    val createdAt: String = "",
    val myVote: MyVote? = null,
    val reportedByMe: Boolean = false,
    /** Open reports; the server sends it to managers only. */
    val reportCount: Double = 0.0,
) {
    /** proposed | voting | approved | rejected | withdrawn */
    val displayStatus: String get() = if (status == "decided") result else status
    val counted: Int get() = (yes + no + abstain).toInt()
    val signedMine: Boolean get() = myVote?.status == "signed"
}

/** A member the signed-in person has blocked in the discussion. */
@Serializable
data class BlockedMember(val userId: String, val name: String = "", val blockedAt: String = "") {
    val id: String get() = userId
}

@Serializable
data class BlockedList(val blocked: List<BlockedMember> = emptyList())

@Serializable
data class MotionList(
    val motions: List<Motion> = emptyList(),
    val eligible: Int? = null,
    val canVote: Boolean = false,
    val signingReady: Boolean = false,
    val votePoints: Double? = null,
    val canManage: Boolean = false,
    val eventStatus: String = "",
    val me: String = "",
) {
    fun needsMyVote(motion: Motion): Boolean =
        motion.status == "voting" && canVote && signingReady && !motion.signedMine
}

@Serializable
data class VoteStart(
    val sessionId: String,
    val verificationCode: String = "",
    val appLink: String? = null,
    val state: String = "",
)

@Serializable
data class VotePoll(val state: String, val reason: String? = null, val points: Double? = null)

@Serializable
data class TaskAssignment(
    val userId: String,
    val name: String = "",
    val status: String = "",
    val volunteered: Boolean = false,
    val pointsAwarded: Double = 0.0,
) {
    val id: String get() = userId
}

@Serializable
data class EventTask(
    val id: String,
    val eventId: String = "",
    val title: String = "",
    val description: String = "",
    val points: Double = 0.0,
    val slots: Int,
    val taken: Int,
    val assignments: List<TaskAssignment> = emptyList(),
) {
    val isFree: Boolean get() = taken < slots
    fun mine(me: String): TaskAssignment? = assignments.firstOrNull { it.userId == me }
}

@Serializable
data class TasksResponse(val tasks: List<EventTask> = emptyList(), val canManage: Boolean = false, val me: String = "")

@Serializable
data class Standing(
    val rank: Int,
    val userId: String,
    val name: String = "",
    val points: Double = 0.0,
    val attended: Double = 0.0,
    val tasks: Double = 0.0,
    val votes: Double = 0.0,
) {
    val id: String get() = userId
}

@Serializable
data class Leaderboard(val period: String = "", val standings: List<Standing> = emptyList(), val me: Standing? = null)

// endregion

// region Dues

@Serializable
data class DuesSettings(
    val enabled: Boolean = false,
    val monthlyAmount: Double = 0.0,
    val dueDay: Int? = null,
    val bankName: String = "",
    val accountNumber: String = "",
    val accountHolder: String = "",
    val instructions: String = "",
)

@Serializable
data class Charge(
    val id: String,
    val period: String = "",
    val amount: Double = 0.0,
    val paid: Double = 0.0,
    val balance: Double = 0.0,
    val dueDate: String = "",
    val waived: Boolean = false,
    val waiverReason: String = "",
    val pending: Double? = null,
) {
    /** What can still be reported: the balance minus transfers awaiting review. */
    val reportable: Double get() = max(0.0, balance - (pending ?: 0.0))

    fun isOverdue(now: Instant = Instant.now()): Boolean {
        if (waived || balance <= 0) return false
        val due = Formatters.parseDay(dueDate) ?: return false
        return Formatters.startOfDay(now) > due
    }
}

@Serializable
data class Payment(
    val id: String,
    val chargeId: String = "",
    val amount: Double = 0.0,
    val reference: String = "",
    val status: String = "",
    val reviewNote: String = "",
    val createdAt: String = "",
)

@Serializable
data class MyDuesTotals(
    val charged: Double = 0.0,
    val paid: Double = 0.0,
    val pending: Double = 0.0,
    val outstanding: Double = 0.0,
    val waived: Double = 0.0,
) {
    val owed: Double get() = max(0.0, charged - waived)
    val paidPercent: Int get() = DuesMath.percent(paid, owed)
}

@Serializable
data class MyDuesPage(
    val charges: List<Charge> = emptyList(),
    val payments: List<Payment> = emptyList(),
    val hasMore: Boolean = false,
    val nextOffset: Int? = null,
    val totals: MyDuesTotals? = null,
)

@Serializable
data class ReportResult(val id: String? = null, val changed: Boolean = false)

object DuesMath {
    fun percent(part: Double, whole: Double): Int {
        if (whole <= 0) return if (part > 0) 100 else 0
        return max(0, min(100, floor(part / whole * 100).toInt()))
    }

    /** The next transfer when what is left is paid in `parts` equal transfers. */
    fun partAmount(left: Double, parts: Int): Double {
        if (left <= 0) return 0.0
        return kotlin.math.ceil(left / max(1, parts).toDouble())
    }

    fun partChoices(left: Double, max: Int = 4): List<Int> = (1..max).filter { it == 1 || left >= it.toDouble() }
}

// endregion

/** An answer with no body we care about. */
@Serializable
class EmptyResponse
