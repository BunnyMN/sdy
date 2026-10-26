import Foundation

/// A check-in code as printed in the organiser's QR:
/// https://e-sdy.mn/member/check-in#event=<uuid>&token=<48 hex>
struct CheckinCode: Equatable, Identifiable, Hashable {
    let eventId: String
    let token: String
    var id: String { eventId + token }
}

enum DeepLink: Equatable {
    /// eID returned to the app. A login carries a session id; a vote carries
    /// the path it started on.
    case eidCallback(sessionId: String?, returnPath: String?)
    case checkIn(CheckinCode)
}

enum LinkParser {
    static let tokenPattern = try! NSRegularExpression(pattern: "^[a-f0-9]{48}$")

    static func isAllowedHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }
        return host == AppConfig.host || host == "www." + AppConfig.host
    }

    /// Reads a scanned QR or opened link. Anything that is not exactly an
    /// e-sdy.mn check-in link answers nil.
    static func checkin(from string: String) -> CheckinCode? {
        guard let url = URL(string: string.trimmingCharacters(in: .whitespacesAndNewlines)) else { return nil }
        return checkin(from: url)
    }

    static func checkin(from url: URL) -> CheckinCode? {
        guard url.scheme?.lowercased() == "https", isAllowedHost(url.host) else { return nil }
        let path = url.path.hasSuffix("/") ? String(url.path.dropLast()) : url.path
        guard path == "/member/check-in" else { return nil }
        // Parameters ride in the fragment so they never reach server logs;
        // accept the query too for robustness.
        let source = url.fragment ?? URLComponents(url: url, resolvingAgainstBaseURL: false)?.query ?? ""
        var params: [String: String] = [:]
        for pair in source.split(separator: "&") {
            let kv = pair.split(separator: "=", maxSplits: 1).map(String.init)
            guard kv.count == 2 else { continue }
            params[kv[0]] = kv[1].removingPercentEncoding ?? kv[1]
        }
        guard let event = params["event"], let token = params["token"],
              UUID(uuidString: event) != nil else { return nil }
        let range = NSRange(token.startIndex..., in: token)
        guard tokenPattern.firstMatch(in: token, range: range) != nil else { return nil }
        return CheckinCode(eventId: event.lowercased(), token: token)
    }

    static func deepLink(from url: URL) -> DeepLink? {
        if let code = checkin(from: url) { return .checkIn(code) }
        guard url.scheme?.lowercased() == "https", isAllowedHost(url.host) else { return nil }
        let path = url.path.hasSuffix("/") ? String(url.path.dropLast()) : url.path
        guard path == "/auth/eid/callback" else { return nil }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String? { items.first { $0.name == name }?.value.flatMap { $0.isEmpty ? nil : $0 } }
        let session = value("sessionId") ?? value("session_id")
        var back = value("return")
        if let b = back, !(b.hasPrefix("/") && !b.hasPrefix("//") && !b.hasPrefix("/\\")) { back = nil }
        return .eidCallback(sessionId: session, returnPath: back)
    }

    /// `/module/events/<uuid>` (optionally `?workspace=<tenant>`) → (event, tenant).
    static func eventPath(_ path: String) -> (eventId: String, workspace: String?)? {
        guard let components = URLComponents(string: path) else { return nil }
        let parts = components.path.split(separator: "/").map(String.init)
        guard parts.count >= 3, parts[0] == "module", parts[1] == "events", UUID(uuidString: parts[2]) != nil else { return nil }
        let workspace = components.queryItems?.first { $0.name == "workspace" }?.value
        return (parts[2], workspace)
    }
}
