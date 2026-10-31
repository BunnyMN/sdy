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
        // auth
        "invalid credentials": "Имэйл эсвэл нууц үг буруу байна.",
        "invalid email or password": "Имэйл эсвэл нууц үг буруу байна.",
        "eid identity verification failed": "eID баталгаажуулалт амжилтгүй боллоо.",
        "eid mongolia session check failed": "eID Mongolia-тай холбогдож чадсангүй. Дахин оролдоно уу.",
        "session_id is required": "eID хүсэлт олдсонгүй. Дахин эхлүүлнэ үү.",
        "invalid callback url": "eID буцах хаяг буруу байна.",
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
            return fallback(status: status)
        }
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
