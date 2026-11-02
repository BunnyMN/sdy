import SwiftUI
import UserNotifications

/// APNs for the member app: asks once after sign-in, hands the device token to
/// the server (POST /push-tokens) and opens the screen a tapped notification
/// is about. The server sends registry.member_notifications through APNs
/// (backend internal/workspace/push).
final class PushDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    /// Set by SDYMemberApp; the delegate outlives no model.
    weak var app: AppModel?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in await self.app?.pushTokenArrived(token) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        #if DEBUG
        print("push registration failed: \(error)")
        #endif
    }

    /// In the foreground too: a banner, and the list refreshes.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        await MainActor.run { Task { await self.app?.refreshUnread() } }
        return [.banner, .list, .sound, .badge]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let path = response.notification.request.content.userInfo["path"] as? String
        await MainActor.run { self.app?.openPushed(path: path) }
    }
}

extension AppModel {
    /// The app_id the server picks the APNs environment from: a development
    /// build talks to the sandbox, TestFlight and the App Store to production.
    static var pushAppID: String {
        let bundle = Bundle.main.bundleIdentifier ?? "mn.esdy.member"
        #if DEBUG
        return bundle + ":sandbox"
        #else
        return bundle
        #endif
    }

    /// Asks for permission once (the system remembers the answer) and
    /// registers with APNs when it is given.
    func enablePush() async {
        #if DEBUG
        if AppConfig.fixturesEnabled { return }
        #endif
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        var allowed = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
        if settings.authorizationStatus == .notDetermined {
            allowed = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        }
        if allowed { UIApplication.shared.registerForRemoteNotifications() }
    }

    func pushTokenArrived(_ token: String) async {
        pushToken = token
        guard phase == .signedIn else { return }
        try? await api.registerPushToken(token, appID: Self.pushAppID)
    }

    /// Before the session ends: this phone stops receiving the person's pushes.
    func disablePush() async {
        guard let token = pushToken else { return }
        try? await api.unregisterPushToken(token)
    }

    func openPushed(path: String?) {
        guard phase == .signedIn else { return }
        Task {
            await refreshUnread()
            guard let path, !path.isEmpty else { homePath = [.notifications]; tab = .home; return }
            try? await openNotificationPath(path)
        }
    }

    /// The icon's number follows the unread count.
    func syncBadge() {
        UNUserNotificationCenter.current().setBadgeCount(unreadCount)
    }
}
