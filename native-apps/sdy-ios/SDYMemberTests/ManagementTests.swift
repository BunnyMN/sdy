import CoreImage
import XCTest
@testable import SDYMember

final class ManagementTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: Data(json.utf8))
    }

    func testSanctionsAndPolicyDecode() throws {
        let list = try decode(SanctionList.self, #"{"sanctions":[{"id":"s1","user_id":"u1","user_name":"Б. Тэмүүлэн","actor_id":"u2","actor_name":"Хороо","event_id":null,"event_title":"","points":7,"reason":"Хурал тасалдуулсан","created_at":"2026-11-02T10:00:00Z"}],"has_more":false,"next_offset":1}"#)
        XCTAssertEqual(list.sanctions.first?.points, 7)
        XCTAssertNil(list.sanctions.first?.eventId)
        let policy = try decode(PositionPolicy.self, #"{"can_assign":true,"can_assign_chair":false,"can_set_seats":false,"auditor_seats":3,"auditors":1}"#)
        XCTAssertTrue(policy.canAssign)
        XCTAssertFalse(policy.canAssignChair)
        XCTAssertEqual(policy.auditorSeats, 3)
        // A member list without positions (an older server) reads as members.
        let members = try decode(ManagedMembers.self, #"{"members":[{"user_id":"u1","name":"A","email":"a@b","status":"active"}]}"#)
        XCTAssertEqual(members.members.first?.positionValue, "member")
    }

    func testFinanceDecodes() throws {
        let overview = try decode(FinanceOverview.self, #"{"charges":[{"id":"c1","name":"A","period":"2026-11","amount":10000,"paid":5000,"balance":5000,"pending":0,"waived":false,"waiver_reason":""}],"payments":[{"id":"p1","name":"A","amount":5000,"reference":"R1","status":"pending","review_note":"","created_at":"2026-11-02T10:00:00Z"}],"has_more":false,"next_offset":50,"totals":{"charged":10000,"received":5000,"outstanding":5000,"waived":0}}"#)
        XCTAssertEqual(overview.totals?.outstanding, 5000)
        XCTAssertEqual(overview.payments.first?.status, "pending")
    }

    func testEventDraftBody() {
        var draft = EventDraft()
        draft.title = "  Хурал "
        draft.capacity = ""
        draft.pointsValue = "15"
        XCTAssertTrue(draft.isValid)
        XCTAssertEqual(draft.body["title"] as? String, "Хурал")
        XCTAssertNil(draft.body["capacity"])
        XCTAssertEqual(draft.body["points_value"] as? Int, 15)
        draft.endsAt = draft.startsAt.addingTimeInterval(-60)
        XCTAssertFalse(draft.isValid, "an event cannot end before it starts")
        draft.hasEnd = false
        XCTAssertTrue(draft.isValid)
        draft.title = " "
        XCTAssertFalse(draft.isValid)
    }

    func testCheckinQRIsReadable() throws {
        let link = "https://e-sdy.mn/member/check-in#event=3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61&token=" + String(repeating: "a1", count: 24)
        let image = try XCTUnwrap(CheckinQRView.qr(link))
        let detector = try XCTUnwrap(CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: nil))
        let found = detector.features(in: CIImage(image: image)!).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
        XCTAssertEqual(found.first, link)
        XCTAssertNotNil(LinkParser.checkin(from: link), "the member app reads what the organiser shows")
    }
}
