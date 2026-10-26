import XCTest
@testable import SDYMember

final class DecodingTests: XCTestCase {
    private var router: FixtureRouter!
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    override func setUp() {
        router = FixtureRouter(bundle: Bundle(for: DecodingTests.self))
    }

    private func load<T: Decodable>(_ name: String, as: T.Type) throws -> T {
        try decoder.decode(T.self, from: try router.file(name))
    }

    func testIdentity() throws {
        let me = try load("me", as: Me.self)
        XCTAssertEqual(me.tenantId, "t-1")
        XCTAssertEqual(me.workspaceKind, "organisation")
        let profile = try load("profile", as: Profile.self)
        XCTAssertEqual(profile.organisations.count, 2)
        XCTAssertEqual(profile.home?.slug, "batbold")
    }

    func testMemberRecord() throws {
        let record = try load("member_record", as: MemberRecord.self)
        XCTAssertEqual(record.approvedBranch?.tenantId, "t-1")
        XCTAssertTrue(record.profile.notificationsEnabled)
        XCTAssertNil(record.memberships[1].memberSince)

        let none = try load("member_record_none", as: MemberRecord.self)
        XCTAssertNil(none.approvedBranch)
        XCTAssertEqual(none.history, [], "null slice decodes as empty")
    }

    func testNullListsDecodeAsEmpty() throws {
        let items = try load("items_empty", as: MyItemsResponse.self)
        XCTAssertTrue(items.items.isEmpty)
        let tasks = try load("tasks", as: TasksResponse.self)
        XCTAssertEqual(tasks.tasks[1].assignments, [])
        let missing = try decoder.decode(EventsResponse.self, from: Data("{}".utf8))
        XCTAssertTrue(missing.events.isEmpty)
    }

    func testEvents() throws {
        let events = try load("events", as: EventsResponse.self).events
        XCTAssertEqual(events.count, 4)
        let meeting = events[0]
        XCTAssertEqual(meeting.myStatus, "attended")
        XCTAssertEqual(meeting.capacityText, "42/60 бүртгүүлсэн · 17 ирсэн")
        XCTAssertNotNil(meeting.startDate)
        let open = events[2]
        XCTAssertNil(open.capacity)
        XCTAssertEqual(open.capacityText, "8 бүртгүүлсэн · 0 ирсэн")
        XCTAssertNil(open.endsAt)
    }

    func testMotionsAndVotes() throws {
        let list = try load("motions", as: MotionList.self)
        XCTAssertTrue(list.canVote)
        XCTAssertTrue(list.needsMyVote(list.motions[0]))
        XCTAssertFalse(list.needsMyVote(list.motions[1]))
        XCTAssertEqual(list.motions[1].displayStatus, "approved")
        XCTAssertTrue(list.motions[1].signedMine)

        let start = try decoder.decode(VoteStart.self, from: Data(#"{"session_id":"s","verification_code":"1234","app_link":"https://x","state":"signing"}"#.utf8))
        XCTAssertEqual(start.verificationCode, "1234")
        let poll = try decoder.decode(VotePoll.self, from: Data(#"{"state":"signed","points":5}"#.utf8))
        XCTAssertEqual(poll.points, 5)
    }

    func testTasks() throws {
        let tasks = try load("tasks", as: TasksResponse.self)
        XCTAssertEqual(tasks.tasks[0].mine("u-1")?.status, "offered")
        XCTAssertTrue(tasks.tasks[0].isFree)
    }

    func testDues() throws {
        let settings = try load("dues_settings", as: DuesSettings.self)
        XCTAssertEqual(settings.accountNumber, "5012345678")
        let page = try load("dues_mine", as: MyDuesPage.self)
        XCTAssertEqual(page.charges.count, 3)
        XCTAssertEqual(page.totals?.paidPercent, 50)
        XCTAssertTrue(page.charges[0].isOverdue())
        XCTAssertFalse(page.charges[2].isOverdue(), "paid charges are never overdue")
        XCTAssertEqual(page.charges[1].reportable, 0)
        XCTAssertEqual(page.charges[0].reportable, 10000)
    }

    func testLeaderboardPointsNotifications() throws {
        let board = try load("leaderboard", as: Leaderboard.self)
        XCTAssertEqual(board.me?.rank, 4)
        let points = try load("points", as: PointsPage.self)
        XCTAssertEqual(points.total, 45)
        let notes = try load("notifications", as: NotificationsPage.self)
        XCTAssertEqual(notes.unread, 2)
        XCTAssertFalse(notes.items[0].isRead)
        XCTAssertTrue(notes.items[2].isRead)
    }

    func testEveryFixtureDecodes() throws {
        let pairs: [(String, Decodable.Type)] = [
            ("branches", BranchesResponse.self), ("tenants", TenantsResponse.self), ("items", MyItemsResponse.self),
            ("transfers", TransfersResponse.self), ("events_mine", MyEventsPage.self), ("participants", ParticipantsResponse.self),
            ("participation_history", PersonalParticipationHistory.self), ("dues_history", PersonalDuesHistory.self),
            ("eid_start", EIDStart.self),
        ]
        for (name, type) in pairs {
            XCTAssertNoThrow(try decoder.decode(type, from: try router.file(name)), name)
        }
    }

    func testEIDResponses() throws {
        let start = try load("eid_start", as: EIDStart.self)
        XCTAssertEqual(start.verificationCode, "7351")
        XCTAssertNotNil(Formatters.parseDate(start.expiresAt))
        let poll = try decoder.decode(EIDPoll.self, from: Data(#"{"state":"COMPLETE","session_token":"abc"}"#.utf8))
        XCTAssertEqual(poll.sessionToken, "abc")
    }

    func testDeletionStatus() throws {
        let pending = try decoder.decode(DeletionStatus.self, from: Data(#"{"id":"d1","status":"pending","requested_at":"2026-10-26T02:00:00Z","scheduled_for":"2026-11-25T02:00:00Z","grace_days":30}"#.utf8))
        XCTAssertTrue(pending.isPending)
        XCTAssertEqual(pending.deadline, "2026-11-25T02:00:00Z")
        XCTAssertEqual(pending.graceDays, 30)
        let none = try decoder.decode(DeletionStatus.self, from: Data(#"{"status":"none"}"#.utf8))
        XCTAssertFalse(none.isPending)
    }

    func testFixtureDatesExpand() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let out = FixtureRouter.expandDates(#"{"a":"@D(+1,18:30)"}"#, now: now)
        XCTAssertFalse(out.contains("@D"))
        XCTAssertTrue(out.contains("T10:30:00Z"), out) // 18:30 Ulaanbaatar = 10:30 UTC
    }
}
