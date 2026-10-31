import Foundation

/// Fixed addresses of the SDY deployment. The app talks to exactly one
/// backend — the same one the web PWA (frontend/) uses.
enum AppConfig {
    static let host = "e-sdy.mn"
    static let webOrigin = URL(string: "https://e-sdy.mn")!
    static let apiBase = URL(string: "https://e-sdy.mn/api/v1")!
    static let websiteURL = URL(string: "https://e-sdy.mn")!
    static let privacyURL = URL(string: "https://e-sdy.mn/privacy")!
    static let supportURL = URL(string: "https://e-sdy.mn/support")!
    static let eidAppStoreURL = URL(string: "https://apps.apple.com/mn/search?term=eID%20Mongolia")!
    /// Schemes the eID Mongolia app answers to (also in LSApplicationQueriesSchemes).
    static let eidSchemes = ["eidmongolia", "geregesmartid"]
    static let sessionCookieName = "session_token"

    /// Where eID returns the citizen after approving in the eID app. The path is
    /// covered by the applinks entitlement, so it reopens this app.
    static func eidCallbackURL(returnPath: String? = nil) -> String {
        var components = URLComponents(string: "https://e-sdy.mn/auth/eid/callback")!
        var items = [URLQueryItem(name: "app", value: "ios")]
        if let returnPath { items.append(URLQueryItem(name: "return", value: returnPath)) }
        components.queryItems = items
        return components.string!
    }

    static var appVersion: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }

    /// DEBUG-only: `-SDYFixtures` serves bundled sample JSON instead of the network.
    static var fixturesEnabled: Bool {
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains("-SDYFixtures")
        #else
        return false
        #endif
    }

    static func launchArgument(_ name: String) -> String? {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: name), index + 1 < args.count else { return nil }
        return args[index + 1]
        #else
        return nil
        #endif
    }
}
