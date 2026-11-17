package mn.esdy.member.core

import java.util.UUID

/**
 * The next page added after this one, without rows already shown: a row
 * inserted on the server between two page loads shifts the offsets, and the
 * page after it would repeat the last row of this one (iOS appendingUnique).
 */
fun <T, K> List<T>.appendingUnique(page: List<T>, id: (T) -> K): List<T> {
    val seen = mapTo(HashSet()) { id(it) }
    val out = toMutableList()
    for (item in page) if (seen.add(id(item))) out.add(item)
    return out
}

/**
 * One idempotency key per thing the person means to do: the same while they
 * retry it — also after trying something else in between (A → B → A reuses
 * A's key) — and a new one for anything they have not sent before.
 */
class IntentKey {
    private val keys = HashMap<String, String>()

    fun key(fingerprint: String): String = keys.getOrPut(fingerprint) { UUID.randomUUID().toString() }

    /** After the server has recorded it: the next intent gets a new key. */
    fun reset() = keys.clear()
}

/**
 * /dues/mine and /dues/finance page charges and payments separately
 * (charges_offset / payments_offset); an older server pages both with one
 * offset. What to ask for next, either way (iOS DuesPaged).
 */
interface DuesPaged {
    val hasMore: Boolean
    val nextOffset: Int?
    val chargesHasMore: Boolean?
    val paymentsHasMore: Boolean?
    val nextChargesOffset: Int?
    val nextPaymentsOffset: Int?

    /** The query for the next page, given how many rows of each list are shown; null when both lists have run out. */
    fun nextPageQuery(chargesShown: Int, paymentsShown: Int): String? {
        if (!hasMore) return null
        if (chargesHasMore != null || paymentsHasMore != null) {
            val charges = if (chargesHasMore == true) nextChargesOffset ?: chargesShown else chargesShown
            val payments = if (paymentsHasMore == true) nextPaymentsOffset ?: paymentsShown else paymentsShown
            return "charges_offset=$charges&payments_offset=$payments"
        }
        return "offset=${nextOffset ?: maxOf(chargesShown, paymentsShown)}"
    }
}
