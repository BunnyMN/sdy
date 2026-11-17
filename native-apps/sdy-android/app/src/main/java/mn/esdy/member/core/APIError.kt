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
    /** Worth asking again: no connection, or a gateway between here and eID that failed once (502/503/504). */
    val isTransient: Boolean get() = isNetwork || status in setOf(502, 503, 504)

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
        "this event is not open" to "Энэ арга хэмжээ нээлттэй биш байна.",
        "capacity is below the number of participants" to "Хүний тоо одоо бүртгүүлсэн оролцогчдоос цөөн байж болохгүй.",
        "points cannot change after attendance has been recorded" to "Ирц бүртгэгдсэний дараа оноог өөрчлөх боломжгүй.",
        "that person is not on this event's list" to "Энэ хүн арга хэмжээний жагсаалтад алга. Шинэчилнэ үү.",
        "that person is not a member of this organisation" to "Энэ хүн салбарын гишүүн биш байна.",
        "that person is not a member of this branch" to "Энэ хүн салбарын гишүүн биш байна.",
        "provide a reason for the attendance correction" to "Ирц залруулах шалтгаанаа бичнэ үү.",
        "note is too long" to "Тайлбар хэт урт байна.",
        "title is required" to "Нэрээ бичнэ үү.",
        "title is too long" to "Нэр хэт урт байна.",
        "description is too long" to "Тайлбар хэт урт байна.",
        "location is too long" to "Байршил хэт урт байна.",
        "ends_at is before starts_at" to "Дуусах цаг эхлэх цагаас өмнө байна.",
        "capacity must be a positive number" to "Хүний тоо эерэг тоо байна.",
        // self-actions, cancelled events, check-in window (backend PR #46)
        "you cannot check in with a check-in code you issued" to "Өөрийн гаргасан QR кодоор ирцээ бүртгэх боломжгүй. Өөр зохион байгуулагчийн кодыг уншуулна уу.",
        "check-in is open from 2 hours before the event starts until 2 hours after it ends" to "Ирц арга хэмжээ эхлэхээс 2 цагийн өмнөөс дууссанаас хойш 2 цаг хүртэл бүртгэгдэнэ.",
        "you cannot change the exemption of your own charge" to "Өөрийнхөө хураамжийн чөлөөлөлтийг өөрөө өөрчлөх боломжгүй. Өөр санхүүчид хандана уу.",
        "this charge has a pending payment report; approve or reject it before exempting the charge" to "Энэ хураамжид хүлээгдэж буй төлбөрийн мэдэгдэл байна. Чөлөөлөхийн өмнө төлбөрийг батлах эсвэл татгалзана уу.",
        "this idempotency-key was already used for a different decision" to "Шийдвэрийг өөр утгатайгаар давхар илгээсэн байна. Цонхоо хаагаад дахин оролдоно уу.",
        "idempotency-key must be a uuid" to "Шийдвэрийн түлхүүр буруу байна. Аппаа шинэчилнэ үү.",
        "no waived charge with that id" to "Хураамж олдсонгүй эсвэл чөлөөлөгдөөгүй байна.",
        "provide the reason for withdrawing the exemption" to "Чөлөөлөлтийг буцаах шалтгаанаа бичнэ үү.",
        "you cannot record your own attendance" to "Өөрийнхөө ирц, оноог өөрөө батлах боломжгүй. Өөр зохион байгуулагчид хандана уу.",
        "you cannot change your own attendance" to "Өөрийнхөө ирц, оноог өөрөө батлах боломжгүй. Өөр зохион байгуулагчид хандана уу.",
        "you cannot award points to yourself" to "Өөртөө оноо олгох боломжгүй. Өөр зохион байгуулагчид хандана уу.",
        "you cannot confirm your own task" to "Өөрийнхөө ажлыг өөрөө батлах боломжгүй.",
        "you cannot confirm your own work" to "Өөрийнхөө ажлыг өөрөө батлах боломжгүй.",
        "you cannot review your own payment" to "Өөрийнхөө төлбөрийг өөрөө батлах боломжгүй. Өөр санхүүчид хандана уу.",
        "you cannot approve your own payment" to "Өөрийнхөө төлбөрийг өөрөө батлах боломжгүй. Өөр санхүүчид хандана уу.",
        "you cannot waive your own dues" to "Өөрийнхөө хураамжийг өөрөө чөлөөлөх боломжгүй. Өөр санхүүчид хандана уу.",
        "you cannot waive your own charge" to "Өөрийнхөө хураамжийг өөрөө чөлөөлөх боломжгүй. Өөр санхүүчид хандана уу.",
        "a charge with a pending payment cannot be waived" to "Хүлээгдэж буй төлбөртэй хураамжийг чөлөөлөх боломжгүй. Эхлээд төлбөрийг батлах эсвэл татгалзана уу.",
        "this charge has a pending payment" to "Хүлээгдэж буй төлбөртэй хураамжийг чөлөөлөх боломжгүй. Эхлээд төлбөрийг батлах эсвэл татгалзана уу.",
        // tasks
        "every place on this task is taken" to "Энэ ажлын бүх суудал дүүрсэн байна.",
        "you already have this task" to "Та энэ ажлыг аль хэдийн авсан байна.",
        "this member already has this task" to "Энэ гишүүн уг ажлыг аль хэдийн авсан байна.",
        "there is nothing to answer on this task" to "Энэ ажилд хариулах санал алга. Шинэчилнэ үү.",
        "only a task the member has accepted can be confirmed" to "Зөвхөн хүлээн авсан ажлын гүйцэтгэлийг батална.",
        "this work has not been confirmed" to "Энэ ажлын гүйцэтгэл батлагдаагүй байна.",
        "fewer places than people already doing it" to "Суудлын тоо ажлыг авсан хүмүүсээс цөөн байж болохгүй.",
        "points cannot change after the work has been confirmed" to "Гүйцэтгэл батлагдсаны дараа оноог өөрчлөх боломжгүй.",
        // discussion
        "only the member who raised it or a manager may do this" to "Зөвхөн асуудлыг дэвшүүлсэн гишүүн эсвэл зохион байгуулагч үүнийг хийнэ.",
        "only an issue that is not yet under vote can be edited" to "Санал хураалт эхэлсэн асуудлыг засах боломжгүй.",
        "only an issue that is not yet under vote can be withdrawn" to "Санал хураалт эхэлсэн асуудлыг буцаах боломжгүй.",
        "the vote on this issue has already been opened or closed" to "Энэ асуудлын санал хураалт аль хэдийн нээгдсэн эсвэл хаагдсан.",
        "the vote closed before your signature arrived" to "Гарын үсэг ирэхээс өмнө санал хураалт хаагдсан тул санал тоологдсонгүй.",
        "this signature has already been counted" to "Энэ гарын үсэг аль хэдийн тоологдсон байна.",
        "no such signature" to "Гарын үсгийн хүсэлт олдсонгүй. Дахин санал өгнө үү.",
        "you cannot report your own issue" to "Өөрийнхөө асуудлыг мэдээлэх боломжгүй.",
        "only members of this branch may report an issue" to "Зөвхөн энэ салбарын гишүүд асуудал мэдээлнэ.",
        "you cannot block yourself" to "Өөрийгөө блоклох боломжгүй.",
        "no such member" to "Гишүүн олдсонгүй.",
        "reason is too long" to "Шалтгаан хэт урт байна.",
        // control committee
        "a decision about yourself is for the rest of the committee" to "Өөрийнхөө талаарх шийдвэрийг хорооны бусад гишүүд гаргана.",
        "no such member in this branch" to "Энэ салбарт ийм гишүүн алга.",
        "choose the member" to "Гишүүнээ сонгоно уу.",
        "a reason is required" to "Шалтгаанаа бичнэ үү.",
        "points must be between 0 and 10000" to "Оноо 0–10000 хооронд байна.",
        "idempotency key was used for a different request" to "Шийдвэрийг давхар илгээсэн байна. Цонхоо хаагаад дахин оролдоно уу.",
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
        "no such payment" to "Төлбөр олдсонгүй.",
        "this payment cannot make that transition" to "Төлбөрийн төлөв өөрчлөгдсөн байна. Шинэчлээд дахин оролдоно уу.",
        "approval exceeds the outstanding balance" to "Батлах дүн үлдэгдлээс их байна.",
        "provide the reason for exemption" to "Чөлөөлөх шалтгаанаа бичнэ үү.",
        "choose approve, reject or reverse and provide a reason" to "Шийдвэр болон шалтгаанаа бичнэ үү.",
        "configure dues before creating charges" to "Хураамжийн тохиргоо хийгдээгүй байна. Админд хандана уу.",
        "dues settings are changed by an administrator" to "Хураамжийн тохиргоог зөвхөн админ өөрчилнө.",
        // auth
        "invalid credentials" to "Имэйл эсвэл нууц үг буруу байна.",
        "invalid email or password" to "Имэйл эсвэл нууц үг буруу байна.",
        "eid identity verification failed" to "eID баталгаажуулалт амжилтгүй боллоо.",
        "eid mongolia session check failed" to "eID Mongolia-тай холбогдож чадсангүй. Дахин оролдоно уу.",
        "session_id is required" to "eID хүсэлт олдсонгүй. Дахин эхлүүлнэ үү.",
        "invalid callback url" to "eID буцах хаяг буруу байна.",
        "invalid eid callback url" to "eID буцах хаяг буруу байна. Аппаа шинэчилнэ үү.",
        "eid mongolia session could not be started" to "eID Mongolia хүсэлт эхлүүлж чадсангүй. Түр хүлээгээд дахин оролдоно уу.",
        "eid session expired" to "eID хүсэлтийн хугацаа дууслаа. Дахин эхлүүлнэ үү.",
        "eid_session_other_device" to "Энэ eID хүсэлтийг өөр төхөөрөмж эхлүүлсэн байна. Дахин эхлүүлнэ үү.",
        "e-id verification failed" to "eID баталгаажуулалт амжилтгүй боллоо.",
        "регистрийн дугаар олдсонгүй эсвэл eid апп-д бүртгэлгүй байна" to "Регистрийн дугаар олдсонгүй эсвэл eID апп-д бүртгэлгүй байна. eID Mongolia аппаа идэвхжүүлсэн эсэхээ шалгана уу.",
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
                ?: if (raw.startsWith("transfer_")) "Үйлдлийг гүйцэтгэж чадсангүй. Шинэчлээд дахин оролдоно уу." else generic(raw.lowercase(), k.status)
        }
    }

    /**
     * Server sentences not (yet) known word for word, by what they are about.
     * The backend is adding refusals for officers acting on themselves (403)
     * and for actions on cancelled events (409); their exact wording may
     * still change, so they are recognised by their parts.
     */
    fun generic(raw: String, status: Int): String {
        if (status == 403 && (raw.contains(" own ") || raw.endsWith(" own") || raw.contains("yourself") || raw.contains("self"))) {
            return "Өөрийнхөө талаар энэ үйлдлийг хийх боломжгүй. Өөр эрх бүхий хүнд хандана уу."
        }
        if (status == 409 && (raw.contains("cancelled") || raw.contains("canceled"))) {
            return "Энэ арга хэмжээ цуцлагдсан тул үйлдлийг хийх боломжгүй."
        }
        if (status == 409 && (raw.contains("pending payment") || (raw.contains("pending") && raw.contains("waive")))) {
            return "Хүлээгдэж буй төлбөртэй хураамжийг чөлөөлөх боломжгүй. Эхлээд төлбөрийг батлах эсвэл татгалзана уу."
        }
        if (status == 409 && raw.contains("idempotency")) {
            return "Шийдвэрийг давхар илгээсэн байна. Цонхоо хаагаад дахин оролдоно уу."
        }
        if (status == 400 && raw.contains("too long")) return "Оруулсан текст хэт урт байна."
        return fallback(status)
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
