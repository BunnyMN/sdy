import XCTest
@testable import SDYMember

final class QRParserTests: XCTestCase {
    let token = String(repeating: "a1", count: 24)
    let event = "3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61"

    func testValidCode() {
        let code = LinkParser.checkin(from: "https://e-sdy.mn/member/check-in#event=\(event)&token=\(token)")
        XCTAssertEqual(code, CheckinCode(eventId: event, token: token))
    }

    func testWwwHostAndPercentEncoding() {
        XCTAssertNotNil(LinkParser.checkin(from: "https://www.e-sdy.mn/member/check-in#event=\(event)&token=\(token)"))
        XCTAssertNotNil(LinkParser.checkin(from: "https://e-sdy.mn/member/check-in/#event=\(event.uppercased())&token=\(token)"))
    }

    func testRejectsOtherHosts() {
        XCTAssertNil(LinkParser.checkin(from: "https://evil.mn/member/check-in#event=\(event)&token=\(token)"))
        XCTAssertNil(LinkParser.checkin(from: "https://e-sdy.mn.evil.com/member/check-in#event=\(event)&token=\(token)"))
        XCTAssertNil(LinkParser.checkin(from: "http://e-sdy.mn/member/check-in#event=\(event)&token=\(token)"))
    }

    func testRejectsBadTokenOrEvent() {
        XCTAssertNil(LinkParser.checkin(from: "https://e-sdy.mn/member/check-in#event=\(event)&token=\(token.uppercased())"))
        XCTAssertNil(LinkParser.checkin(from: "https://e-sdy.mn/member/check-in#event=\(event)&token=abc"))
        XCTAssertNil(LinkParser.checkin(from: "https://e-sdy.mn/member/check-in#event=not-a-uuid&token=\(token)"))
        XCTAssertNil(LinkParser.checkin(from: "https://e-sdy.mn/member/other#event=\(event)&token=\(token)"))
        XCTAssertNil(LinkParser.checkin(from: "just text"))
    }
}

final class RegisterNumberTests: XCTestCase {
    func testLatinLookalikesBecomeCyrillic() {
        XCTAssertEqual(RegisterNumber.normalize("ak90010112"), "АК90010112")
        XCTAssertEqual(RegisterNumber.normalize("TX 9001 0112"), "ТХ90010112")
        XCTAssertEqual(RegisterNumber.normalize("уб90010112"), "УБ90010112")
        XCTAssertEqual(RegisterNumber.normalize("YP90010112"), "УР90010112")
    }

    func testLengthIsCapped() {
        XCTAssertEqual(RegisterNumber.normalize("УБ900101129999").count, 10)
    }

    func testValidation() {
        XCTAssertTrue(RegisterNumber.isValid("УБ90010112"))
        XCTAssertTrue(RegisterNumber.isValid("ӨҮ90010112"))
        XCTAssertFalse(RegisterNumber.isValid("UB90010112"))
        XCTAssertFalse(RegisterNumber.isValid("УБ9001011"))
        XCTAssertNil(RegisterNumber.hint(for: ""))
        XCTAssertNil(RegisterNumber.hint(for: "УБ90010112"))
        XCTAssertNotNil(RegisterNumber.hint(for: "УБ900"))
        XCTAssertNotNil(RegisterNumber.hint(for: "1Б90010112"))
        XCTAssertNotNil(RegisterNumber.hint(for: "УБ9001011Б"))
    }
}

final class SessionCookieTests: XCTestCase {
    func testSet() {
        XCTAssertEqual(SessionCookieParser.parse("session_token=abc123; Path=/; HttpOnly; Secure; SameSite=Lax"), .set("abc123"))
    }

    func testClearedByEmptyValueOrMaxAge() {
        XCTAssertEqual(SessionCookieParser.parse("session_token=; Path=/; Max-Age=0"), .cleared)
        XCTAssertEqual(SessionCookieParser.parse("session_token=abc; Path=/; Max-Age=-1"), .cleared)
        XCTAssertEqual(SessionCookieParser.parse("session_token=abc; Expires=Thu, 01 Jan 1970 00:00:00 GMT"), .cleared)
    }

    func testFoldedHeaderWithExpiresComma() {
        let header = "csrf_token=x; Path=/; Expires=Wed, 21 Oct 2099 07:28:00 GMT, session_token=newtoken; Path=/; Expires=Wed, 21 Oct 2099 07:28:00 GMT; HttpOnly"
        XCTAssertEqual(SessionCookieParser.parse(header), .set("newtoken"))
        XCTAssertEqual(SessionCookieParser.split(header).count, 2)
    }

    func testOtherCookiesIgnored() {
        XCTAssertNil(SessionCookieParser.parse("csrf_token=x; Path=/"))
        XCTAssertNil(SessionCookieParser.parse(nil))
        XCTAssertNil(SessionCookieParser.parse("my_session_token=x"))
    }

    func testJSONTokenAndClientCapture() {
        XCTAssertEqual(APIClient.jsonSessionToken(Data(#"{"state":"COMPLETE","session_token":"t1"}"#.utf8)), "t1")
        XCTAssertNil(APIClient.jsonSessionToken(Data(#"{"session_token":""}"#.utf8)))
        XCTAssertNil(APIClient.jsonSessionToken(Data("[]".utf8)))

        let store = TokenStore(inMemory: true)
        let client = APIClient(tokens: store, cache: OfflineCache(directory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)))
        let url = URL(string: "https://e-sdy.mn/api/v1/auth/switch-tenant")!
        let rotated = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Set-Cookie": "session_token=fromcookie; Path=/"])!
        client.captureToken(from: rotated, data: Data("{}".utf8), hadToken: false)
        XCTAssertEqual(store.token, "fromcookie")
        // JSON wins over the cookie.
        client.captureToken(from: rotated, data: Data(#"{"session_token":"fromjson"}"#.utf8), hadToken: true)
        XCTAssertEqual(store.token, "fromjson")
        let cleared = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Set-Cookie": "session_token=; Max-Age=0"])!
        client.captureToken(from: cleared, data: Data(), hadToken: true)
        XCTAssertNil(store.token)
    }
}

final class DeepLinkTests: XCTestCase {
    func testEIDLoginCallback() {
        let url = URL(string: "https://e-sdy.mn/auth/eid/callback?app=ios&sessionId=abc")!
        XCTAssertEqual(LinkParser.deepLink(from: url), .eidCallback(sessionId: "abc", returnPath: nil))
    }

    func testVoteCallbackWithReturn() {
        let url = URL(string: "https://e-sdy.mn/auth/eid/callback?app=ios&return=%2Fmodule%2Fevents%2F3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61")!
        guard case .eidCallback(_, let back)? = LinkParser.deepLink(from: url) else { return XCTFail() }
        XCTAssertEqual(back, "/module/events/3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61")
        XCTAssertEqual(LinkParser.eventPath(back!)?.eventId, "3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61")
    }

    func testUnsafeReturnIsDropped() {
        let url = URL(string: "https://e-sdy.mn/auth/eid/callback?return=%2F%2Fevil.com")!
        XCTAssertEqual(LinkParser.deepLink(from: url), .eidCallback(sessionId: nil, returnPath: nil))
    }

    func testCheckinLink() {
        let token = String(repeating: "0f", count: 24)
        let url = URL(string: "https://e-sdy.mn/member/check-in#event=3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61&token=\(token)")!
        XCTAssertEqual(LinkParser.deepLink(from: url), .checkIn(CheckinCode(eventId: "3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61", token: token)))
    }

    func testForeignLinksIgnored() {
        XCTAssertNil(LinkParser.deepLink(from: URL(string: "https://example.com/auth/eid/callback")!))
        XCTAssertNil(LinkParser.deepLink(from: URL(string: "https://e-sdy.mn/member")!))
    }

    func testNotificationEventPath() {
        let target = LinkParser.eventPath("/module/events/3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61?workspace=t-2")
        XCTAssertEqual(target?.workspace, "t-2")
        XCTAssertNil(LinkParser.eventPath("/member/dues"))
    }

    func testCallbackURL() {
        XCTAssertEqual(AppConfig.eidCallbackURL(), "https://e-sdy.mn/auth/eid/callback?app=ios")
        XCTAssertTrue(AppConfig.eidCallbackURL(returnPath: "/module/events/x").contains("return=/module/events/x"))
    }
}

final class FormattingTests: XCTestCase {
    func testMoney() {
        XCTAssertEqual(Formatters.money(1_250_000), "1,250,000₮")
        XCTAssertEqual(Formatters.money(0), "0₮")
        XCTAssertEqual(Formatters.money(999.6), "1,000₮")
    }

    func testDateInUlaanbaatar() {
        XCTAssertEqual(Formatters.dateTime("2026-10-26T10:30:00Z"), "2026-10-26 18:30")
        XCTAssertEqual(Formatters.dateTime("2026-10-26T10:30:00.123Z"), "2026-10-26 18:30")
        XCTAssertEqual(Formatters.dateTime("garbage"), "—")
        XCTAssertEqual(Formatters.day("2026-10-25"), "2026-10-25")
    }

    func testRelative() {
        let now = Formatters.parseDate("2026-10-26T02:00:00Z")! // 10:00 in Ulaanbaatar
        XCTAssertEqual(Formatters.relative("2026-10-26T10:30:00Z", now: now), "Өнөөдөр 18:30")
        XCTAssertEqual(Formatters.relative("2026-10-27T01:00:00Z", now: now), "Маргааш 09:00")
        XCTAssertEqual(Formatters.relative("2026-10-25T01:00:00Z", now: now), "Өчигдөр 09:00")
        XCTAssertEqual(Formatters.relative("2026-10-29T01:00:00Z", now: now), "3 өдрийн дараа · 09:00")
        XCTAssertEqual(Formatters.relative("2026-12-01T01:00:00Z", now: now), "2026-12-01 09:00")
    }

    func testClockAndPoints() {
        XCTAssertEqual(Formatters.clock(299), "4:59")
        XCTAssertEqual(Formatters.clock(-5), "0:00")
        XCTAssertEqual(Formatters.points(10), "10 оноо")
    }

    func testDuesMath() {
        XCTAssertEqual(DuesMath.percent(1, of: 3), 33)
        XCTAssertEqual(DuesMath.percent(5, of: 0), 100)
        XCTAssertEqual(DuesMath.partAmount(10001, parts: 2), 5001)
        XCTAssertEqual(DuesMath.partChoices(3), [1, 2, 3])
        XCTAssertEqual(DuesMath.partChoices(1), [1])
    }
}

final class ErrorTextTests: XCTestCase {
    func testKnownMessagesBecomeMongolian() {
        let full = APIError(kind: .server(status: 409), serverMessage: "this event is full", code: nil)
        XCTAssertEqual(full.message, "Арга хэмжээний хүний тоо дүүрсэн байна.")
        let expired = APIError(kind: .server(status: 409), serverMessage: "the check-in code is invalid or expired", code: nil)
        XCTAssertTrue(expired.message.contains("хүчингүй"))
        let voted = APIError(kind: .server(status: 409), serverMessage: "you have already voted on this issue", code: nil)
        XCTAssertTrue(voted.message.contains("аль хэдийн санал"))
        let transfer = APIError(kind: .server(status: 409), serverMessage: "transfer_already_pending", code: nil)
        XCTAssertEqual(transfer.message, "Өөр шилжих хүсэлт шийдвэр хүлээж байна.")
    }

    func testUnknownEnglishNeverShown() {
        let odd = APIError(kind: .server(status: 500), serverMessage: "could not frobnicate the widget", code: nil)
        XCTAssertFalse(odd.message.contains("frobnicate"))
        XCTAssertEqual(APIError.network.message, ErrorText.network)
        XCTAssertTrue(APIError.network.message.hasPrefix("Холболт тасарсан"))
        for status in [400, 401, 403, 404, 409, 429, 502, 500, 418] {
            let e = APIError(kind: .server(status: status), serverMessage: "Something English", code: nil)
            XCTAssertNil(e.message.range(of: "[A-Za-z]{4,}", options: .regularExpression), "\(status): \(e.message)")
        }
    }
}

final class PendingEIDSessionTests: XCTestCase {
    override func tearDown() { PendingEIDSession.forget() }

    func testOnlyTheSessionStartedHereIsResumed() {
        XCTAssertFalse(PendingEIDSession.matches("someone-else"))
        PendingEIDSession.remember("mine")
        XCTAssertTrue(PendingEIDSession.matches("mine"))
        XCTAssertFalse(PendingEIDSession.matches("someone-else"))
        XCTAssertFalse(PendingEIDSession.matches(""))
    }

    func testForgottenAfterUse() {
        PendingEIDSession.remember("mine")
        PendingEIDSession.forget()
        XCTAssertFalse(PendingEIDSession.matches("mine"))
    }
}

@MainActor
final class EIDReturnSessionTests: XCTestCase {
    func testHandedOutOnceAndClearedOnSignOut() {
        let app = AppModel()
        app.eidReturnSession = "s1"
        XCTAssertEqual(app.takeEIDReturnSession(), "s1")
        XCTAssertNil(app.takeEIDReturnSession())
        app.eidReturnSession = "s2"
        app.clearLocal()
        XCTAssertNil(app.eidReturnSession)
    }
}
