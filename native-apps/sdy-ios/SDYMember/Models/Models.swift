import Foundation

// Mirrors of the TypeScript types in frontend/lib/api/{client,member,events,dues}.ts.
// Decoded with .convertFromSnakeCase: `my_status` → `myStatus`.

// MARK: - Auth & identity

struct Me: Decodable, Hashable {
    let id: String
    @DefaultText var tenantId: String
    @DefaultText var tenantName: String
    var workspaceKind: String?
    @DefaultText var name: String
    @DefaultText var email: String
    @DefaultFalse var isAdmin: Bool
    @DefaultEmpty var permissions: [String]
}

struct Organisation: Decodable, Hashable, Identifiable {
    let id: String
    @DefaultText var name: String
    @DefaultText var slug: String
}

struct Profile: Decodable, Hashable {
    let id: String
    @DefaultText var name: String
    @DefaultText var email: String
    @DefaultEmpty var organisations: [Organisation]
    var home: Organisation?
}

struct Branch: Decodable, Hashable, Identifiable {
    var id: String { slug }
    let slug: String
    @DefaultText var name: String
    var parentSlug: String?
}

struct BranchesResponse: Decodable { @DefaultEmpty var branches: [Branch] }

struct Tenant: Decodable, Hashable, Identifiable {
    let id: String
    @DefaultText var name: String
    @DefaultText var slug: String
    var kind: String?
}

struct TenantsResponse: Decodable {
    @DefaultText var current: String
    @DefaultEmpty var tenants: [Tenant]
    @DefaultEmpty var active: [String]
}

struct SwitchTenantResponse: Decodable {
    @DefaultText var tenantId: String
    @DefaultFalse var switched: Bool
    var expiresAt: String?
}

struct LoginResponse: Decodable {
    var expiresAt: String?
    var sessionToken: String?
}

struct EIDStart: Decodable, Hashable {
    let sessionId: String
    var deviceLinkUrl: String?
    @DefaultEmpty var qrLinks: [String]
    var appLink: String?
    @DefaultText var verificationCode: String
    var expiresAt: String?
}

extension EIDStart {
    /// A session known only by its id (the app was reopened by eID's link).
    init(resumingSession id: String) {
        self.sessionId = id
        self.deviceLinkUrl = nil
        self.qrLinks = []
        self.appLink = nil
        self.verificationCode = ""
        self.expiresAt = nil
    }
}

struct EIDPoll: Decodable {
    let state: String
    var expiresAt: String?
    var sessionToken: String?
}

// MARK: - Membership

struct Affiliation: Decodable, Hashable, Identifiable {
    var id: String { tenantId }
    let tenantId: String
    @DefaultText var name: String
    @DefaultText var slug: String
    @DefaultFalse var isPrimary: Bool
    @DefaultText var status: String
    var memberSince: String?
    @DefaultFalse var hasAccess: Bool
    /// Албан тушаал (chair, board…); older servers send none.
    var position: String?
}

struct MemberProfile: Decodable, Hashable {
    @DefaultText var phone: String
    @DefaultText var residence: String
    @DefaultFalse var notificationsEnabled: Bool

    init(phone: String = "", residence: String = "", notificationsEnabled: Bool = true) {
        self.phone = phone
        self.residence = residence
        self.notificationsEnabled = notificationsEnabled
    }

    var body: [String: Any] {
        ["phone": phone, "residence": residence, "notifications_enabled": notificationsEnabled]
    }
}

struct MemberHistory: Decodable, Hashable, Identifiable {
    let id: String
    @DefaultText var tenantId: String
    @DefaultText var branch: String
    @DefaultText var fromStatus: String
    @DefaultText var status: String
    @DefaultText var reason: String
    @DefaultText var createdAt: String
}

struct MemberRecord: Decodable, Hashable {
    @DefaultEmpty var memberships: [Affiliation]
    var profile: MemberProfile
    @DefaultEmpty var history: [MemberHistory]
    @DefaultFalse var hasMore: Bool
    var nextOffset: Int?

    /// An approved branch: a primary, active membership.
    var approvedBranch: Affiliation? { memberships.first { $0.isPrimary && $0.status == "active" } }
    var hasPrimary: Bool { memberships.contains { $0.isPrimary } }
}

struct MyItem: Decodable, Hashable, Identifiable {
    let id: String
    @DefaultText var sourceApp: String
    @DefaultText var sourceRef: String
    @DefaultText var provider: String
    @DefaultText var code: String
    @DefaultText var status: String
    @DefaultText var answer: String
    @DefaultText var openedAt: String
    @DefaultText var updatedAt: String
}

struct MyItemsResponse: Decodable { @DefaultEmpty var items: [MyItem] }

struct JoinResponse: Decodable {
    @DefaultFalse var ok: Bool
    @DefaultFalse var joined: Bool
    var workspaceId: String?
    var workspaceName: String?
}

struct MembershipTransfer: Decodable, Hashable, Identifiable {
    let id: String
    @DefaultText var fromTenantId: String
    @DefaultText var fromName: String
    @DefaultText var tenantId: String
    @DefaultText var toName: String
    @DefaultText var message: String
    @DefaultText var status: String
    @DefaultText var createdAt: String
    var decidedAt: String?
}

struct TransfersResponse: Decodable { @DefaultEmpty var requests: [MembershipTransfer] }

struct MemberNotification: Decodable, Hashable, Identifiable {
    let id: String
    @DefaultText var kind: String
    @DefaultText var title: String
    @DefaultText var body: String
    @DefaultText var path: String
    @DefaultText var createdAt: String
    var readAt: String?
    var isRead: Bool { readAt != nil }
}

struct NotificationsPage: Decodable {
    @DefaultEmpty var items: [MemberNotification]
    var unread: Int?
    @DefaultFalse var hasMore: Bool
    var nextOffset: Int?
}

struct PersonalDuesHistory: Decodable {
    struct ChargeLine: Decodable, Hashable, Identifiable {
        let id: String
        @DefaultText var tenantId: String
        @DefaultText var branch: String
        @DefaultText var period: String
        @DefaultZero var amount: Double
        @DefaultZero var paid: Double
        @DefaultZero var balance: Double
        @DefaultFalse var waived: Bool
    }
    struct PaymentLine: Decodable, Hashable, Identifiable {
        let id: String
        @DefaultText var branch: String
        @DefaultZero var amount: Double
        @DefaultText var status: String
        @DefaultText var reference: String
        @DefaultText var reviewNote: String
        @DefaultText var createdAt: String
    }
    @DefaultEmpty var charges: [ChargeLine]
    @DefaultEmpty var payments: [PaymentLine]
    @DefaultFalse var hasMore: Bool
    var nextOffset: Int?
}

struct PersonalParticipationHistory: Decodable {
    struct Item: Decodable, Hashable, Identifiable {
        let id: String
        @DefaultText var branch: String
        @DefaultText var title: String
        @DefaultText var startsAt: String
        @DefaultText var status: String
        @DefaultZero var points: Double
    }
    struct Entry: Decodable, Hashable, Identifiable {
        let id: String
        @DefaultText var branch: String
        @DefaultText var title: String
        @DefaultZero var delta: Double
        @DefaultText var reason: String
        @DefaultText var createdAt: String
    }
    @DefaultEmpty var items: [Item]
    @DefaultEmpty var entries: [Entry]
    @DefaultZero var totalPoints: Double
    @DefaultFalse var hasMore: Bool
    var nextOffset: Int?
}

struct DeletionStatus: Decodable {
    /// none | pending | cancelled | completed. "pending" while the 30-day grace runs.
    var status: String?
    var requestedAt: String?
    var deleteAfter: String?
    var scheduledFor: String?
    var purgeAt: String?

    var graceDays: Int?

    var isPending: Bool { (status ?? "").lowercased() == "pending" }
    var deadline: String? { scheduledFor ?? deleteAfter ?? purgeAt }
}

// MARK: - Events

struct EventRecord: Decodable, Hashable, Identifiable {
    let id: String
    @DefaultText var title: String
    @DefaultText var description: String
    @DefaultText var location: String
    @DefaultText var startsAt: String
    var endsAt: String?
    var capacity: Int?
    @DefaultText var status: String
    @DefaultZero var registered: Double
    @DefaultZero var attended: Double
    @DefaultText var myStatus: String
    var pointsValue: Double?
    var votePoints: Double?

    var registeredCount: Int { Int(registered) }
    var attendedCount: Int { Int(attended) }
    var isFull: Bool { capacity.map { registeredCount >= $0 } ?? false }
    var isOpen: Bool { status == "planned" }
    var startDate: Date? { Formatters.parseDate(startsAt) }
    var isUpcoming: Bool { (startDate ?? .distantPast) >= Date() }

    /// "12/50 бүртгүүлсэн · 3 ирсэн"
    var capacityText: String {
        let reg = capacity.map { "\(registeredCount)/\($0)" } ?? "\(registeredCount)"
        return "\(reg) бүртгүүлсэн · \(attendedCount) ирсэн"
    }
}

struct EventsResponse: Decodable { @DefaultEmpty var events: [EventRecord] }

struct ActionResult: Decodable {
    @DefaultText var status: String
    @DefaultFalse var changed: Bool
    var points: Double?
}

struct Participant: Decodable, Hashable, Identifiable {
    var id: String { userId }
    let userId: String
    @DefaultText var name: String
    @DefaultText var email: String
    @DefaultText var status: String
}

struct ParticipantsResponse: Decodable { @DefaultEmpty var participants: [Participant] }

struct MyEventsPage: Decodable {
    struct Item: Decodable, Hashable, Identifiable {
        var id: String { eventId }
        let eventId: String
        @DefaultText var title: String
        @DefaultText var startsAt: String
        @DefaultText var status: String
        @DefaultZero var points: Double
    }
    @DefaultEmpty var items: [Item]
    @DefaultFalse var hasMore: Bool
    var nextOffset: Int?
}

struct PointsPage: Decodable {
    struct Entry: Decodable, Hashable, Identifiable {
        let id: String
        @DefaultText var eventId: String
        @DefaultText var title: String
        @DefaultZero var delta: Double
        @DefaultText var reason: String
        @DefaultText var createdAt: String
    }
    @DefaultZero var total: Double
    @DefaultEmpty var entries: [Entry]
    @DefaultFalse var hasMore: Bool
    var nextOffset: Int?
}

struct MyVote: Decodable, Hashable {
    @DefaultText var choice: String
    @DefaultText var status: String
}

struct Motion: Decodable, Hashable, Identifiable {
    let id: String
    @DefaultText var eventId: String
    @DefaultText var title: String
    @DefaultText var body: String
    @DefaultText var proposerId: String
    @DefaultText var proposerName: String
    @DefaultText var status: String
    @DefaultText var result: String
    @DefaultZero var yes: Double
    @DefaultZero var no: Double
    @DefaultZero var abstain: Double
    @DefaultText var createdAt: String
    var myVote: MyVote?

    /// proposed | voting | approved | rejected | withdrawn
    var displayStatus: String { status == "decided" ? result : status }
    var counted: Int { Int(yes + no + abstain) }
    var signedMine: Bool { myVote?.status == "signed" }
}

struct MotionList: Decodable {
    @DefaultEmpty var motions: [Motion]
    var eligible: Int?
    @DefaultFalse var canVote: Bool
    @DefaultFalse var signingReady: Bool
    var votePoints: Double?
    @DefaultFalse var canManage: Bool
    @DefaultText var eventStatus: String
    @DefaultText var me: String

    func needsMyVote(_ motion: Motion) -> Bool {
        motion.status == "voting" && canVote && signingReady && !motion.signedMine
    }
}

struct VoteStart: Decodable {
    let sessionId: String
    @DefaultText var verificationCode: String
    var appLink: String?
    @DefaultText var state: String
}

struct VotePoll: Decodable {
    let state: String
    var reason: String?
    var points: Double?
}

struct TaskAssignment: Decodable, Hashable, Identifiable {
    var id: String { userId }
    let userId: String
    @DefaultText var name: String
    @DefaultText var status: String
    @DefaultFalse var volunteered: Bool
    @DefaultZero var pointsAwarded: Double
}

struct EventTask: Decodable, Hashable, Identifiable {
    let id: String
    @DefaultText var eventId: String
    @DefaultText var title: String
    @DefaultText var description: String
    @DefaultZero var points: Double
    var slots: Int
    var taken: Int
    @DefaultEmpty var assignments: [TaskAssignment]

    var isFree: Bool { taken < slots }
    func mine(_ me: String) -> TaskAssignment? { assignments.first { $0.userId == me } }
}

struct TasksResponse: Decodable {
    @DefaultEmpty var tasks: [EventTask]
    @DefaultFalse var canManage: Bool
    @DefaultText var me: String
}

struct Standing: Decodable, Hashable, Identifiable {
    var id: String { userId }
    var rank: Int
    let userId: String
    @DefaultText var name: String
    @DefaultZero var points: Double
    @DefaultZero var attended: Double
    @DefaultZero var tasks: Double
    @DefaultZero var votes: Double
}

struct Leaderboard: Decodable {
    @DefaultText var period: String
    @DefaultEmpty var standings: [Standing]
    var me: Standing?
}

// MARK: - Dues

struct DuesSettings: Decodable, Hashable {
    @DefaultFalse var enabled: Bool
    @DefaultZero var monthlyAmount: Double
    var dueDay: Int?
    @DefaultText var bankName: String
    @DefaultText var accountNumber: String
    @DefaultText var accountHolder: String
    @DefaultText var instructions: String
}

struct Charge: Decodable, Hashable, Identifiable {
    let id: String
    @DefaultText var period: String
    @DefaultZero var amount: Double
    @DefaultZero var paid: Double
    @DefaultZero var balance: Double
    @DefaultText var dueDate: String
    @DefaultFalse var waived: Bool
    @DefaultText var waiverReason: String
    var pending: Double?

    /// What can still be reported: the balance minus transfers awaiting review.
    var reportable: Double { max(0, balance - (pending ?? 0)) }

    func isOverdue(now: Date = Date()) -> Bool {
        guard !waived, balance > 0, let due = Formatters.parseDay(dueDate) else { return false }
        return Formatters.startOfDay(now) > due
    }
}

struct Payment: Decodable, Hashable, Identifiable {
    let id: String
    @DefaultText var chargeId: String
    @DefaultZero var amount: Double
    @DefaultText var reference: String
    @DefaultText var status: String
    @DefaultText var reviewNote: String
    @DefaultText var createdAt: String
}

struct MyDuesTotals: Decodable, Hashable {
    @DefaultZero var charged: Double
    @DefaultZero var paid: Double
    @DefaultZero var pending: Double
    @DefaultZero var outstanding: Double
    @DefaultZero var waived: Double

    var owed: Double { max(0, charged - waived) }
    var paidPercent: Int { DuesMath.percent(paid, of: owed) }
}

struct MyDuesPage: Decodable {
    @DefaultEmpty var charges: [Charge]
    @DefaultEmpty var payments: [Payment]
    @DefaultFalse var hasMore: Bool
    var nextOffset: Int?
    var totals: MyDuesTotals?
}

struct ReportResult: Decodable {
    var id: String?
    @DefaultFalse var changed: Bool
}

enum DuesMath {
    static func percent(_ part: Double, of whole: Double) -> Int {
        if whole <= 0 { return part > 0 ? 100 : 0 }
        return max(0, min(100, Int((part / whole * 100).rounded(.down))))
    }

    /// The next transfer when what is left is paid in `parts` equal transfers.
    static func partAmount(_ left: Double, parts: Int) -> Double {
        guard left > 0 else { return 0 }
        return (left / Double(max(1, parts))).rounded(.up)
    }

    static func partChoices(_ left: Double, max: Int = 4) -> [Int] {
        (1...max).filter { $0 == 1 || left >= Double($0) }
    }
}
