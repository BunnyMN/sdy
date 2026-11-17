import XCTest
import Security
@testable import SDYMember

// Tests for the fixes of docs/SDY_IOS_REVIEW_2026-11-09.md (code review #3–#23,
// the Low list and the UI/UX list).

// MARK: - Helpers

/// The JSON body a stubbed request carried (URLProtocol sees it as a stream).
func bodyJSON(_ request: URLRequest) -> [String: Any] {
    var data = request.httpBody ?? Data()
    if data.isEmpty, let stream = request.httpBodyStream {
        stream.open()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let n = stream.read(&buffer, maxLength: buffer.count)
            if n <= 0 { break }
            data.append(buffer, count: n)
        }
        stream.close()
    }
    return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
}

func stubClient(_ store: TokenStore = TokenStore(inMemory: true), cache: OfflineCache? = nil) -> APIClient {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [StubProtocol.self]
    return APIClient(tokens: store,
                     cache: cache ?? OfflineCache(directory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)),
                     session: URLSession(configuration: config))
}

func json(_ text: String) -> Data { Data(text.utf8) }

/// Waits (on the main actor's run loop) until `condition` holds.
@MainActor
func waitUntil(timeout: TimeInterval = 3, _ condition: () -> Bool) async {
    let end = Date().addingTimeInterval(timeout)
    while !condition() && Date() < end { try? await Task.sleep(nanoseconds: 10_000_000) }
}

/// A thread-safe list of what the stub saw.
final class Seen: @unchecked Sendable {
    private let lock = NSLock()
    private var items: [String] = []
    func add(_ s: String) { lock.lock(); items.append(s); lock.unlock() }
    var all: [String] { lock.lock(); defer { lock.unlock() }; return items }
    func count(_ s: String) -> Int { all.filter { $0 == s }.count }
}

private let meT1 = #"{"id":"u1","tenant_id":"t-1","tenant_name":"Салбар 1","name":"Бат Болд","email":"b@e","is_admin":false,"permissions":["events.manage"]}"#
private let meT2 = #"{"id":"u1","tenant_id":"t-2","tenant_name":"Салбар 2","name":"Бат Болд","email":"b@e","is_admin":false,"permissions":["membership.finance"]}"#
private let recordJSON = #"{"memberships":[{"tenant_id":"t-1","name":"Салбар 1","slug":"s1","is_primary":true,"status":"active","has_access":true},{"tenant_id":"t-2","name":"Салбар 2","slug":"s2","is_primary":false,"status":"active","has_access":true}],"profile":{"phone":"","residence":"","notifications_enabled":true},"history":[]}"#

private func decodeMe(_ text: String) -> Me {
    let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
    return try! d.decode(Me.self, from: json(text))
}

// MARK: - #3 branch switch

@MainActor
final class SwitchBranchTests: XCTestCase {
    override func tearDown() { StubProtocol.handler = nil }

    /// The server switched, then /auth/me failed: the app must not stay in
    /// the old branch (with its officer rights) while requests go to the new one.
    func testSwitchThatCannotReadTheNewIdentityStillLeavesTheOldBranch() async {
        let api = stubClient()
        api.tokens.save("tok1")
        let app = AppModel(api: api)
        app.me = decodeMe(meT1)
        app.phase = .signedIn
        app.eventsPath = ["e1"]
        StubProtocol.handler = { request in
            switch request.url!.path {
            case "/api/v1/auth/switch-tenant": return (200, [:], json(#"{"tenant_id":"t-2","switched":true,"session_token":"tok2"}"#))
            case "/api/v1/auth/me": return (500, [:], json(#"{"error":"boom"}"#))
            case "/api/v1/me/member-record": return (200, [:], json(recordJSON))
            default: return (404, [:], Data())
            }
        }
        do {
            try await app.switchBranch(to: "t-2")
            XCTFail("expected the /auth/me failure to be reported")
        } catch {}
        XCTAssertEqual(app.me?.tenantId, "t-2")
        XCTAssertEqual(app.me?.tenantName, "Салбар 2")
        XCTAssertTrue(app.me?.permissions.isEmpty ?? false, "no rights carried over from the old branch")
        XCTAssertFalse(app.can(Permission.manageEvents))
        XCTAssertEqual(api.cacheScope, "t-2")
        XCTAssertEqual(app.epoch, 1, "tabs rebuild")
        XCTAssertEqual(app.eventsPath, [])
        XCTAssertEqual(api.tokens.token, "tok2")
    }

    func testSuccessfulSwitch() async throws {
        let api = stubClient()
        api.tokens.save("tok1")
        let app = AppModel(api: api)
        app.me = decodeMe(meT1)
        app.phase = .signedIn
        StubProtocol.handler = { request in
            switch request.url!.path {
            case "/api/v1/auth/switch-tenant": return (200, [:], json(#"{"tenant_id":"t-2","switched":true,"session_token":"tok2"}"#))
            case "/api/v1/auth/me": return (200, [:], json(meT2))
            case "/api/v1/me/member-record": return (200, [:], json(recordJSON))
            case "/api/v1/me/notifications": return (200, [:], json(#"{"items":[],"unread":4}"#))
            default: return (404, [:], Data())
            }
        }
        try await app.switchBranch(to: "t-2")
        XCTAssertEqual(app.me?.tenantId, "t-2")
        XCTAssertTrue(app.can(Permission.finance))
        XCTAssertEqual(app.epoch, 1)
        XCTAssertEqual(app.unreadCount, 4)
    }
}

// MARK: - #4 push before sign-in, #7 identity refresh, read marks

@MainActor
final class PushAndIdentityTests: XCTestCase {
    override func tearDown() { StubProtocol.handler = nil }

    private func serve(_ seen: Seen, me: @escaping () -> String = { meT1 }) {
        StubProtocol.handler = { request in
            seen.add("\(request.httpMethod ?? "") \(request.url!.path)")
            switch request.url!.path {
            case "/api/v1/auth/me": return (200, [:], json(me()))
            case "/api/v1/me/member-record": return (200, [:], json(recordJSON))
            case "/api/v1/me/notifications": return (200, [:], json(#"{"items":[],"unread":0}"#))
            case "/api/v1/me/notifications/n1/read": return (200, [:], json("{}"))
            case "/api/v1/events/x": return (403, [:], json(#"{"error":"forbidden"}"#))
            default: return (404, [:], json("{}"))
            }
        }
    }

    /// A push tapped while the app was not signed in (it launched the app)
    /// opens its screen once the sign-in finishes.
    func testPushTappedBeforeSignInOpensAfterIt() async {
        let api = stubClient()
        let app = AppModel(api: api)
        app.phase = .signedOut
        app.openPushed(path: "/member/history", notificationID: "n1")
        XCTAssertNotNil(app.pendingPush)
        XCTAssertEqual(app.homePath, [])

        let seen = Seen()
        serve(seen)
        api.tokens.save("tok")
        await app.signedIn()
        XCTAssertEqual(app.phase, .signedIn)
        XCTAssertEqual(app.tab, .home)
        XCTAssertEqual(app.homePath, [.history])
        XCTAssertNil(app.pendingPush)
        XCTAssertEqual(seen.count("POST /api/v1/me/notifications/n1/read"), 1)
    }

    func testSignOutDropsAPendingPush() async {
        let api = stubClient()
        let app = AppModel(api: api)
        app.phase = .signedOut
        app.openPushed(path: "/member/history")
        serve(Seen())
        await app.signOut()
        XCTAssertNil(app.pendingPush)
    }

    /// A position given while the app is open: permissions follow on refresh.
    func testRefreshIdentityPicksUpNewPermissions() async {
        let api = stubClient()
        api.tokens.save("tok")
        let app = AppModel(api: api)
        app.me = decodeMe(meT1)
        app.phase = .signedIn
        var current = #"{"id":"u1","tenant_id":"t-1","tenant_name":"Салбар 1","permissions":["events.manage","events.discipline"]}"#
        serve(Seen(), me: { current })
        await app.refreshIdentity()
        XCTAssertTrue(app.can(Permission.discipline))
        current = #"{"id":"u1","tenant_id":"t-1","tenant_name":"Салбар 1","permissions":[]}"#
        await app.refreshIdentity(minimumInterval: 60)
        XCTAssertTrue(app.can(Permission.discipline), "throttled: not read again within the interval")
        await app.refreshIdentity()
        XCTAssertFalse(app.can(Permission.manageEvents))
        XCTAssertEqual(app.epoch, 0, "same branch: nothing rebuilds")
    }

    /// A 403 means the rights the app shows may be stale: it reads them again.
    func testForbiddenAnswerRereadsIdentity() async {
        let api = stubClient()
        api.tokens.save("tok")
        let app = AppModel(api: api)
        app.me = decodeMe(meT1)
        app.phase = .signedIn
        let seen = Seen()
        serve(seen, me: { #"{"id":"u1","tenant_id":"t-1","permissions":[]}"# })
        _ = try? await api.raw(.get, "/events/x")
        await waitUntil { !app.can(Permission.manageEvents) }
        XCTAssertFalse(app.can(Permission.manageEvents))
        XCTAssertEqual(seen.count("GET /api/v1/auth/me"), 1)
    }

    /// After a partial switch the app is in t-2; the offline copy of /auth/me
    /// is still t-1's. A refresh with no connection must not move it back.
    func testRefreshIdentityOfflineKeepsTheNewBranch() async throws {
        let api = stubClient()
        api.tokens.save("tok")
        StubProtocol.handler = { _ in (200, [:], json(meT1)) }
        _ = try await api.me()  // cached under the person's scope
        let app = AppModel(api: api)
        app.me = decodeMe(meT2)
        app.phase = .signedIn
        api.cacheScope = "t-2"
        let seen = Seen()
        StubProtocol.handler = { request in seen.add(request.url!.path); return (-1, [:], Data()) }
        await app.refreshIdentity()
        XCTAssertEqual(app.me?.tenantId, "t-2")
        XCTAssertEqual(api.cacheScope, "t-2")
        XCTAssertEqual(app.epoch, 0)
        XCTAssertEqual(seen.count("/api/v1/auth/me"), 1, "asked the server, not the cache")
    }

    /// Signed out while the member record was on its way: the late answer is
    /// not written into the next person's session.
    func testRefreshIdentityLateAnswerAfterSignOutWritesNothing() async {
        let api = stubClient()
        api.tokens.save("tok")
        let app = AppModel(api: api)
        app.me = decodeMe(meT1)
        app.phase = .signedIn
        let seen = Seen()
        StubProtocol.handler = { request in
            let path = request.url!.path
            seen.add(path)
            if path == "/api/v1/auth/me" { return (200, [:], json(meT1)) }
            if path == "/api/v1/me/member-record" { Thread.sleep(forTimeInterval: 0.3); return (200, [:], json(recordJSON)) }
            return (200, [:], json("{}"))
        }
        let refresh = Task { await app.refreshIdentity() }
        await waitUntil { seen.count("/api/v1/me/member-record") == 1 }
        app.clearLocal()
        await refresh.value
        XCTAssertNil(app.record)
        XCTAssertNil(app.me)
        XCTAssertEqual(app.phase, .signedOut)
    }

    /// A branch switch while /auth/me was on its way: its answer (the old
    /// branch) does not overwrite the new one.
    func testRefreshIdentityLateAnswerAfterSwitchWritesNothing() async {
        let api = stubClient()
        api.tokens.save("tok")
        let app = AppModel(api: api)
        app.me = decodeMe(meT1)
        app.phase = .signedIn
        let seen = Seen()
        StubProtocol.handler = { request in
            seen.add(request.url!.path)
            Thread.sleep(forTimeInterval: 0.3)
            return (200, [:], json(meT1))
        }
        let refresh = Task { await app.refreshIdentity() }
        await waitUntil { seen.count("/api/v1/auth/me") == 1 }
        app.me = decodeMe(meT2)   // what switchBranch leaves behind
        app.epoch += 1
        await refresh.value
        XCTAssertEqual(app.me?.tenantId, "t-2")
        XCTAssertEqual(app.epoch, 1)
        XCTAssertEqual(seen.count("/api/v1/me/member-record"), 0)
    }

    /// A session that ended on a 401 (clearLocal, not signOut) drops the tap too.
    func testSessionEndDropsAPendingPush() {
        let app = AppModel(api: stubClient())
        app.phase = .signedOut
        app.openPushed(path: "/member/history", notificationID: "n1")
        XCTAssertNotNil(app.pendingPush)
        app.clearLocal()
        XCTAssertNil(app.pendingPush)
    }

    /// Read only when the server agreed (Low: read mark on failure).
    func testNotificationMarkedReadOnlyOnSuccess() async {
        let api = stubClient()
        api.tokens.save("tok")
        let app = AppModel(api: api)
        app.unreadCount = 3
        StubProtocol.handler = { _ in (500, [:], json("{}")) }
        let failed = await app.markNotificationRead("n1")
        XCTAssertFalse(failed)
        XCTAssertEqual(app.unreadCount, 3)
        StubProtocol.handler = { _ in (200, [:], json("{}")) }
        let ok = await app.markNotificationRead("n1")
        XCTAssertTrue(ok)
        XCTAssertEqual(app.unreadCount, 2)
    }
}

// MARK: - #5 binding, eID countdown, EIDLoginModel state machine

@MainActor
final class EIDLoginModelTests: XCTestCase {
    private var savedStore: TokenStore!

    override func setUp() {
        savedStore = PendingEIDSession.bindingStore
        PendingEIDSession.bindingStore = TokenStore(inMemory: true)
        PendingEIDSession.forget()
    }

    override func tearDown() {
        StubProtocol.handler = nil
        PendingEIDSession.forget()
        PendingEIDSession.bindingStore = savedStore
    }

    private static func iso(_ seconds: TimeInterval) -> String {
        ISO8601DateFormatter().string(from: Date().addingTimeInterval(seconds))
    }

    /// The model, started with a registration number (the same-phone path
    /// would open the eID app), and polls answered in turn by `polls`.
    private func started(start: String, polls: [(Int, String)], seen: Seen = Seen()) -> (EIDLoginModel, APIClient) {
        let api = stubClient()
        let lock = NSLock()
        var queue = polls
        StubProtocol.handler = { request in
            let path = request.url!.path
            if path == "/api/v1/auth/eid/start-id" { return (200, [:], json(start)) }
            if path == "/api/v1/auth/eid/poll" {
                seen.add((bodyJSON(request)["binding"] as? String) ?? "-")
                lock.lock(); defer { lock.unlock() }
                if queue.count > 1 { let next = queue.removeFirst(); return (next.0, [:], json(next.1)) }
                let last = queue.first ?? (200, #"{"state":"RUNNING"}"#)
                return (last.0, [:], json(last.1))
            }
            return (404, [:], Data())
        }
        let model = EIDLoginModel(api: api, gap: 5_000_000)
        model.method = .registerNumber
        model.registerNumber = "УБ90010112"
        model.start()
        return (model, api)
    }

    private func isWaiting(_ m: EIDLoginModel) -> Bool { if case .waiting = m.phase { return true }; return false }

    func testCountdownFromExpiresAtAndBindingKept() async {
        let seen = Seen()
        let start = #"{"session_id":"s9","verification_code":"12","expires_at":"\#(Self.iso(120))","binding":"bb"}"#
        let (model, _) = started(start: start, polls: [(200, #"{"state":"RUNNING"}"#)], seen: seen)
        await waitUntil { self.isWaiting(model) && !seen.all.isEmpty }
        XCTAssertTrue(isWaiting(model))
        XCTAssertNotNil(model.secondsLeft)
        XCTAssertTrue((115...120).contains(model.secondsLeft ?? 0))
        XCTAssertEqual(seen.all.first, "bb", "the start's binding goes with the poll")
        XCTAssertEqual(PendingEIDSession.resumable("s9")?.binding, "bb")
        model.cancel()
    }

    func testNoExpiresAtFallsBackToBackstopWithoutCountdown() async {
        let (model, _) = started(start: #"{"session_id":"s9","verification_code":"12"}"#, polls: [(200, #"{"state":"RUNNING"}"#)])
        await waitUntil { self.isWaiting(model) }
        XCTAssertTrue(isWaiting(model))
        XCTAssertNil(model.secondsLeft)
        model.cancel()
    }

    func testCompleteSignsIn() async {
        var signedIn = false
        let (model, api) = started(start: #"{"session_id":"s9","verification_code":"12"}"#,
                                   polls: [(200, #"{"state":"RUNNING"}"#), (200, #"{"state":"COMPLETE","session_token":"T"}"#)])
        model.onSignedIn = { signedIn = true }
        await waitUntil { model.phase == .success && signedIn }
        XCTAssertEqual(model.phase, .success)
        XCTAssertTrue(signedIn)
        XCTAssertEqual(api.tokens.token, "T")
        XCTAssertNil(PendingEIDSession.resumable("s9"), "forgotten once finished")
    }

    func testCompleteWithoutTokenFails() async {
        let (model, _) = started(start: #"{"session_id":"s9"}"#, polls: [(200, #"{"state":"COMPLETE"}"#)])
        await waitUntil { if case .failed = model.phase { return true }; return false }
        guard case .failed = model.phase else { return XCTFail("\(model.phase)") }
    }

    func testExpiredAndRefused() async {
        let (a, _) = started(start: #"{"session_id":"s9"}"#, polls: [(200, #"{"state":"EXPIRED"}"#)])
        await waitUntil { a.phase == .expired }
        XCTAssertEqual(a.phase, .expired)
        let (b, _) = started(start: #"{"session_id":"s9"}"#, polls: [(200, #"{"state":"REFUSED"}"#)])
        await waitUntil { b.phase == .refused }
        XCTAssertEqual(b.phase, .refused)
    }

    /// The server no longer knows the session (404 "eID session expired").
    func testPoll404IsExpired() async {
        let (model, _) = started(start: #"{"session_id":"s9"}"#, polls: [(404, #"{"error":"eID session expired"}"#)])
        await waitUntil { model.phase == .expired }
        XCTAssertEqual(model.phase, .expired)
    }

    func testOtherDeviceIsExplained() async {
        let (model, _) = started(start: #"{"session_id":"s9"}"#, polls: [(403, #"{"error":"eid_session_other_device"}"#)])
        await waitUntil { if case .failed = model.phase { return true }; return false }
        XCTAssertEqual(model.phase, .failed("Энэ eID хүсэлтийг өөр төхөөрөмж эхлүүлсэн байна. Дахин эхлүүлнэ үү."))
    }

    func testThreeDroppedConnectionsAreTolerated() async {
        let (model, _) = started(start: #"{"session_id":"s9"}"#,
                                 polls: [(-1, ""), (-1, ""), (-1, ""), (200, #"{"state":"COMPLETE","session_token":"T"}"#)])
        await waitUntil { model.phase == .success }
        XCTAssertEqual(model.phase, .success)
    }

    func testFourDroppedConnectionsFail() async {
        let (model, _) = started(start: #"{"session_id":"s9"}"#, polls: [(-1, "")])
        await waitUntil { if case .failed = model.phase { return true }; return false }
        XCTAssertEqual(model.phase, .failed(ErrorText.network))
    }

    func testStartRefusalUsesTheServerSentence() async {
        let api = stubClient()
        StubProtocol.handler = { _ in (400, [:], json(#"{"error":"Регистрийн дугаар олдсонгүй эсвэл eID апп-д бүртгэлгүй байна"}"#)) }
        let model = EIDLoginModel(api: api, gap: 5_000_000)
        model.method = .registerNumber
        model.registerNumber = "УБ90010112"
        model.start()
        await waitUntil { if case .failed = model.phase { return true }; return false }
        XCTAssertEqual(model.phase, .failed("Регистрийн дугаар олдсонгүй эсвэл eID апп-д бүртгэлгүй байна. eID Mongolia аппаа идэвхжүүлсэн эсэхээ шалгана уу."))
    }

    /// iOS ended the app while the member was in eID; eID's link reopened it.
    /// The poll after the relaunch carries the binding kept from the start.
    func testResumeAfterRelaunchSendsTheKeptBinding() async {
        PendingEIDSession.remember("s1", binding: "b1", expiresAt: Self.iso(300))
        let seen = Seen()
        StubProtocol.handler = { request in
            seen.add((bodyJSON(request)["binding"] as? String) ?? "-")
            return (200, [:], json(#"{"state":"COMPLETE","session_token":"T"}"#))
        }
        let model = EIDLoginModel(api: stubClient(), gap: 5_000_000)
        model.resume(sessionFromLink: "someone-else")
        XCTAssertEqual(model.phase, .idle, "a session this phone did not start is ignored")
        model.resume(sessionFromLink: "s1")
        await waitUntil { model.phase == .success }
        XCTAssertEqual(model.phase, .success)
        XCTAssertEqual(seen.all, ["b1"])
    }

    func testPendingSessionKeepsBindingAndEnd() {
        PendingEIDSession.remember("s1", binding: "b1", expiresAt: "2030-01-01T00:00:00Z")
        XCTAssertEqual(PendingEIDSession.resumable("s1")?.binding, "b1")
        XCTAssertEqual(PendingEIDSession.resumable("s1")?.expiresAt, "2030-01-01T00:00:00Z")
        XCTAssertNil(PendingEIDSession.resumable("s2"))
        PendingEIDSession.forget()
        XCTAssertNil(PendingEIDSession.resumable("s1"))
        XCTAssertNil(PendingEIDSession.bindingStore.token)
    }

    /// The binding is kept in the real Keychain (not UserDefaults).
    func testBindingRoundTripsThroughTheKeychain() throws {
        // An unsigned simulator build (CODE_SIGNING_ALLOWED=NO) has no Keychain access group.
        let probe: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "probe",
                                    kSecAttrAccount as String: UUID().uuidString, kSecValueData as String: Data("x".utf8)]
        let status = SecItemAdd(probe as CFDictionary, nil)
        SecItemDelete(probe as CFDictionary)
        try XCTSkipIf(status == errSecMissingEntitlement, "Keychain unavailable in an unsigned test build")
        let account = "test_binding_\(UUID().uuidString)"
        let store = TokenStore(account: account)
        store.save("secret")
        // A fresh store (a relaunch) reads it back from the Keychain.
        XCTAssertEqual(TokenStore(account: account).token, "secret")
        store.clear()
        XCTAssertNil(TokenStore(account: account).token)
    }

    func testStartDecodesExpiresAtAndBinding() throws {
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        let s = try d.decode(EIDStart.self, from: json(#"{"session_id":"s","verification_code":"1234","expires_at":"2030-01-01T00:00:00Z","binding":"b"}"#))
        XCTAssertEqual(s.expiresAt, "2030-01-01T00:00:00Z")
        XCTAssertEqual(s.binding, "b")
        let old = try d.decode(EIDStart.self, from: json(#"{"session_id":"s"}"#))
        XCTAssertNil(old.expiresAt)
    }
}

// MARK: - #8 idempotency

final class IdempotencyTests: XCTestCase {
    override func tearDown() { StubProtocol.handler = nil }

    func testOneKeyPerIntent() {
        var intent = IntentKey()
        let first = intent.key(for: "u1|5|late")
        XCTAssertEqual(intent.key(for: "u1|5|late"), first, "a retry reuses the key")
        let changed = intent.key(for: "u1|6|late")
        XCTAssertNotEqual(changed, first, "a different decision gets a new key")
        intent.reset()
        XCTAssertNotEqual(intent.key(for: "u1|6|late"), changed)
    }

    /// A (answer lost) → B → back to A: A keeps its key, so the server can
    /// see it is the same decision and not record it twice.
    func testReturningToAnEarlierDecisionReusesItsKey() {
        var intent = IntentKey()
        let a = intent.key(for: "u1|5|late")
        let b = intent.key(for: "u2|5|late")
        XCTAssertNotEqual(a, b)
        XCTAssertEqual(intent.key(for: "u1|5|late"), a)
        XCTAssertEqual(intent.key(for: "u2|5|late"), b)
    }

    func testSanctionSendsTheKeyOnEveryRetry() async throws {
        let api = stubClient()
        api.tokens.save("tok")
        let seen = Seen()
        StubProtocol.handler = { request in
            seen.add(request.value(forHTTPHeaderField: "Idempotency-Key") ?? "-")
            return (200, [:], json(#"{"id":"s1","points":5}"#))
        }
        var intent = IntentKey()
        let key = intent.key(for: "u2|5|reason")
        _ = try await api.sanction(userID: "u2", points: 5, reason: "reason", idempotencyKey: key)
        _ = try await api.sanction(userID: "u2", points: 5, reason: "reason", idempotencyKey: intent.key(for: "u2|5|reason"))
        XCTAssertEqual(seen.all, [key, key])
        XCTAssertEqual(UUID(uuidString: key)?.uuidString, key)
    }
}

// MARK: - #15 error mapping, #16 transient

@MainActor
final class AuditErrorTextTests: XCTestCase {
    private func text(_ status: Int, _ message: String) -> String {
        APIError(kind: .server(status: status), serverMessage: message, code: nil).message
    }

    func testNewServerSentences() {
        XCTAssertEqual(text(409, "every place on this task is taken"), "Энэ ажлын бүх суудал дүүрсэн байна.")
        XCTAssertEqual(text(403, "a decision about yourself is for the rest of the committee"), "Өөрийнхөө талаарх шийдвэрийг хорооны бусад гишүүд гаргана.")
        XCTAssertEqual(text(409, "points cannot change after attendance has been recorded"), "Ирц бүртгэгдсэний дараа оноог өөрчлөх боломжгүй.")
        XCTAssertEqual(text(400, "provide a reason for the attendance correction"), "Ирц залруулах шалтгаанаа бичнэ үү.")
        XCTAssertEqual(text(409, "this payment cannot make that transition"), "Төлбөрийн төлөв өөрчлөгдсөн байна. Шинэчлээд дахин оролдоно уу.")
        XCTAssertEqual(text(409, "the vote closed before your signature arrived"), "Гарын үсэг ирэхээс өмнө санал хураалт хаагдсан тул санал тоологдсонгүй.")
        XCTAssertEqual(text(404, "eID session expired"), "eID хүсэлтийн хугацаа дууслаа. Дахин эхлүүлнэ үү.")
        XCTAssertEqual(text(400, "invalid eID callback URL"), "eID буцах хаяг буруу байна. Аппаа шинэчилнэ үү.")
    }

    /// Wording the backend is still adding is recognised by its parts.
    func testSelfActionsAndCancelledEventsByStatus() {
        XCTAssertEqual(text(403, "you cannot confirm your own task"), "Өөрийнхөө ажлыг өөрөө батлах боломжгүй.")
        XCTAssertEqual(text(403, "organisers cannot mark their own attendance"),
                       "Өөрийнхөө талаар энэ үйлдлийг хийх боломжгүй. Өөр эрх бүхий хүнд хандана уу.")
        XCTAssertEqual(text(403, "finance cannot approve a payment for yourself"),
                       "Өөрийнхөө талаар энэ үйлдлийг хийх боломжгүй. Өөр эрх бүхий хүнд хандана уу.")
        XCTAssertEqual(text(409, "the event was cancelled"), "Энэ арга хэмжээ цуцлагдсан тул үйлдлийг хийх боломжгүй.")
        XCTAssertEqual(text(409, "this event is cancelled"), "Энэ арга хэмжээ цуцлагдсан.")
        XCTAssertEqual(text(409, "cannot waive a charge with a pending payment"),
                       "Хүлээгдэж буй төлбөртэй хураамжийг чөлөөлөх боломжгүй. Эхлээд төлбөрийг батлах эсвэл татгалзана уу.")
        XCTAssertEqual(text(403, "forbidden"), "Энэ үйлдлийг хийх эрх танд алга.")
        XCTAssertEqual(text(409, "something else"), ErrorText.fallback(status: 409))
    }

    func testTransient() {
        XCTAssertTrue(APIError.network.isTransient)
        XCTAssertTrue(APIError(kind: .server(status: 503), serverMessage: "", code: nil).isTransient)
        XCTAssertTrue(APIError(kind: .server(status: 502), serverMessage: "", code: nil).isTransient)
        XCTAssertFalse(APIError(kind: .server(status: 500), serverMessage: "", code: nil).isTransient)
        XCTAssertFalse(APIError(kind: .server(status: 409), serverMessage: "", code: nil).isTransient)
    }

    func testEIDPollMessages() {
        XCTAssertEqual(EIDLoginModel.pollMessage(APIError(kind: .server(status: 403), serverMessage: "suspended", code: nil)),
                       "Энэ системд нэвтрэх эрх олгогдоогүй байна. Салбартаа хандана уу.")
        XCTAssertEqual(EIDLoginModel.pollMessage(APIError(kind: .unauthorized, serverMessage: "unauthorized", code: nil)),
                       "eID баталгаажуулалт амжилтгүй боллоо. Дахин оролдоно уу.")
        XCTAssertEqual(EIDLoginModel.pollMessage(APIError(kind: .server(status: 502), serverMessage: "eID Mongolia session check failed", code: nil)),
                       "eID Mongolia-тай холбогдож чадсангүй. Дахин оролдоно уу.")
    }
}

// MARK: - #16, #17 votes; #19 tasks

@MainActor
final class VoteAndTaskTests: XCTestCase {
    override func tearDown() { StubProtocol.handler = nil }

    private let motionJSON = #"{"id":"m1","event_id":"e1","title":"Асуудал","status":"voting","my_vote":{"choice":"yes","status":"signing"}}"#

    private func motion() throws -> Motion {
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        return try d.decode(Motion.self, from: json(motionJSON))
    }

    /// eID's gateway failing once does not fail the vote.
    func testGatewayErrorOnceIsRetried() async throws {
        let seen = Seen()
        StubProtocol.handler = { request in
            let path = request.url!.path
            if path.hasSuffix("/vote/poll") {
                seen.add("poll")
                return seen.count("poll") == 1 ? (503, [:], json("{}")) : (200, [:], json(#"{"state":"signed","points":5}"#))
            }
            if path.hasSuffix("/vote") { return (200, [:], json(#"{"session_id":"v1","verification_code":"12","state":"signing"}"#)) }
            return (200, [:], json(#"{"motions":[],"can_vote":true,"signing_ready":true}"#))
        }
        let model = DiscussionModel(eventID: "e1", api: stubClient(), pollInterval: 5_000_000)
        model.vote(try motion(), choice: "yes")
        await waitUntil { model.signing?.phase == .done || model.signing?.phase == .failed }
        XCTAssertEqual(model.signing?.phase, .done)
        XCTAssertEqual(seen.count("poll"), 2)
    }

    /// «Шалгах» on a vote left signing asks about it (empty session) instead of voting again.
    func testCheckAsksAboutTheOwnVote() async throws {
        let seen = Seen()
        StubProtocol.handler = { request in
            let path = request.url!.path
            if path.hasSuffix("/vote/poll") {
                seen.add("session=" + ((bodyJSON(request)["session_id"] as? String) ?? "?"))
                return (200, [:], json(#"{"state":"signed"}"#))
            }
            if path.hasSuffix("/vote") { seen.add("VOTE"); return (500, [:], json("{}")) }
            return (200, [:], json(#"{"motions":[]}"#))
        }
        let model = DiscussionModel(eventID: "e1", api: stubClient(), pollInterval: 5_000_000)
        model.check(try motion())
        await waitUntil { model.signing?.phase == .done }
        XCTAssertEqual(model.signing?.phase, .done)
        XCTAssertEqual(seen.all.first, "session=")
        XCTAssertEqual(seen.count("VOTE"), 0)
    }

    /// The last place went to somebody else: the list is read again.
    func testRefusedTaskReloadsTheList() async {
        let seen = Seen()
        StubProtocol.handler = { request in
            if request.httpMethod == "POST" { return (409, [:], json(#"{"error":"every place on this task is taken"}"#)) }
            seen.add("GET")
            return (200, [:], json(#"{"tasks":[{"id":"t1","title":"Ширээ","points":5,"slots":1,"taken":1,"assignments":[]}],"me":"u1"}"#))
        }
        let model = TasksModel(eventID: "e1", api: stubClient())
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        let task = try! d.decode(EventTask.self, from: json(#"{"id":"t1","event_id":"e1","title":"Ширээ","points":5,"slots":1,"taken":0}"#))
        await model.volunteer(task)
        XCTAssertEqual(model.error, "Энэ ажлын бүх суудал дүүрсэн байна.")
        XCTAssertEqual(seen.count("GET"), 1)
        XCTAssertEqual(model.data?.tasks.first?.taken, 1)
    }
}

// MARK: - Formatting (Ulaanbaatar time), events, paging

final class AuditFormattingTests: XCTestCase {
    private var savedZone: TimeZone!
    override func setUp() {
        savedZone = NSTimeZone.default
        // The phone is set elsewhere: nothing below may follow it.
        NSTimeZone.default = TimeZone(identifier: "America/New_York")!
    }
    override func tearDown() { NSTimeZone.default = savedZone }

    func testRangeOnOneDayAndAcross() {
        let now = Formatters.parseDate("2026-11-01T00:00:00Z")!
        // 10:30Z = 18:30 in Ulaanbaatar.
        XCTAssertEqual(Formatters.range("2026-11-09T10:30:00Z", "2026-11-09T12:30:00Z", now: now), "11-р сарын 9, 18:30–20:30")
        XCTAssertEqual(Formatters.range("2026-11-09T10:30:00Z", "2026-11-10T04:00:00Z", now: now), "11-р сарын 9, 18:30 – 11-р сарын 10, 12:00")
        XCTAssertEqual(Formatters.range("2026-11-09T10:30:00Z", nil, now: now), "11-р сарын 9, 18:30")
        XCTAssertEqual(Formatters.range("2027-01-05T02:00:00Z", nil, now: now), "2027 оны 1-р сарын 5, 10:00")
        XCTAssertEqual(Formatters.range(nil, nil, now: now), "—")
    }

    func testListBadgeIsUlaanbaatarsDay() {
        // 17:30Z on the 9th is already 01:30 on the 10th in Ulaanbaatar.
        let date = Formatters.parseDate("2026-11-09T17:30:00Z")!
        XCTAssertEqual(Formatters.dayMonth(date).day, 10)
        XCTAssertEqual(Formatters.dayMonth(date).month, 11)
    }

    func testDuesPeriodsFollowUlaanbaatarsMonth() {
        // 31 Oct 17:00Z is 1 Nov 01:00 in Ulaanbaatar.
        let now = Formatters.parseDate("2026-10-31T17:00:00Z")!
        let periods = Formatters.recentPeriods(3, now: now)
        XCTAssertEqual(periods, ["2026-11", "2026-10", "2026-09"])
    }

    private func event(_ text: String) throws -> EventRecord {
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        return try d.decode(EventRecord.self, from: json(text))
    }

    /// A three-day camp is upcoming until it ends, not six hours after it starts.
    func testMultiDayEventIsPastOnlyAfterItEnds() throws {
        let now = Formatters.parseDate("2026-11-10T12:00:00Z")!
        let camp = try event(#"{"id":"c","title":"Зуслан","starts_at":"2026-11-09T02:00:00Z","ends_at":"2026-11-12T02:00:00Z","status":"planned"}"#)
        let talk = try event(#"{"id":"t","title":"Хурал","starts_at":"2026-11-10T02:00:00Z","status":"planned"}"#)
        let done = try event(#"{"id":"d","title":"Болсон","starts_at":"2026-11-20T02:00:00Z","status":"done"}"#)
        XCTAssertFalse(camp.isPast(now: now))
        XCTAssertTrue(talk.isPast(now: now), "no end: six hours after the start")
        XCTAssertTrue(done.isPast(now: now))
        XCTAssertEqual(EventsListView.filter([camp, talk, done], .upcoming, now: now).map(\.id), ["c"])
        XCTAssertEqual(EventsListView.filter([camp, talk, done], .past, now: now).map(\.id), ["d", "t"])
    }

    func testShortCapacity() throws {
        XCTAssertEqual(try event(#"{"id":"a","registered":12,"attended":0,"capacity":50}"#).capacityShort, "12/50 бүртгүүлсэн")
        XCTAssertEqual(try event(#"{"id":"a","registered":12,"attended":3}"#).capacityShort, "12 бүртгүүлсэн · 3 ирсэн")
    }

    func testPagesDoNotRepeatRows() {
        struct Row: Identifiable, Equatable { let id: Int }
        let first = [Row(id: 1), Row(id: 2), Row(id: 3)]
        // A row inserted on the server shifted the offset: 3 comes again.
        XCTAssertEqual(first.appendingUnique([Row(id: 3), Row(id: 4)]).map(\.id), [1, 2, 3, 4])
        XCTAssertEqual(first.appendingUnique([]).map(\.id), [1, 2, 3])
    }
}

// MARK: - Session leftovers: cache after sign-out, reinstall

final class SessionLeftoverTests: XCTestCase {
    override func tearDown() { StubProtocol.handler = nil }

    /// An answer that arrives after sign-out (the cache was wiped while it
    /// was in flight) is not written back for the next person to see.
    func testLateAnswerAfterSignOutIsNotCached() async throws {
        let cache = OfflineCache(directory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let api = stubClient(cache: cache)
        api.tokens.save("tok")
        StubProtocol.handler = { _ in
            cache.clearAll()  // signed out meanwhile
            return (200, [:], json(#"{"items":[],"unread":7}"#))
        }
        _ = try await api.notifications()
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertNil(cache.load(scope: api.scope(for: "/me/notifications?offset=0"), path: "/me/notifications?offset=0"))

        StubProtocol.handler = { _ in (200, [:], json(#"{"items":[],"unread":7}"#)) }
        _ = try await api.notifications()
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertNotNil(cache.load(scope: api.scope(for: "/me/notifications?offset=0"), path: "/me/notifications?offset=0"))
    }

    func testReinstallClearsTheKeychainToken() {
        let defaults = UserDefaults(suiteName: "test.\(UUID().uuidString)")!
        let store = TokenStore(inMemory: true)
        store.save("left-from-before")
        XCTAssertTrue(TokenStore.clearIfFreshInstall([store], hasLocalData: false, defaults: defaults))
        XCTAssertNil(store.token)
        store.save("new")
        XCTAssertFalse(TokenStore.clearIfFreshInstall([store], hasLocalData: false, defaults: defaults), "only the first launch")
        XCTAssertEqual(store.token, "new")
    }

    /// An update from 1.1.1 (no marker yet, but the app's own files are there)
    /// keeps the member signed in.
    func testUpdateKeepsTheToken() {
        let defaults = UserDefaults(suiteName: "test.\(UUID().uuidString)")!
        let store = TokenStore(inMemory: true)
        store.save("signed-in")
        XCTAssertFalse(TokenStore.clearIfFreshInstall([store], hasLocalData: true, defaults: defaults))
        XCTAssertEqual(store.token, "signed-in")
        XCTAssertTrue(defaults.bool(forKey: "install.marker"))
    }
}

// MARK: - Small screen logic

@MainActor
final class ScreenLogicTests: XCTestCase {
    private func event(_ text: String) throws -> EventRecord {
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        return try d.decode(EventRecord.self, from: json(text))
    }

    /// #18 / UI #8: nothing to confirm → a reason and «Хаах», never a dead button.
    func testCheckInConfirmBlockedReasons() throws {
        XCTAssertNil(CheckInConfirmView.blockedReason(try event(#"{"id":"e","status":"planned","my_status":"registered"}"#)))
        XCTAssertNil(CheckInConfirmView.blockedReason(try event(#"{"id":"e","status":"planned","my_status":""}"#)))
        XCTAssertEqual(CheckInConfirmView.blockedReason(try event(#"{"id":"e","status":"planned","my_status":"attended"}"#)),
                       "Таны ирц аль хэдийн баталгаажсан байна.")
        XCTAssertEqual(CheckInConfirmView.blockedReason(try event(#"{"id":"e","status":"done","my_status":"registered"}"#)),
                       "Энэ арга хэмжээ хаагдсан тул ирц бүртгэх боломжгүй.")
        XCTAssertEqual(CheckInConfirmView.blockedReason(try event(#"{"id":"e","status":"cancelled","my_status":"registered"}"#)),
                       "Энэ арга хэмжээ цуцлагдсан тул ирц бүртгэх боломжгүй.")
        XCTAssertNotNil(CheckInConfirmView.blockedReason(try event(#"{"id":"e","status":"planned","my_status":"absent"}"#)))
    }

    /// #20: Нүүр reloads when what it shows is older than a minute.
    func testLoaderRefreshesOnlyWhenStale() async {
        var calls = 0
        let loader = Loader<Int> { calls += 1; return calls }
        await loader.refresh(olderThan: 60)
        XCTAssertEqual(calls, 0, "nothing shown yet is loadIfNeeded's job")
        await loader.loadIfNeeded()
        XCTAssertEqual(calls, 1)
        await loader.refresh(olderThan: 60)
        XCTAssertEqual(calls, 1, "fresh")
        await loader.refresh(olderThan: 60, now: Date().addingTimeInterval(61))
        XCTAssertEqual(calls, 2)
    }

    /// #10: anybody in the branch can be found, not only the first 30.
    func testPersonPickerSearches() {
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        let list = (0..<80).map { #"{"user_id":"u\#($0)","name":"Гишүүн \#($0)","email":"m\#($0)@e-sdy.mn"}"# }.joined(separator: ",")
        let people = try! d.decode([BranchPerson].self, from: json("[\(list)]"))
        XCTAssertEqual(PersonPicker.filter(people, "").count, 80)
        XCTAssertEqual(PersonPicker.filter(people, "Гишүүн 75").map(\.userId), ["u75"])
        XCTAssertEqual(PersonPicker.filter(people, "M42@").map(\.userId), ["u42"])
    }
}
