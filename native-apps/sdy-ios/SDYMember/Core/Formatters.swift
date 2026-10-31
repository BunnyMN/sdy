import Foundation

/// Dates in Asia/Ulaanbaatar as "yyyy-MM-dd HH:mm", money as "1,250,000₮".
enum Formatters {
    static let timeZone = TimeZone(identifier: "Asia/Ulaanbaatar")!

    static var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = timeZone
        c.locale = Locale(identifier: "mn_MN")
        return c
    }()

    private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    private static let dayParser: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    private static let display: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f
    }()
    private static let timeOnly: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "HH:mm"
        return f
    }()
    private static let money: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.numberStyle = .decimal
        f.groupingSeparator = ","
        f.usesGroupingSeparator = true
        f.groupingSize = 3
        f.maximumFractionDigits = 0
        f.roundingMode = .halfUp
        return f
    }()

    static func parseDate(_ value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }
        return isoFractional.date(from: value) ?? iso.date(from: value) ?? dayParser.date(from: String(value.prefix(10)))
    }

    /// A calendar day ("2026-10-25" or a timestamp) at its start in Ulaanbaatar.
    static func parseDay(_ value: String?) -> Date? {
        guard let value, value.count >= 10 else { return nil }
        return dayParser.date(from: String(value.prefix(10)))
    }

    static func startOfDay(_ date: Date) -> Date { calendar.startOfDay(for: date) }

    /// "2026-10-26 18:30", or "—" when the value is not a date.
    static func dateTime(_ value: String?) -> String {
        guard let date = parseDate(value) else { return "—" }
        return display.string(from: date)
    }

    static func dateTime(_ date: Date) -> String { display.string(from: date) }

    static func day(_ value: String?) -> String {
        guard let date = parseDate(value) else { return value ?? "—" }
        return dayParser.string(from: date)
    }

    /// "Өнөөдөр 18:30", "Маргааш 10:00", "3 өдрийн дараа", "Өчигдөр 09:00",
    /// otherwise the full date.
    static func relative(_ value: String?, now: Date = Date()) -> String {
        guard let date = parseDate(value) else { return "—" }
        let days = calendar.dateComponents([.day], from: startOfDay(now), to: startOfDay(date)).day ?? 0
        let time = timeOnly.string(from: date)
        switch days {
        case 0: return "Өнөөдөр \(time)"
        case 1: return "Маргааш \(time)"
        case -1: return "Өчигдөр \(time)"
        case 2...6: return "\(days) өдрийн дараа · \(time)"
        default: return display.string(from: date)
        }
    }

    /// "1,250,000₮"
    static func money(_ value: Double) -> String {
        (money.string(from: NSNumber(value: value.rounded())) ?? "0") + "₮"
    }

    static func points(_ value: Double) -> String {
        let n = Int(value.rounded())
        return "\(n) оноо"
    }

    /// "4:59" countdown
    static func clock(_ seconds: Int) -> String {
        let s = max(0, seconds)
        return "\(s / 60):" + String(format: "%02d", s % 60)
    }
}
