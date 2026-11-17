import Foundation

extension Array where Element: Identifiable {
    /// The next page added after this one, without rows already shown: a row
    /// inserted on the server between two page loads shifts the offsets, and
    /// the page after it would repeat the last row of this one.
    func appendingUnique(_ page: [Element]) -> [Element] {
        var seen = Set(map(\.id))
        var out = self
        for item in page where seen.insert(item.id).inserted { out.append(item) }
        return out
    }
}

/// One idempotency key per thing the person means to do: the same while they
/// retry it — also after trying something else in between (A → B → A keeps
/// A's key, so A whose answer was lost is not recorded twice) — and a new one
/// for anything they have not sent before. Lives as long as the sheet.
struct IntentKey {
    private var keys: [String: String] = [:]

    mutating func key(for fingerprint: String) -> String {
        if let key = keys[fingerprint] { return key }
        let key = UUID().uuidString
        keys[fingerprint] = key
        return key
    }

    /// After the server has recorded it: the next intent gets new keys.
    mutating func reset() { keys = [:] }
}
