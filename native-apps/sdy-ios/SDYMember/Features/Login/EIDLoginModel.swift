import SwiftUI

/// eID Mongolia sign-in: start a session, then long-poll until eID answers.
///
/// Mirrors frontend/components/EIDLogin.tsx: one poll at a time (the server
/// holds each for up to 25 s), a 400 ms gap, three dropped connections
/// tolerated, and the server's EXPIRED/REFUSED as the only real ends. On iOS
/// the poll also restarts the moment the app returns to the foreground or
/// eID's universal link reopens it.
@MainActor
final class EIDLoginModel: ObservableObject {
    enum Method: String, CaseIterable, Identifiable {
        case registerNumber, samePhone
        var id: String { rawValue }
        var title: String { self == .registerNumber ? "Регистрийн дугаар" : "Энэ утсаар" }
    }

    enum Phase: Equatable {
        case idle
        case starting
        case waiting(EIDStart)
        case expired
        case refused
        case failed(String)
        case success
    }

    static let gap: UInt64 = 400_000_000
    static let toleratedFailures = 3
    static let backstop: TimeInterval = 15 * 60

    @Published var method: Method = .registerNumber
    @Published var registerNumber = "" {
        didSet {
            let normalized = RegisterNumber.normalize(registerNumber)
            if normalized != registerNumber { registerNumber = normalized }
        }
    }
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var secondsLeft: Int?
    @Published var eidAppMissing = false

    private var pollTask: Task<Void, Never>?
    private var countdown: Timer?
    private var deadline: Date = .distantFuture
    private var hasDeadline = false
    private let api: APIClient
    var onSignedIn: (() async -> Void)?

    init(api: APIClient = .shared) { self.api = api }

    var registerHint: String? { RegisterNumber.hint(for: registerNumber) }
    var canStart: Bool {
        switch phase { case .starting, .waiting: return false; default: break }
        return method == .samePhone || RegisterNumber.isValid(registerNumber)
    }
    var isBusy: Bool {
        switch phase { case .starting, .waiting: return true; default: return false }
    }

    static func eidAppInstalled() -> Bool {
        AppConfig.eidSchemes.contains { scheme in
            guard let url = URL(string: "\(scheme)://") else { return false }
            return UIApplication.shared.canOpenURL(url)
        }
    }

    func start() {
        stop()
        eidAppMissing = false
        if method == .samePhone && !AppConfig.fixturesEnabled && !Self.eidAppInstalled() {
            eidAppMissing = true
            return
        }
        phase = .starting
        let method = self.method
        let regno = registerNumber
        pollTask = Task { [weak self] in
            guard let self else { return }
            do {
                let started = method == .registerNumber
                    ? try await api.eidStartByID(nationalID: regno)
                    : try await api.eidStartSamePhone()
                guard !Task.isCancelled else { return }
                self.begin(started)
                PendingEIDSession.remember(started.sessionId)
                if method == .samePhone, let link = started.appLink, let url = URL(string: link) {
                    await UIApplication.shared.open(url)
                }
                await self.pollLoop(started)
            } catch {
                guard !Task.isCancelled else { return }
                self.phase = .failed(Self.startMessage(APIError.wrap(error)))
            }
        }
    }

    private func begin(_ started: EIDStart) {
        if let at = Formatters.parseDate(started.expiresAt) {
            deadline = at
            hasDeadline = true
        } else {
            deadline = Date().addingTimeInterval(Self.backstop)
            hasDeadline = false
        }
        phase = .waiting(started)
        startCountdown()
    }

    /// Restarts a waiting poll right away — after the app comes back to the
    /// foreground, a long-poll that iOS suspended is likely dead.
    func resume(sessionFromLink: String? = nil) {
        if case .waiting(let started) = phase {
            pollTask?.cancel()
            pollTask = Task { [weak self] in await self?.pollLoop(started) }
        } else if let session = sessionFromLink, phase == .idle || phase == .starting,
                  PendingEIDSession.matches(session) {
            // The app was relaunched by eID's universal link: pick the session up —
            // only one this phone started, so a link from someone else cannot sign
            // the member into another account.
            let started = EIDStart(resumingSession: session)
            begin(started)
            pollTask?.cancel()
            pollTask = Task { [weak self] in await self?.pollLoop(started) }
        }
    }

    private func pollLoop(_ started: EIDStart) async {
        var failures = 0
        while !Task.isCancelled {
            if Date() >= deadline { finish(.expired); return }
            do {
                let result = try await api.eidPoll(sessionID: started.sessionId)
                guard !Task.isCancelled else { return }
                failures = 0
                switch result.state.uppercased() {
                case "COMPLETE":
                    guard api.tokens.hasToken else {
                        finish(.failed("eID баталгаажсан боловч нэвтрэх эрх олгогдсонгүй. Дахин оролдоно уу."))
                        return
                    }
                    finish(.success)
                    Haptics.success()
                    await onSignedIn?()
                    return
                case "EXPIRED": finish(.expired); return
                case "REFUSED": finish(.refused); return
                default: break
                }
            } catch {
                guard !Task.isCancelled else { return }
                let wrapped = APIError.wrap(error)
                if wrapped.kind == .cancelled { return }
                // A 4xx is an answer, not a dropped connection.
                if case .server(let status) = wrapped.kind, (400..<500).contains(status) {
                    finish(.failed(Self.pollMessage(wrapped))); return
                }
                if wrapped.kind == .unauthorized { finish(.failed(Self.pollMessage(wrapped))); return }
                failures += 1
                if failures > Self.toleratedFailures { finish(.failed(wrapped.message)); return }
            }
            try? await Task.sleep(nanoseconds: Self.gap)
        }
    }

    private func finish(_ phase: Phase) {
        PendingEIDSession.forget()
        countdown?.invalidate()
        countdown = nil
        self.phase = phase
        if case .failed = phase { Haptics.error() }
        if phase == .refused || phase == .expired { Haptics.error() }
    }

    func cancel() {
        stop()
        PendingEIDSession.forget()
        phase = .idle
    }

    private func stop() {
        pollTask?.cancel()
        pollTask = nil
        countdown?.invalidate()
        countdown = nil
        secondsLeft = nil
    }

    private func startCountdown() {
        countdown?.invalidate()
        guard hasDeadline else { secondsLeft = nil; return }
        tick()
        countdown = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    private func tick() {
        let left = Int(ceil(deadline.timeIntervalSinceNow))
        secondsLeft = max(0, left)
        if left <= 0, case .waiting = phase { stop(); phase = .expired }
    }

    static func startMessage(_ error: APIError) -> String {
        switch error.status {
        case 400: return "Регистрийн дугаараа шалгаад дахин оролдоно уу."
        case 403: return "Энэ системд нэвтрэх эрх олгогдоогүй байна. Салбартаа хандана уу."
        case 404: return "Энэ регистрийн дугаартай eID бүртгэл олдсонгүй. eID Mongolia аппаа идэвхжүүлсэн эсэхээ шалгана уу."
        case 502, 503, 504: return "eID Mongolia-тай холбогдож чадсангүй. Түр хүлээгээд дахин оролдоно уу."
        default: return error.message
        }
    }

    static func pollMessage(_ error: APIError) -> String {
        switch error.status {
        case 401: return "eID баталгаажуулалт амжилтгүй боллоо. Дахин оролдоно уу."
        case 403: return "Энэ системд нэвтрэх эрх олгогдоогүй байна. Салбартаа хандана уу."
        default: return error.message
        }
    }
}

/// The "this phone" eID session in flight, kept across a relaunch: iOS may end
/// the app while the member is in the eID app, and the universal link that
/// brings them back must match a session started here.
enum PendingEIDSession {
    private static let idKey = "eid.pendingSession"
    private static let atKey = "eid.pendingSessionAt"
    /// Longer than any eID session lives (EIDLoginModel's backstop).
    private static let lifetime: TimeInterval = 15 * 60

    static func remember(_ id: String) {
        UserDefaults.standard.set(id, forKey: idKey)
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: atKey)
    }

    static func matches(_ id: String) -> Bool {
        guard !id.isEmpty, UserDefaults.standard.string(forKey: idKey) == id else { return false }
        let at = UserDefaults.standard.double(forKey: atKey)
        return Date().timeIntervalSince1970 - at < lifetime
    }

    static func forget() {
        UserDefaults.standard.removeObject(forKey: idKey)
        UserDefaults.standard.removeObject(forKey: atKey)
    }
}
