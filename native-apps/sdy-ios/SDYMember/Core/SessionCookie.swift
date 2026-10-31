import Foundation

/// What a response's Set-Cookie header says about the session cookie.
///
/// The app never lets URLSession store cookies (the session is a bearer
/// token), but the server still rotates the session through Set-Cookie on
/// some answers, so every response is read for it.
enum SessionCookieUpdate: Equatable {
    case set(String)
    case cleared
}

enum SessionCookieParser {
    /// Parses one or more Set-Cookie headers (possibly folded into one
    /// comma-joined string, as HTTPURLResponse does) and returns the last
    /// statement about `name`, or nil when the header does not mention it.
    static func parse(_ header: String?, name: String = AppConfig.sessionCookieName, now: Date = Date()) -> SessionCookieUpdate? {
        guard let header, !header.isEmpty else { return nil }
        var result: SessionCookieUpdate?
        for cookie in split(header) {
            let parts = cookie.split(separator: ";", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
            guard let first = parts.first, let eq = first.firstIndex(of: "=") else { continue }
            let cookieName = String(first[..<eq]).trimmingCharacters(in: .whitespaces)
            guard cookieName == name else { continue }
            var value = String(first[first.index(after: eq)...]).trimmingCharacters(in: .whitespaces)
            if value.hasPrefix("\""), value.hasSuffix("\""), value.count >= 2 { value = String(value.dropFirst().dropLast()) }
            var expired = false
            for attribute in parts.dropFirst() {
                let pair = attribute.split(separator: "=", maxSplits: 1).map { String($0).trimmingCharacters(in: .whitespaces) }
                guard let key = pair.first?.lowercased() else { continue }
                let attrValue = pair.count > 1 ? pair[1] : ""
                if key == "max-age", let seconds = Int(attrValue), seconds <= 0 { expired = true }
                if key == "expires", let date = expiresFormatter.date(from: attrValue), date <= now { expired = true }
            }
            result = (value.isEmpty || expired) ? .cleared : .set(value)
        }
        return result
    }

    /// Splits a folded header on the commas that start a new cookie, not the
    /// one inside an `Expires=Wed, 21 Oct 2026 …` date.
    static func split(_ header: String) -> [String] {
        var cookies: [String] = []
        var current = ""
        let chars = Array(header)
        var i = 0
        while i < chars.count {
            let c = chars[i]
            if c == "," {
                // A new cookie starts if what follows looks like `name=`
                var j = i + 1
                while j < chars.count, chars[j] == " " { j += 1 }
                var k = j
                while k < chars.count, chars[k] != "=", chars[k] != ";", chars[k] != ",", chars[k] != " " { k += 1 }
                if k < chars.count, chars[k] == "=", k > j {
                    cookies.append(current)
                    current = ""
                    i += 1
                    continue
                }
            }
            current.append(c)
            i += 1
        }
        if !current.trimmingCharacters(in: .whitespaces).isEmpty { cookies.append(current) }
        return cookies.map { $0.trimmingCharacters(in: .whitespaces) }
    }

    private static let expiresFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "GMT")
        f.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        return f
    }()
}
