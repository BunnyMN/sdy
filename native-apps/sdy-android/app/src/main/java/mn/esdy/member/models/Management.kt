package mn.esdy.member.models

import java.time.Duration
import java.time.Instant
import java.time.format.DateTimeFormatter
import kotlinx.serialization.Serializable
import mn.esdy.member.core.Formatters

// What the branch's officers work with (web: app/member/members, sanctions,
// finance, module/events). The server decides who may do what; the app only
// shows what the signed-in person's permissions allow.

object Permission {
    const val manageEvents = "events.manage"
    const val discipline = "events.discipline"
    const val manageMembers = "membership.manage"
    const val finance = "membership.finance"
}

@Serializable
data class PositionPolicy(
    val canAssign: Boolean = false,
    val canAssignChair: Boolean = false,
    val canSetSeats: Boolean = false,
    val auditorSeats: Double = 0.0,
    val auditors: Double = 0.0,
)

@Serializable
data class ManagedMember(
    val userId: String,
    val name: String = "",
    val email: String = "",
    val status: String = "",
    val isPrimary: Boolean = false,
    val hasAccess: Boolean = false,
    val position: String? = null,
) {
    val id: String get() = userId
    val positionValue: String get() = position ?: "member"
}

@Serializable
data class ManagedMembers(val members: List<ManagedMember> = emptyList(), val hasMore: Boolean = false, val nextOffset: Int? = null)

@Serializable
data class Sanction(
    val id: String,
    val userId: String = "",
    val userName: String = "",
    val actorName: String = "",
    val eventId: String? = null,
    val eventTitle: String = "",
    val points: Double = 0.0,
    val reason: String = "",
    val createdAt: String = "",
)

@Serializable
data class SanctionList(val sanctions: List<Sanction> = emptyList(), val hasMore: Boolean = false, val nextOffset: Int? = null)

@Serializable
data class BranchPerson(val userId: String, val name: String = "", val email: String = "") {
    val id: String get() = userId
}

@Serializable
data class BranchPeople(val members: List<BranchPerson> = emptyList())

@Serializable
data class FinanceCharge(
    val id: String,
    val name: String = "",
    val period: String = "",
    val amount: Double = 0.0,
    val paid: Double = 0.0,
    val balance: Double = 0.0,
    val pending: Double = 0.0,
    val waived: Boolean = false,
    val waiverReason: String = "",
)

@Serializable
data class FinancePayment(
    val id: String,
    val name: String = "",
    val amount: Double = 0.0,
    val reference: String = "",
    val status: String = "",
    val reviewNote: String = "",
    val createdAt: String = "",
)

@Serializable
data class FinanceOverview(
    val charges: List<FinanceCharge> = emptyList(),
    val payments: List<FinancePayment> = emptyList(),
    val totals: Totals? = null,
    val hasMore: Boolean = false,
    val nextOffset: Int? = null,
) {
    @Serializable
    data class Totals(val charged: Double = 0.0, val received: Double = 0.0, val outstanding: Double = 0.0, val waived: Double = 0.0)
}

@Serializable
data class IssuedCheckin(val token: String, val expiresAt: String = "")

/** What the event form sends (backend eventInput). */
data class EventDraft(
    val title: String = "",
    val description: String = "",
    val location: String = "",
    val startsAt: Instant = Instant.now().plus(Duration.ofHours(24)),
    val hasEnd: Boolean = true,
    val endsAt: Instant = Instant.now().plus(Duration.ofHours(26)),
    val capacity: String = "",
    val status: String = "planned",
    val pointsValue: String = "10",
    val votePoints: String = "0",
) {
    val body: Map<String, Any?>
        get() {
            val iso = DateTimeFormatter.ISO_INSTANT
            val out = mutableMapOf<String, Any?>(
                "title" to title.trim(),
                "description" to description.trim(),
                "location" to location.trim(),
                "starts_at" to iso.format(startsAt.withNano(0)),
                "status" to status,
                "points_value" to (pointsValue.toIntOrNull() ?: 0),
                "vote_points" to (votePoints.toIntOrNull() ?: 0),
            )
            if (hasEnd) out["ends_at"] = iso.format(endsAt.withNano(0))
            capacity.toIntOrNull()?.takeIf { it > 0 }?.let { out["capacity"] = it }
            return out
        }

    val isValid: Boolean
        get() = title.isNotBlank() && (!hasEnd || endsAt > startsAt) &&
            (capacity.isEmpty() || (capacity.toIntOrNull() ?: 0) > 0) &&
            (pointsValue.toIntOrNull() ?: -1) in 0..100_000 && (votePoints.toIntOrNull() ?: -1) in 0..100_000

    companion object {
        fun from(event: EventRecord): EventDraft {
            val start = event.startDate ?: Instant.now()
            val end = Formatters.parseDate(event.endsAt)
            return EventDraft(
                title = event.title,
                description = event.description,
                location = event.location,
                startsAt = start,
                hasEnd = end != null,
                endsAt = end ?: start.plus(Duration.ofHours(2)),
                capacity = event.capacity?.toString() ?: "",
                status = event.status.ifEmpty { "planned" },
                pointsValue = (event.pointsValue ?: 0.0).toInt().toString(),
                votePoints = (event.votePoints ?: 0.0).toInt().toString(),
            )
        }
    }
}

private fun Instant.withNano(n: Int): Instant = Instant.ofEpochSecond(epochSecond, n.toLong())
