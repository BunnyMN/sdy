import SwiftUI

/// Discussion and eID-signed votes on one event (components/events/EventDiscussion.tsx).
@MainActor
final class DiscussionModel: ObservableObject {
    enum SigningPhase: Equatable { case starting, waiting, done, failed }

    struct Signing: Identifiable, Equatable {
        var id: String { motion.id }
        let motion: Motion
        let choice: String
        var code: String = ""
        var sessionID: String = ""
        var appLink: String?
        var phase: SigningPhase = .starting
        var message: String?
        var points: Double?
        var deadline: Date = Date().addingTimeInterval(DiscussionModel.pollFor)
    }

    nonisolated static let pollEvery: UInt64 = 2_000_000_000
    nonisolated static let pollFor: TimeInterval = 3 * 60
    static let toleratedFailures = 3

    let eventID: String
    private let api: APIClient
    @Published var data: MotionList?
    @Published var loadError: APIError?
    @Published var actionError: String?
    @Published var signing: Signing?
    @Published var secondsLeft = 0
    @Published var busy = false
    private var watchTask: Task<Void, Never>?
    private var timer: Timer?
    private var resumedOnce = false

    init(eventID: String, api: APIClient = .shared) {
        self.eventID = eventID
        self.api = api
    }

    func load() async {
        do {
            data = try await api.motions(eventID)
            loadError = nil
            resumePendingVote()
        } catch {
            loadError = APIError.wrap(error)
        }
    }

    /// A vote left "signing" — the eID app was opened and the app came back —
    /// is picked up once, by asking about the member's own vote.
    private func resumePendingVote() {
        guard !resumedOnce, signing == nil, let data,
              let pending = data.motions.first(where: { $0.status == "voting" && $0.myVote?.status == "signing" }),
              let vote = pending.myVote else { return }
        resumedOnce = true
        signing = Signing(motion: pending, choice: vote.choice, phase: .waiting)
        watch()
    }

    func vote(_ motion: Motion, choice: String) {
        actionError = nil
        // This vote is followed here; a later load must not reopen it as one
        // left behind (resumePendingVote), e.g. after the member cancels.
        resumedOnce = true
        signing = Signing(motion: motion, choice: choice, phase: .starting)
        watchTask?.cancel()
        watchTask = Task { [weak self] in
            guard let self else { return }
            do {
                let started = try await api.vote(eventID, motion: motion.id, choice: choice)
                guard !Task.isCancelled else { return }
                signing?.code = started.verificationCode
                signing?.sessionID = started.sessionId
                signing?.appLink = started.appLink
                signing?.phase = .waiting
                signing?.deadline = Date().addingTimeInterval(Self.pollFor)
                startTimer()
                if let link = started.appLink, let url = URL(string: link) {
                    await UIApplication.shared.open(url)
                }
                await pollLoop()
            } catch {
                guard !Task.isCancelled else { return }
                signing?.phase = .failed
                signing?.message = APIError.wrap(error).message
                Haptics.error()
            }
        }
    }

    private func watch() {
        watchTask?.cancel()
        startTimer()
        watchTask = Task { [weak self] in await self?.pollLoop() }
    }

    /// Restarts a waiting poll immediately (app returned to the foreground).
    func resume() {
        guard signing?.phase == .waiting else { return }
        watch()
    }

    private func pollLoop() async {
        var failures = 0
        while !Task.isCancelled, let current = signing, current.phase == .waiting {
            if Date() >= current.deadline {
                signing?.phase = .failed
                signing?.message = "Хугацаа дууслаа. Санал тань зурагдаагүй тул дахин оролдоно уу."
                stopTimer()
                return
            }
            try? await Task.sleep(nanoseconds: Self.pollEvery)
            guard !Task.isCancelled else { return }
            do {
                let result = try await api.pollVote(eventID, motion: current.motion.id, sessionID: current.sessionID)
                failures = 0
                switch result.state {
                case "signed":
                    signing?.phase = .done
                    signing?.points = result.points
                    stopTimer()
                    Haptics.success()
                    await load()
                    return
                case "failed":
                    signing?.phase = .failed
                    signing?.message = Self.reasonText(result.reason)
                    stopTimer()
                    Haptics.error()
                    await load()
                    return
                default: break
                }
            } catch {
                let wrapped = APIError.wrap(error)
                if wrapped.kind == .cancelled { return }
                failures += 1
                if !wrapped.isNetwork || failures > Self.toleratedFailures {
                    signing?.phase = .failed
                    signing?.message = wrapped.message
                    stopTimer()
                    await load()
                    return
                }
            }
        }
    }

    func cancelSigning() {
        watchTask?.cancel()
        watchTask = nil
        stopTimer()
        signing = nil
        Task { await load() }
    }

    func propose(title: String, body: String) async -> Bool {
        busy = true; defer { busy = false }
        do {
            try await api.propose(eventID, title: title, body: body)
            await load()
            return true
        } catch {
            actionError = APIError.wrap(error).message
            return false
        }
    }

    private func startTimer() {
        timer?.invalidate()
        tick()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func tick() {
        guard let signing else { return }
        secondsLeft = max(0, Int(ceil(signing.deadline.timeIntervalSinceNow)))
    }

    static func reasonText(_ reason: String?) -> String {
        let r = (reason ?? "").lowercased()
        if r.contains("expire") || r.contains("timeout") { return "eID хүсэлтийн хугацаа дууслаа. Санал тань зурагдаагүй." }
        if r.contains("refus") || r.contains("reject") || r.contains("cancel") { return "Та eID апп дээр татгалзсан тул санал зурагдсангүй." }
        if r.contains("cover") || r.contains("mismatch") { return "Гарын үсэг энэ саналтай таарсангүй. Дахин оролдоно уу." }
        return "Гарын үсэг зурагдсангүй. Дахин оролдоно уу."
    }
}
