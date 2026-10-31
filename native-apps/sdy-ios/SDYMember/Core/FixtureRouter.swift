#if DEBUG
import Foundation

/// DEBUG-only stand-in for the backend: `-SDYFixtures` makes every request
/// answer from the JSON files in Resources/Fixtures, so each screen can be
/// seen (and screenshotted) without a network or an account.
///
/// Dates in fixtures are written relative to now as `@D(+2,18:30)` (days,
/// Ulaanbaatar wall time) so upcoming events stay upcoming.
final class FixtureRouter {
    var variant: String = AppConfig.launchArgument("-SDYFixtureVariant") ?? ""
    let bundle: Bundle

    init(bundle: Bundle = .main) { self.bundle = bundle }

    func respond(_ method: HTTPMethod, _ path: String, body: [String: Any]?) throws -> Data {
        let clean = path.split(separator: "?").first.map(String.init) ?? path
        let parts = clean.split(separator: "/").map(String.init)
        switch (method, parts) {
        case (.get, ["auth", "me"]): return try file("me")
        case (.get, ["profile"]): return try file("profile")
        case (.get, ["profile", "deletion-request"]): return Data(#"{"status":"none"}"#.utf8)
        case (.get, ["me", "branches"]): return try file("branches")
        case (.get, ["me", "member-record"]): return try file(variant == "nobranch" ? "member_record_none" : "member_record")
        case (.get, ["auth", "tenants"]): return try file("tenants")
        case (.get, ["me", "items"]): return try file(variant == "nobranch" ? "items" : "items_empty")
        case (.get, ["me", "transfers"]): return try file("transfers")
        case (.get, ["me", "notifications"]): return try file("notifications")
        case (.get, ["me", "participation-history"]): return try file("participation_history")
        case (.get, ["me", "dues-history"]): return try file("dues_history")
        case (.get, ["events"]): return try file("events")
        case (.get, ["events", "mine"]): return try file("events_mine")
        case (.get, ["events", "points"]): return try file("points")
        case (.get, ["events", "leaderboard"]): return try file("leaderboard")
        case (.get, let p) where p.count == 2 && p[0] == "events": return try event(p[1])
        case (.get, let p) where p.count == 3 && p[0] == "events" && p[2] == "motions": return try file("motions")
        case (.get, let p) where p.count == 3 && p[0] == "events" && p[2] == "tasks": return try file("tasks")
        case (.get, let p) where p.count == 3 && p[0] == "events" && p[2] == "attendance": return try file("participants")
        case (.get, ["dues", "settings"]): return try file("dues_settings")
        case (.get, ["dues", "mine"]): return try file("dues_mine")
        case (.post, ["auth", "eid", "start"]), (.post, ["auth", "eid", "start-id"]): return try file("eid_start")
        case (.post, ["auth", "eid", "poll"]):
            return Data(#"{"state":"COMPLETE","session_token":"fixture-token"}"#.utf8)
        case (.post, ["auth", "login"]): return Data(#"{"expires_at":"2030-01-01T00:00:00Z","session_token":"fixture-token"}"#.utf8)
        case (.post, ["auth", "switch-tenant"]): return Data(#"{"tenant_id":"t-1","switched":true,"session_token":"fixture-token"}"#.utf8)
        case (.post, let p) where p.last == "check-in": return Data(#"{"status":"attended","changed":true,"points":10}"#.utf8)
        case (.post, let p) where p.last == "register": return Data(#"{"status":"registered","changed":true}"#.utf8)
        case (.delete, let p) where p.last == "register": return Data(#"{"status":"","changed":true}"#.utf8)
        case (.post, let p) where p.last == "vote":
            return Data(#"{"session_id":"vote-fixture","verification_code":"4821","state":"signing"}"#.utf8)
        case (.post, let p) where p.last == "poll" && p.contains("vote"):
            return Data(#"{"state":"signed","points":5}"#.utf8)
        case (.post, _), (.put, _), (.delete, _):
            return Data(#"{"ok":true,"id":"fixture","changed":true}"#.utf8)
        default:
            throw APIError(kind: .server(status: 404), serverMessage: "no fixture", code: nil)
        }
    }

    private func event(_ id: String) throws -> Data {
        let data = try file("events")
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let events = object?["events"] as? [[String: Any]] ?? []
        guard let match = events.first(where: { ($0["id"] as? String) == id }) else {
            throw APIError(kind: .server(status: 404), serverMessage: "no such event", code: nil)
        }
        return try JSONSerialization.data(withJSONObject: match)
    }

    func file(_ name: String) throws -> Data {
        guard let url = bundle.url(forResource: name, withExtension: "json"),
              let raw = try? String(contentsOf: url, encoding: .utf8) else {
            throw APIError(kind: .server(status: 404), serverMessage: "no fixture \(name)", code: nil)
        }
        return Data(Self.expandDates(raw).utf8)
    }

    static func expandDates(_ raw: String, now: Date = Date()) -> String {
        let regex = try! NSRegularExpression(pattern: #"@D\(([+-]?\d+),(\d{2}):(\d{2})\)"#)
        var result = raw
        let matches = regex.matches(in: raw, range: NSRange(raw.startIndex..., in: raw)).reversed()
        let calendar = Formatters.calendar
        let iso = ISO8601DateFormatter()
        for match in matches {
            let ns = raw as NSString
            let days = Int(ns.substring(with: match.range(at: 1))) ?? 0
            let hour = Int(ns.substring(with: match.range(at: 2))) ?? 0
            let minute = Int(ns.substring(with: match.range(at: 3))) ?? 0
            let base = calendar.startOfDay(for: now)
            var date = calendar.date(byAdding: .day, value: days, to: base) ?? now
            date = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: date) ?? date
            let range = Range(match.range, in: result)!
            result.replaceSubrange(range, with: iso.string(from: date))
        }
        return result
    }
}
#endif
