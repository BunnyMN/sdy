package mn.esdy.member.core

import java.io.IOException
import java.io.InterruptedIOException
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException

/**
 * Every failure the app can show. `message` is always Mongolian: raw server
 * text (English) is never put in front of a person — it is only used to pick
 * the right sentence.
 */
class APIError(
    val kind: Kind,
    /** Server text as received, for mapping and logs only. */
    val serverMessage: String = "",
    val code: String? = null,
) : Exception(serverMessage) {
    sealed interface Kind {
        data object Network : Kind
        data object Unauthorized : Kind
        data class Server(val status: Int) : Kind
        data object Decoding : Kind
        data object Cancelled : Kind
    }

    val status: Int get() = when (val k = kind) {
        is Kind.Server -> k.status
        Kind.Unauthorized -> 401
        else -> 0
    }
    val isNetwork: Boolean get() = kind == Kind.Network

    override val message: String get() = ErrorText.message(this)

    override fun equals(other: Any?): Boolean =
        other is APIError && other.kind == kind && other.serverMessage == serverMessage && other.code == code
    override fun hashCode(): Int = (kind.hashCode() * 31 + serverMessage.hashCode()) * 31 + (code?.hashCode() ?: 0)
    override fun toString(): String = "APIError($kind, $serverMessage, $code)"

    companion object {
        val network get() = APIError(Kind.Network)
        val decoding get() = APIError(Kind.Decoding)
        val cancelled get() = APIError(Kind.Cancelled)

        fun wrap(error: Throwable): APIError = when (error) {
            is APIError -> error
            is CancellationException -> cancelled
            is SerializationException, is IllegalArgumentException -> decoding
            is InterruptedIOException -> network
            is IOException -> if (error.message == "Canceled") cancelled else network
            else -> network
        }
    }
}

/** Mongolian sentences for the server's known answers, then by status. */
object ErrorText {
    const val network = "Холболт тасарсан. Интернэтээ шалгаад дахин оролдоно уу."

    /**
     * Exact server messages (lower-cased) → Mongolian. Taken from
     * backend/internal/apps/events, membership/dues.go and the auth handlers.
     */
    val known: Map<String, String> = mapOf(
        // check-in
        "the check-in code is invalid or expired" to "Ирцийн код хүчингүй эсвэл хугацаа нь дууссан байна. Зохион байгуулагчаас шинэ QR гаргуулна уу.",
        "invalid check-in code" to "Ирцийн код буруу байна. QR-ээ дахин уншуулна уу.",
        "register for an open event before checking in" to "Ирц бүртгүүлэхийн өмнө арга хэмжээнд бүртгүүлнэ үү.",
        // events
        "this event is full" to "Арга хэмжээний хүний тоо дүүрсэн байна.",
        "this event is not taking registrations" to "Энэ арга хэмжээнд бүртгэл хаагдсан байна.",
        "this event is not taking registration changes" to "Энэ арга хэмжээний бүртгэлийг өөрчлөх боломжгүй болсон.",
        "recorded attendance cannot be withdrawn" to "Ирц бүртгэгдсэн тул бүртгэлээ цуцлах боломжгүй.",
        "this event is cancelled" to "Энэ арга хэмжээ цуцлагдсан.",
        "this event is closed" to "Энэ арга хэмжээ хаагдсан.",
        "no such event" to "Арга хэмжээ олдсонгүй. Өөр салбарынх байж магадгүй.",
        "no such task" to "Ажил үүрэг олдсонгүй.",
        "no such motion" to "Хэлэлцэх асуудал олдсонгүй.",
        // discussion & votes
        "you have already voted on this issue" to "Та энэ асуудалд аль хэдийн санал өгсөн байна.",
        "this issue is not under vote" to "Энэ асуудлын санал хураалт явагдаагүй байна.",
        "only members whose attendance at this event was confirmed may vote" to "Санал өгөхийн тулд энэ арга хэмжээнд ирцээ баталгаажуулна уу.",
        "sign in with eid mongolia once so your vote can be signed" to "Санал зурахын тулд нэг удаа eID Mongolia-аар нэвтэрнэ үү.",
        "your eid identity is not linked" to "Таны eID бүртгэлтэй холбогдоогүй байна. eID-ээр нэвтэрч холбоно уу.",
        "the signature does not cover this vote" to "Гарын үсэг энэ саналтай таарсангүй. Дахин оролдоно уу.",
        "eid mongolia could not start the signature" to "eID Mongolia гарын үсэг эхлүүлж чадсангүй. Дахин оролдоно уу.",
        "could not reach eid mongolia" to "eID Mongolia-тай холбогдож чадсангүй. Дахин оролдоно уу.",
        "only members of this branch may raise an issue" to "Зөвхөн энэ салбарын гишүүд асуудал дэвшүүлнэ.",
        "only members of this branch may take a task" to "Зөвхөн энэ салбарын гишүүд ажил үүрэг авна.",
        "this event already has the most issues it can hold" to "Энэ арга хэмжээнд асуудал нэмэх хязгаар хүрсэн байна.",
        // dues
        "enter the amount and transfer reference" to "Дүн болон гүйлгээний утгаа оруулна уу.",
        "amount exceeds the balance left after the transfers already reported" to "Дүн нь мэдэгдсэн төлбөрүүдийн дараах үлдэгдлээс их байна.",
        "this payment reference is already recorded" to "Энэ гүйлгээний утга аль хэдийн бүртгэгдсэн байна.",
        "this submission is already recorded; refresh your payment history" to "Энэ мэдэгдэл аль хэдийн бүртгэгдсэн. Түүхээ шинэчилнэ үү.",
        "request key was used for a different payment" to "Мэдэгдлийг давхар илгээсэн байна. Цонхоо хаагаад дахин оролдоно уу.",
        "no such charge" to "Хураамж олдсонгүй.",
        "no unwaived charge with that id" to "Хураамж олдсонгүй эсвэл чөлөөлөгдсөн байна.",
        // auth
        "invalid credentials" to "Имэйл эсвэл нууц үг буруу байна.",
        "invalid email or password" to "Имэйл эсвэл нууц үг буруу байна.",
        "eid identity verification failed" to "eID баталгаажуулалт амжилтгүй боллоо.",
        "eid mongolia session check failed" to "eID Mongolia-тай холбогдож чадсангүй. Дахин оролдоно уу.",
        "session_id is required" to "eID хүсэлт олдсонгүй. Дахин эхлүүлнэ үү.",
        "invalid callback url" to "eID буцах хаяг буруу байна.",
        "unauthorized" to "Нэвтрэх хугацаа дууссан. Дахин нэвтэрнэ үү.",
        "forbidden" to "Энэ үйлдлийг хийх эрх танд алга.",
    )

    /** Codes the membership API answers with (components/MembershipTransfers.tsx). */
    val transferCodes: Map<String, String> = mapOf(
        "branch_transfer_required" to "Та өөр салбарт харьяалалтай байна. Шилжих хүсэлт илгээнэ үү.",
        "transfer_reason_required" to "Шилжих шалтгаанаа 1–500 тэмдэгтэд бичнэ үү.",
        "transfer_source_unavailable" to "Одоогийн харьяалал олдсонгүй. Шинэчилнэ үү.",
        "transfer_destination_unavailable" to "Очих байгууллага одоогоор боломжгүй байна.",
        "transfer_already_member" to "Та уг байгууллагын гишүүн байна.",
        "transfer_already_pending" to "Өөр шилжих хүсэлт шийдвэр хүлээж байна.",
        "transfer_not_pending" to "Энэ хүсэлт аль хэдийн шийдвэрлэгдсэн эсвэл цуцлагдсан. Шинэчилнэ үү.",
        "transfer_not_found" to "Хүсэлт олдсонгүй.",
        "transfer_source_changed" to "Таны харьяалал өөрчлөгдсөн. Шинэ хүсэлт шаардлагатай.",
        "transfer_organisation_unavailable" to "Холбогдох байгууллага идэвхгүй болсон байна.",
        "transfer_last_admin" to "Өмнөх байгууллагад өөр идэвхтэй админ томилсны дараа шилжинэ.",
        "transfer_member_role_unavailable" to "Очих байгууллагын гишүүний эрх тохируулагдаагүй байна.",
        "transfer_not_authorized" to "Энэ хүсэлтийг гаргах эрхгүй байна.",
    )

    fun message(error: APIError): String = when (val k = error.kind) {
        APIError.Kind.Network -> network
        APIError.Kind.Cancelled -> "Үйлдэл цуцлагдлаа."
        APIError.Kind.Decoding -> "Серверийн хариуг уншиж чадсангүй. Аппаа шинэчилнэ үү."
        APIError.Kind.Unauthorized -> "Нэвтрэх хугацаа дууссан. Дахин нэвтэрнэ үү."
        is APIError.Kind.Server -> {
            val raw = error.serverMessage.trim()
            error.code?.let { transferCodes[it] }
                ?: transferCodes[raw]
                ?: known[raw.lowercase()]
                ?: if (raw.startsWith("transfer_")) "Үйлдлийг гүйцэтгэж чадсангүй. Шинэчлээд дахин оролдоно уу." else fallback(k.status)
        }
    }

    fun fallback(status: Int): String = when (status) {
        400, 422 -> "Оруулсан мэдээлэл буруу байна. Шалгаад дахин оролдоно уу."
        401 -> "Нэвтрэх хугацаа дууссан. Дахин нэвтэрнэ үү."
        403 -> "Энэ үйлдлийг хийх эрх танд алга."
        404 -> "Хайсан мэдээлэл олдсонгүй."
        409 -> "Мэдээлэл өөрчлөгдсөн байна. Шинэчлээд дахин оролдоно уу."
        413 -> "Илгээсэн мэдээлэл хэт урт байна."
        429 -> "Хэт олон оролдлого хийлээ. Түр хүлээгээд дахин оролдоно уу."
        502, 503, 504 -> "Үйлчилгээ түр ажиллахгүй байна. Хэсэг хугацааны дараа дахин оролдоно уу."
        in 500..599 -> "Серверт алдаа гарлаа. Дараа дахин оролдоно уу."
        else -> "Үйлдлийг гүйцэтгэж чадсангүй. Дахин оролдоно уу."
    }
}
