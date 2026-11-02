import Foundation

// What the branch's officers work with (web: app/member/members, sanctions,
// finance, module/events). The server decides who may do what; the app only
// shows what the signed-in person's permissions allow.

enum Permission {
    static let manageEvents = "events.manage"
    static let discipline = "events.discipline"
    static let manageMembers = "membership.manage"
    static let finance = "membership.finance"
}

struct PositionPolicy: Decodable, Hashable {
    @DefaultFalse var canAssign: Bool
    @DefaultFalse var canAssignChair: Bool
    @DefaultFalse var canSetSeats: Bool
    @DefaultZero var auditorSeats: Double
    @DefaultZero var auditors: Double
}

struct ManagedMember: Decodable, Hashable, Identifiable {
    var id: String { userId }
    let userId: String
    @DefaultText var name: String
    @DefaultText var email: String
    @DefaultText var status: String
    @DefaultFalse var isPrimary: Bool
    @DefaultFalse var hasAccess: Bool
    var position: String?
    var positionValue: String { position ?? "member" }
}

struct ManagedMembers: Decodable {
    @DefaultEmpty var members: [ManagedMember]
    @DefaultFalse var hasMore: Bool
    var nextOffset: Int?
}

struct Sanction: Decodable, Hashable, Identifiable {
    let id: String
    @DefaultText var userId: String
    @DefaultText var userName: String
    @DefaultText var actorName: String
    var eventId: String?
    @DefaultText var eventTitle: String
    @DefaultZero var points: Double
    @DefaultText var reason: String
    @DefaultText var createdAt: String
}

struct SanctionList: Decodable {
    @DefaultEmpty var sanctions: [Sanction]
    @DefaultFalse var hasMore: Bool
    var nextOffset: Int?
}

struct BranchPerson: Decodable, Hashable, Identifiable {
    var id: String { userId }
    let userId: String
    @DefaultText var name: String
    @DefaultText var email: String
}

struct BranchPeople: Decodable { @DefaultEmpty var members: [BranchPerson] }

struct FinanceCharge: Decodable, Hashable, Identifiable {
    let id: String
    @DefaultText var name: String
    @DefaultText var period: String
    @DefaultZero var amount: Double
    @DefaultZero var paid: Double
    @DefaultZero var balance: Double
    @DefaultZero var pending: Double
    @DefaultFalse var waived: Bool
    @DefaultText var waiverReason: String
}

struct FinancePayment: Decodable, Hashable, Identifiable {
    let id: String
    @DefaultText var name: String
    @DefaultZero var amount: Double
    @DefaultText var reference: String
    @DefaultText var status: String
    @DefaultText var reviewNote: String
    @DefaultText var createdAt: String
}

struct FinanceOverview: Decodable {
    struct Totals: Decodable, Hashable {
        @DefaultZero var charged: Double
        @DefaultZero var received: Double
        @DefaultZero var outstanding: Double
        @DefaultZero var waived: Double
    }
    @DefaultEmpty var charges: [FinanceCharge]
    @DefaultEmpty var payments: [FinancePayment]
    var totals: Totals?
    @DefaultFalse var hasMore: Bool
    var nextOffset: Int?
}

struct IssuedCheckin: Decodable {
    let token: String
    @DefaultText var expiresAt: String
}

/// What the event form sends (backend eventInput).
struct EventDraft: Equatable {
    var title = ""
    var description = ""
    var location = ""
    var startsAt = Date().addingTimeInterval(24 * 3600)
    var hasEnd = true
    var endsAt = Date().addingTimeInterval(26 * 3600)
    var capacity = ""
    var status = "planned"
    var pointsValue = "10"
    var votePoints = "0"

    init() {}

    init(_ event: EventRecord) {
        title = event.title
        description = event.description
        location = event.location
        startsAt = event.startDate ?? Date()
        if let end = Formatters.parseDate(event.endsAt) { endsAt = end; hasEnd = true } else { hasEnd = false; endsAt = startsAt.addingTimeInterval(2 * 3600) }
        capacity = event.capacity.map(String.init) ?? ""
        status = event.status.isEmpty ? "planned" : event.status
        pointsValue = String(Int(event.pointsValue ?? 0))
        votePoints = String(Int(event.votePoints ?? 0))
    }

    var body: [String: Any] {
        let iso = ISO8601DateFormatter()
        var out: [String: Any] = [
            "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
            "description": description.trimmingCharacters(in: .whitespacesAndNewlines),
            "location": location.trimmingCharacters(in: .whitespacesAndNewlines),
            "starts_at": iso.string(from: startsAt),
            "status": status,
            "points_value": Int(pointsValue) ?? 0,
            "vote_points": Int(votePoints) ?? 0,
        ]
        if hasEnd { out["ends_at"] = iso.string(from: endsAt) }
        if let seats = Int(capacity), seats > 0 { out["capacity"] = seats }
        return out
    }

    var isValid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (!hasEnd || endsAt > startsAt)
            && (capacity.isEmpty || (Int(capacity) ?? 0) > 0)
            && (0...100_000).contains(Int(pointsValue) ?? -1) && (0...100_000).contains(Int(votePoints) ?? -1)
    }
}
