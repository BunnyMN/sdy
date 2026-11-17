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
/// retry it, a new one as soon as what they are sending changes.
struct IntentKey {
    private(set) var key = UUID().uuidString
    private var fingerprint: String?

    mutating func key(for fingerprint: String) -> String {
        if fingerprint != self.fingerprint {
            if self.fingerprint != nil { key = UUID().uuidString }
            self.fingerprint = fingerprint
        }
        return key
    }

    /// After the server has recorded it: the next intent gets a new key.
    mutating func reset() {
        key = UUID().uuidString
        fingerprint = nil
    }
}
