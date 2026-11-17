import Foundation

/// Every failure the app can show. `message` is always Mongolian: raw server
/// text (English) is never put in front of a person — it is only used to pick
/// the right sentence.
struct APIError: Error, Equatable, Identifiable {
    enum Kind: Equatable {
        case network
        case unauthorized
        case server(status: Int)
        case decoding
        case cancelled
    }

    let kind: Kind
    /// Server text as received, for mapping and logs only.
    let serverMessage: String
    let code: String?

    var id: String { "\(kind)-\(serverMessage)-\(code ?? "")" }
    var status: Int {
        switch kind {
        case .server(let status): return status
        case .unauthorized: return 401
        default: return 0
        }
    }
    var isNetwork: Bool { kind == .network }
    /// Worth asking again: no connection, or a gateway between here and eID
    /// that failed once (502/503/504).
    var isTransient: Bool { isNetwork || [502, 503, 504].contains(status) }

    static let network = APIError(kind: .network, serverMessage: "", code: nil)
    static let decoding = APIError(kind: .decoding, serverMessage: "", code: nil)
    static let cancelled = APIError(kind: .cancelled, serverMessage: "", code: nil)

    var message: String { ErrorText.message(for: self) }

    static func wrap(_ error: Error) -> APIError {
        if let api = error as? APIError { return api }
        if error is CancellationError { return .cancelled }
        if let url = error as? URLError {
            return url.code == .cancelled ? .cancelled : .network
        }
        if error is DecodingError { return .decoding }
        return .network
    }
}

/// Mongolian sentences for the server's known answers, then by status.
enum ErrorText {
    static let network = "Холболт тасарсан. Интернэтээ шалгаад дахин оролдоно уу."

    /// Exact server messages (lower-cased) → Mongolian. Taken from
    /// backend/internal/apps/events, membership/dues.go and the auth handlers.
    static let known: [String: String] = [
        // check-in
        "the check-in code is invalid or expired": "Ирцийн код хүчингүй эсвэл хугацаа нь дууссан байна. Зохион байгуулагчаас шинэ QR гаргуулна уу.",
        "invalid check-in code": "Ирцийн код буруу байна. QR-ээ дахин уншуулна уу.",
        "register for an open event before checking in": "Ирц бүртгүүлэхийн өмнө арга хэмжээнд бүртгүүлнэ үү.",
        // events
        "this event is full": "Арга хэмжээний хүний тоо дүүрсэн байна.",
        "this event is not taking registrations": "Энэ арга хэмжээнд бүртгэл хаагдсан байна.",
        "this event is not taking registration changes": "Энэ арга хэмжээний бүртгэлийг өөрчлөх боломжгүй болсон.",
        "recorded attendance cannot be withdrawn": "Ирц бүртгэгдсэн тул бүртгэлээ цуцлах боломжгүй.",
        "this event is cancelled": "Энэ арга хэмжээ цуцлагдсан.",
        "this event is closed": "Энэ арга хэмжээ хаагдсан.",
        "no such event": "Арга хэмжээ олдсонгүй. Өөр салбарынх байж магадгүй.",
        "no such task": "Ажил үүрэг олдсонгүй.",
        "no such motion": "Хэлэлцэх асуудал олдсонгүй.",
        "this event is not open": "Энэ арга хэмжээ нээлттэй биш байна.",
        "capacity is below the number of participants": "Хүний тоо одоо бүртгүүлсэн оролцогчдоос цөөн байж болохгүй.",
        "points cannot change after attendance has been recorded": "Ирц бүртгэгдсэний дараа оноог өөрчлөх боломжгүй.",
        "that person is not on this event's list": "Энэ хүн арга хэмжээний жагсаалтад алга. Шинэчилнэ үү.",
        "that person is not a member of this organisation": "Энэ хүн салбарын гишүүн биш байна.",
        "that person is not a member of this branch": "Энэ хүн салбарын гишүүн биш байна.",
        "provide a reason for the attendance correction": "Ирц залруулах шалтгаанаа бичнэ үү.",
        "note is too long": "Тайлбар хэт урт байна.",
        "title is required": "Нэрээ бичнэ үү.",
        "title is too long": "Нэр хэт урт байна.",
        "description is too long": "Тайлбар хэт урт байна.",
        "location is too long": "Байршил хэт урт байна.",
        "ends_at is before starts_at": "Дуусах цаг эхлэх цагаас өмнө байна.",
        "capacity must be a positive number": "Хүний тоо эерэг тоо байна.",
        // self-actions, cancelled events, check-in window (backend PR #46)
        "you cannot check in with a check-in code you issued": "Өөрийн гаргасан QR кодоор ирцээ бүртгэх боломжгүй. Өөр зохион байгуулагчийн кодыг уншуулна уу.",
        "check-in is open from 2 hours before the event starts until 2 hours after it ends": "Ирц арга хэмжээ эхлэхээс 2 цагийн өмнөөс дууссанаас хойш 2 цаг хүртэл бүртгэгдэнэ.",
        "you cannot change the exemption of your own charge": "Өөрийнхөө хураамжийн чөлөөлөлтийг өөрөө өөрчлөх боломжгүй. Өөр санхүүчид хандана уу.",
        "this charge has a pending payment report; approve or reject it before exempting the charge": "Энэ хураамжид хүлээгдэж буй төлбөрийн мэдэгдэл байна. Чөлөөлөхийн өмнө төлбөрийг батлах эсвэл татгалзана уу.",
        "this idempotency-key was already used for a different decision": "Шийдвэрийг өөр утгатайгаар давхар илгээсэн байна. Цонхоо хаагаад дахин оролдоно уу.",
        "idempotency-key must be a uuid": "Шийдвэрийн түлхүүр буруу байна. Аппаа шинэчилнэ үү.",
        "no waived charge with that id": "Хураамж олдсонгүй эсвэл чөлөөлөгдөөгүй байна.",
        "provide the reason for withdrawing the exemption": "Чөлөөлөлтийг буцаах шалтгаанаа бичнэ үү.",
        "you cannot record your own attendance": "Өөрийнхөө ирц, оноог өөрөө батлах боломжгүй. Өөр зохион байгуулагчид хандана уу.",
        "you cannot change your own attendance": "Өөрийнхөө ирц, оноог өөрөө батлах боломжгүй. Өөр зохион байгуулагчид хандана уу.",
        "you cannot award points to yourself": "Өөртөө оноо олгох боломжгүй. Өөр зохион байгуулагчид хандана уу.",
        "you cannot confirm your own task": "Өөрийнхөө ажлыг өөрөө батлах боломжгүй.",
        "you cannot confirm your own work": "Өөрийнхөө ажлыг өөрөө батлах боломжгүй.",
        "you cannot review your own payment": "Өөрийнхөө төлбөрийг өөрөө батлах боломжгүй. Өөр санхүүчид хандана уу.",
        "you cannot approve your own payment": "Өөрийнхөө төлбөрийг өөрөө батлах боломжгүй. Өөр санхүүчид хандана уу.",
        "you cannot waive your own dues": "Өөрийнхөө хураамжийг өөрөө чөлөөлөх боломжгүй. Өөр санхүүчид хандана уу.",
        "you cannot waive your own charge": "Өөрийнхөө хураамжийг өөрөө чөлөөлөх боломжгүй. Өөр санхүүчид хандана уу.",
        "a charge with a pending payment cannot be waived": "Хүлээгдэж буй төлбөртэй хураамжийг чөлөөлөх боломжгүй. Эхлээд төлбөрийг батлах эсвэл татгалзана уу.",
        "this charge has a pending payment": "Хүлээгдэж буй төлбөртэй хураамжийг чөлөөлөх боломжгүй. Эхлээд төлбөрийг батлах эсвэл татгалзана уу.",
        // tasks
        "every place on this task is taken": "Энэ ажлын бүх суудал дүүрсэн байна.",
        "you already have this task": "Та энэ ажлыг аль хэдийн авсан байна.",
        "this member already has this task": "Энэ гишүүн уг ажлыг аль хэдийн авсан байна.",
        "there is nothing to answer on this task": "Энэ ажилд хариулах санал алга. Шинэчилнэ үү.",
        "only a task the member has accepted can be confirmed": "Зөвхөн хүлээн авсан ажлын гүйцэтгэлийг батална.",
        "this work has not been confirmed": "Энэ ажлын гүйцэтгэл батлагдаагүй байна.",
        "fewer places than people already doing it": "Суудлын тоо ажлыг авсан хүмүүсээс цөөн байж болохгүй.",
        "points cannot change after the work has been confirmed": "Гүйцэтгэл батлагдсаны дараа оноог өөрчлөх боломжгүй.",
        // discussion
        "only the member who raised it or a manager may do this": "Зөвхөн асуудлыг дэвшүүлсэн гишүүн эсвэл зохион байгуулагч үүнийг хийнэ.",
        "only an issue that is not yet under vote can be edited": "Санал хураалт эхэлсэн асуудлыг засах боломжгүй.",
        "only an issue that is not yet under vote can be withdrawn": "Санал хураалт эхэлсэн асуудлыг буцаах боломжгүй.",
        "the vote on this issue has already been opened or closed": "Энэ асуудлын санал хураалт аль хэдийн нээгдсэн эсвэл хаагдсан.",
        "the vote closed before your signature arrived": "Гарын үсэг ирэхээс өмнө санал хураалт хаагдсан тул санал тоологдсонгүй.",
        "this signature has already been counted": "Энэ гарын үсэг аль хэдийн тоологдсон байна.",
        "no such signature": "Гарын үсгийн хүсэлт олдсонгүй. Дахин санал өгнө үү.",
        "you cannot report your own issue": "Өөрийнхөө асуудлыг мэдээлэх боломжгүй.",
        "only members of this branch may report an issue": "Зөвхөн энэ салбарын гишүүд асуудал мэдээлнэ.",
        "you cannot block yourself": "Өөрийгөө блоклох боломжгүй.",
        "no such member": "Гишүүн олдсонгүй.",
        "reason is too long": "Шалтгаан хэт урт байна.",
        // control committee
        "a decision about yourself is for the rest of the committee": "Өөрийнхөө талаарх шийдвэрийг хорооны бусад гишүүд гаргана.",
        "no such member in this branch": "Энэ салбарт ийм гишүүн алга.",
        "choose the member": "Гишүүнээ сонгоно уу.",
        "a reason is required": "Шалтгаанаа бичнэ үү.",
        "points must be between 0 and 10000": "Оноо 0–10000 хооронд байна.",
        "idempotency key was used for a different request": "Шийдвэрийг давхар илгээсэн байна. Цонхоо хаагаад дахин оролдоно уу.",
        // discussion & votes
        "you have already voted on this issue": "Та энэ асуудалд аль хэдийн санал өгсөн байна.",
        "this issue is not under vote": "Энэ асуудлын санал хураалт явагдаагүй байна.",
        "only members whose attendance at this event was confirmed may vote": "Санал өгөхийн тулд энэ арга хэмжээнд ирцээ баталгаажуулна уу.",
        "sign in with eid mongolia once so your vote can be signed": "Санал зурахын тулд нэг удаа eID Mongolia-аар нэвтэрнэ үү.",
        "your eid identity is not linked": "Таны eID бүртгэлтэй холбогдоогүй байна. eID-ээр нэвтэрч холбоно уу.",
        "the signature does not cover this vote": "Гарын үсэг энэ саналтай таарсангүй. Дахин оролдоно уу.",
        "eid mongolia could not start the signature": "eID Mongolia гарын үсэг эхлүүлж чадсангүй. Дахин оролдоно уу.",
        "could not reach eid mongolia": "eID Mongolia-тай холбогдож чадсангүй. Дахин оролдоно уу.",
        "only members of this branch may raise an issue": "Зөвхөн энэ салбарын гишүүд асуудал дэвшүүлнэ.",
        "only members of this branch may take a task": "Зөвхөн энэ салбарын гишүүд ажил үүрэг авна.",
        "this event already has the most issues it can hold": "Энэ арга хэмжээнд асуудал нэмэх хязгаар хүрсэн байна.",
        // dues
        "enter the amount and transfer reference": "Дүн болон гүйлгээний утгаа оруулна уу.",
        "amount exceeds the balance left after the transfers already reported": "Дүн нь мэдэгдсэн төлбөрүүдийн дараах үлдэгдлээс их байна.",
        "this payment reference is already recorded": "Энэ гүйлгээний утга аль хэдийн бүртгэгдсэн байна.",
        "this submission is already recorded; refresh your payment history": "Энэ мэдэгдэл аль хэдийн бүртгэгдсэн. Түүхээ шинэчилнэ үү.",
        "request key was used for a different payment": "Мэдэгдлийг давхар илгээсэн байна. Цонхоо хаагаад дахин оролдоно уу.",
        "no such charge": "Хураамж олдсонгүй.",
        "no unwaived charge with that id": "Хураамж олдсонгүй эсвэл чөлөөлөгдсөн байна.",
        "no such payment": "Төлбөр олдсонгүй.",
        "this payment cannot make that transition": "Төлбөрийн төлөв өөрчлөгдсөн байна. Шинэчлээд дахин оролдоно уу.",
        "approval exceeds the outstanding balance": "Батлах дүн үлдэгдлээс их байна.",
        "provide the reason for exemption": "Чөлөөлөх шалтгаанаа бичнэ үү.",
        "choose approve, reject or reverse and provide a reason": "Шийдвэр болон шалтгаанаа бичнэ үү.",
        "configure dues before creating charges": "Хураамжийн тохиргоо хийгдээгүй байна. Админд хандана уу.",
        "dues settings are changed by an administrator": "Хураамжийн тохиргоог зөвхөн админ өөрчилнө.",
        // auth
        "invalid credentials": "Имэйл эсвэл нууц үг буруу байна.",
        "invalid email or password": "Имэйл эсвэл нууц үг буруу байна.",
        "eid identity verification failed": "eID баталгаажуулалт амжилтгүй боллоо.",
        "eid mongolia session check failed": "eID Mongolia-тай холбогдож чадсангүй. Дахин оролдоно уу.",
        "session_id is required": "eID хүсэлт олдсонгүй. Дахин эхлүүлнэ үү.",
        "invalid callback url": "eID буцах хаяг буруу байна.",
        "invalid eid callback url": "eID буцах хаяг буруу байна. Аппаа шинэчилнэ үү.",
        "eid mongolia session could not be started": "eID Mongolia хүсэлт эхлүүлж чадсангүй. Түр хүлээгээд дахин оролдоно уу.",
        "eid session expired": "eID хүсэлтийн хугацаа дууслаа. Дахин эхлүүлнэ үү.",
        "eid_session_other_device": "Энэ eID хүсэлтийг өөр төхөөрөмж эхлүүлсэн байна. Дахин эхлүүлнэ үү.",
        "e-id verification failed": "eID баталгаажуулалт амжилтгүй боллоо.",
        "регистрийн дугаар олдсонгүй эсвэл eid апп-д бүртгэлгүй байна": "Регистрийн дугаар олдсонгүй эсвэл eID апп-д бүртгэлгүй байна. eID Mongolia аппаа идэвхжүүлсэн эсэхээ шалгана уу.",
        "unauthorized": "Нэвтрэх хугацаа дууссан. Дахин нэвтэрнэ үү.",
        "forbidden": "Энэ үйлдлийг хийх эрх танд алга.",
    ]

    /// Codes the membership API answers with (components/MembershipTransfers.tsx).
    static let transferCodes: [String: String] = [
        "branch_transfer_required": "Та өөр салбарт харьяалалтай байна. Шилжих хүсэлт илгээнэ үү.",
        "transfer_reason_required": "Шилжих шалтгаанаа 1–500 тэмдэгтэд бичнэ үү.",
        "transfer_source_unavailable": "Одоогийн харьяалал олдсонгүй. Шинэчилнэ үү.",
        "transfer_destination_unavailable": "Очих байгууллага одоогоор боломжгүй байна.",
        "transfer_already_member": "Та уг байгууллагын гишүүн байна.",
        "transfer_already_pending": "Өөр шилжих хүсэлт шийдвэр хүлээж байна.",
        "transfer_not_pending": "Энэ хүсэлт аль хэдийн шийдвэрлэгдсэн эсвэл цуцлагдсан. Шинэчилнэ үү.",
        "transfer_not_found": "Хүсэлт олдсонгүй.",
        "transfer_source_changed": "Таны харьяалал өөрчлөгдсөн. Шинэ хүсэлт шаардлагатай.",
        "transfer_organisation_unavailable": "Холбогдох байгууллага идэвхгүй болсон байна.",
        "transfer_last_admin": "Өмнөх байгууллагад өөр идэвхтэй админ томилсны дараа шилжинэ.",
        "transfer_member_role_unavailable": "Очих байгууллагын гишүүний эрх тохируулагдаагүй байна.",
        "transfer_not_authorized": "Энэ хүсэлтийг гаргах эрхгүй байна.",
    ]

    static func message(for error: APIError) -> String {
        switch error.kind {
        case .network: return network
        case .cancelled: return "Үйлдэл цуцлагдлаа."
        case .decoding: return "Серверийн хариуг уншиж чадсангүй. Аппаа шинэчилнэ үү."
        case .unauthorized: return "Нэвтрэх хугацаа дууссан. Дахин нэвтэрнэ үү."
        case .server(let status):
            let raw = error.serverMessage.trimmingCharacters(in: .whitespacesAndNewlines)
            if let code = error.code, let text = transferCodes[code] { return text }
            if let text = transferCodes[raw] { return text }
            if let text = known[raw.lowercased()] { return text }
            if raw.hasPrefix("transfer_") { return "Үйлдлийг гүйцэтгэж чадсангүй. Шинэчлээд дахин оролдоно уу." }
            return generic(raw.lowercased(), status: status)
        }
    }

    /// Server sentences not (yet) known word for word, by what they are about.
    /// The backend is adding refusals for officers acting on themselves (403)
    /// and for actions on cancelled events (409); their exact wording may
    /// still change, so they are recognised by their parts.
    static func generic(_ raw: String, status: Int) -> String {
        if status == 403, raw.contains(" own ") || raw.hasSuffix(" own") || raw.contains("yourself") || raw.contains("self") {
            return "Өөрийнхөө талаар энэ үйлдлийг хийх боломжгүй. Өөр эрх бүхий хүнд хандана уу."
        }
        if status == 409, raw.contains("cancelled") || raw.contains("canceled") {
            return "Энэ арга хэмжээ цуцлагдсан тул үйлдлийг хийх боломжгүй."
        }
        if status == 409, raw.contains("pending payment") || (raw.contains("pending") && raw.contains("waive")) {
            return "Хүлээгдэж буй төлбөртэй хураамжийг чөлөөлөх боломжгүй. Эхлээд төлбөрийг батлах эсвэл татгалзана уу."
        }
        if status == 409, raw.contains("idempotency") {
            return "Шийдвэрийг давхар илгээсэн байна. Цонхоо хаагаад дахин оролдоно уу."
        }
        if status == 400, raw.contains("too long") { return "Оруулсан текст хэт урт байна." }
        return fallback(status: status)
    }

    static func fallback(status: Int) -> String {
        switch status {
        case 400, 422: return "Оруулсан мэдээлэл буруу байна. Шалгаад дахин оролдоно уу."
        case 401: return "Нэвтрэх хугацаа дууссан. Дахин нэвтэрнэ үү."
        case 403: return "Энэ үйлдлийг хийх эрх танд алга."
        case 404: return "Хайсан мэдээлэл олдсонгүй."
        case 409: return "Мэдээлэл өөрчлөгдсөн байна. Шинэчлээд дахин оролдоно уу."
        case 413: return "Илгээсэн мэдээлэл хэт урт байна."
        case 429: return "Хэт олон оролдлого хийлээ. Түр хүлээгээд дахин оролдоно уу."
        case 502, 503, 504: return "Үйлчилгээ түр ажиллахгүй байна. Хэсэг хугацааны дараа дахин оролдоно уу."
        case 500...599: return "Серверт алдаа гарлаа. Дараа дахин оролдоно уу."
        default: return "Үйлдлийг гүйцэтгэж чадсангүй. Дахин оролдоно уу."
        }
    }
}
