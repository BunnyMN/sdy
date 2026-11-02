import ImageIO
import SwiftUI

/// The signed-in state of the app and everything that moves between screens:
/// which tab is open, which event a link points at, a pending check-in.
@MainActor
final class AppModel: ObservableObject {
    enum Phase: Equatable { case launching, signedOut, signedIn, failed(APIError) }
    enum Tab: Hashable { case home, events, checkin, dues, profile }

    @Published var phase: Phase = .launching
    @Published var me: Me?
    @Published var record: MemberRecord?
    @Published var isOffline = false
    @Published var tab: Tab = .home
    /// Bumped after a branch switch so every tab rebuilds from scratch.
    @Published var epoch = 0
    @Published var signOutReason: String?
    @Published var pendingCheckin: CheckinCode?
    @Published var eventsPath: [String] = []
    @Published var homePath: [HomeRoute] = []
    @Published var unreadCount = 0
    /// Bumped whenever the app returns to the foreground or eID returns to it,
    /// so a waiting eID poll can restart at once.
    @Published var resumeTick = 0
    @Published var eidReturnSession: String?
    /// The signed-in person's profile photo, shown on Home and Profile.
    @Published var photo: UIImage?

    let api: APIClient

    var hasApprovedBranch: Bool { record?.approvedBranch != nil }

    init(api: APIClient = .shared) {
        self.api = api
        api.onSessionEnded = { [weak self] in self?.sessionEnded() }
        api.onReachability = { [weak self] reachable in
            guard let self, self.isOffline == reachable else { return }
            self.isOffline = !reachable
        }
        #if DEBUG
        if AppConfig.fixturesEnabled { api.tokens.save("fixture-token") }
        #endif
    }

    // MARK: - Session

    func bootstrap() async {
        guard api.tokens.hasToken else { phase = .signedOut; return }
        do {
            try await loadIdentity()
            phase = .signedIn
            applyLaunchArguments()
            Task { await loadPhoto() }
            await refreshUnread()
        } catch let error as APIError where error.kind == .unauthorized {
            clearLocal()
        } catch {
            phase = .failed(APIError.wrap(error))
        }
    }

    /// Who is signed in and which branch they belong to. A member whose
    /// session sits in a workspace that is not one of their branches (their
    /// personal home, say) is moved into their approved branch.
    func loadIdentity() async throws {
        var identity = try await api.me()
        api.cacheScope = identity.tenantId
        let record = try await api.memberRecord()
        if let approved = record.approvedBranch, approved.hasAccess,
           !record.memberships.contains(where: { $0.tenantId == identity.tenantId && $0.hasAccess }) {
            if (try? await api.switchTenant(approved.tenantId)) != nil {
                identity = try await api.me()
            }
        }
        api.cacheScope = identity.tenantId
        me = identity
        self.record = record
    }

    func signedIn() async {
        signOutReason = nil
        phase = .launching
        await bootstrap()
        guard pendingCheckin != nil, phase == .signedIn else { return }
        // Check-in is a branch member's tab; without a branch there is
        // nothing to check in to.
        if hasApprovedBranch { tab = .checkin } else { pendingCheckin = nil }
    }

    func signOut() async {
        await api.logout()
        clearLocal()
    }

    func clearLocal() {
        api.tokens.clear()
        api.cache.clearAll()
        me = nil
        record = nil
        tab = .home
        eventsPath = []
        homePath = []
        unreadCount = 0
        eidReturnSession = nil
        photo = nil
        phase = .signedOut
    }

    /// The eID session a universal link brought back, handed out once: a
    /// session left here would be polled again by the next login screen.
    func takeEIDReturnSession() -> String? {
        defer { eidReturnSession = nil }
        return eidReturnSession
    }

    private func sessionEnded() {
        guard phase == .signedIn else { return }
        clearLocal()
        signOutReason = "Нэвтрэх хугацаа дууссан. Дахин нэвтэрнэ үү."
    }

    /// Moves the session to another branch. The token rotates; everything
    /// loaded before belongs to the branch just left, so all tabs rebuild.
    func switchBranch(to tenantID: String) async throws {
        _ = try await api.switchTenant(tenantID)
        let identity = try await api.me()
        api.cacheScope = identity.tenantId
        me = identity
        record = try? await api.memberRecord()
        eventsPath = []
        homePath = []
        epoch += 1
        await refreshUnread()
    }

    // MARK: - Profile photo

    private static let photoCachePath = "profile_photo"

    /// Per person, so the next account on this phone never sees the last one's photo.
    private var photoScope: String? { me.map { "me-\($0.id)" } }

    /// Shows the last photo at once from the device, then asks the server.
    func loadPhoto() async {
        guard let scope = photoScope else { return }
        if photo == nil, let cached = api.cache.load(scope: scope, path: Self.photoCachePath) { photo = UIImage(data: cached) }
        do {
            let data = try await api.profilePhoto()
            // Signed out (or someone else signed in) while this was in flight.
            guard photoScope == scope else { return }
            if let data {
                photo = UIImage(data: data)
                api.cache.save(data, scope: scope, path: Self.photoCachePath)
            } else {
                photo = nil
                api.cache.save(Data(), scope: scope, path: Self.photoCachePath)
            }
        } catch {
            // Offline or a server hiccup: keep what the device had.
        }
    }

    /// Crops to the centre square, scales to 512 px and uploads it.
    func setPhoto(_ image: UIImage) async throws {
        guard let jpeg = Self.squareJPEG(image) else { throw APIError.decoding }
        try await api.uploadProfilePhoto(jpeg)
        photo = UIImage(data: jpeg)
        if let scope = photoScope { api.cache.save(jpeg, scope: scope, path: Self.photoCachePath) }
        Haptics.success()
    }

    func removePhoto() async throws {
        try await api.deleteProfilePhoto()
        photo = nil
        if let scope = photoScope { api.cache.save(Data(), scope: scope, path: Self.photoCachePath) }
    }

    /// The picked file decoded at no more than `maxPixel` on its longest side,
    /// orientation applied — a 48 MP photo decoded whole is ~190 MB.
    static func downsampled(_ data: Data, maxPixel: Int = 1024) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceShouldCacheImmediately: true,
                kCGImageSourceThumbnailMaxPixelSize: maxPixel,
              ] as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }

    /// A new 512×512 JPEG drawn from the image's pixels — orientation applied,
    /// and none of the original file's metadata (location, camera) carried over.
    static func squareJPEG(_ image: UIImage, side: CGFloat = 512) -> Data? {
        let size = image.size
        guard size.width > 0, size.height > 0 else { return nil }
        let edge = min(size.width, size.height)
        let scale = side / edge
        let drawSize = CGSize(width: size.width * scale, height: size.height * scale)
        let origin = CGPoint(x: (side - drawSize.width) / 2, y: (side - drawSize.height) / 2)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let rendered = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
            image.draw(in: CGRect(origin: origin, size: drawSize))
        }
        return rendered.jpegData(compressionQuality: 0.85)
    }

    func reloadRecord() async {
        if let record = try? await api.memberRecord() { self.record = record }
    }

    func refreshUnread() async {
        if let page = try? await api.notifications() { unreadCount = page.unread ?? page.items.filter { !$0.isRead }.count }
    }

    // MARK: - Links

    func handle(url: URL) {
        guard let link = LinkParser.deepLink(from: url) else { return }
        switch link {
        case .checkIn(let code):
            if phase == .signedIn, !hasApprovedBranch { return }
            pendingCheckin = code
            if phase == .signedIn { tab = .checkin }
        case .eidCallback(let session, let returnPath):
            eidReturnSession = session
            resumeTick += 1
            if phase == .signedIn, let path = returnPath, let target = LinkParser.eventPath(path) {
                openEvent(target.eventId)
            }
        }
    }

    func openEvent(_ id: String) {
        guard hasApprovedBranch else { return }
        tab = .events
        eventsPath = [id]
    }

    /// Opens a notification's link inside the app: events (switching branch
    /// first when the notification names another one), dues, or nothing.
    func openNotificationPath(_ path: String) async throws {
        if let target = LinkParser.eventPath(path) {
            if let workspace = target.workspace, workspace != me?.tenantId {
                try await switchBranch(to: workspace)
            }
            openEvent(target.eventId)
        } else if path.hasPrefix("/member/dues"), hasApprovedBranch {
            tab = .dues
        } else if path.hasPrefix("/member/check-in"), hasApprovedBranch {
            tab = .checkin
        }
    }

    private func applyLaunchArguments() {
        #if DEBUG
        switch AppConfig.launchArgument("-SDYTab") {
        case "events": tab = .events
        case "checkin": tab = .checkin
        case "dues": tab = .dues
        case "profile": tab = .profile
        default: break
        }
        if let event = AppConfig.launchArgument("-SDYEvent") { openEvent(event) }
        if let route = AppConfig.launchArgument("-SDYHomeRoute"), let r = HomeRoute(rawValue: route) { homePath = [r] }
        if AppConfig.launchArgument("-SDYCheckin") != nil {
            pendingCheckin = CheckinCode(eventId: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", token: String(repeating: "ab", count: 24))
        }
        #endif
    }
}

/// Screens pushed from Нүүр / Профайл.
enum HomeRoute: String, Hashable {
    case notifications, transfers, record, participation, leaderboard, history, about, deleteAccount, joinRequest, appearance, blocked
}
