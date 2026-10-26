import Foundation

/// Mongolian civil register number: two Cyrillic letters and eight digits
/// ("УБ90010112"). People often type Latin look-alikes on a Latin keyboard;
/// those are turned into the Cyrillic letters they look like.
enum RegisterNumber {
    static let latinToCyrillic: [Character: Character] = [
        "A": "А", "B": "В", "C": "С", "E": "Е", "H": "Н", "K": "К", "M": "М",
        "O": "О", "P": "Р", "T": "Т", "X": "Х", "Y": "У",
    ]

    static let pattern = try! NSRegularExpression(pattern: "^[А-ЯЁӨҮ]{2}[0-9]{8}$")

    /// Uppercases, maps look-alikes, drops spaces and anything after 10 characters.
    static func normalize(_ input: String) -> String {
        var out = ""
        for ch in input.uppercased() {
            if ch.isWhitespace || ch == "-" { continue }
            if let mapped = latinToCyrillic[ch] { out.append(mapped) } else { out.append(ch) }
        }
        return String(out.prefix(10))
    }

    static func isValid(_ value: String) -> Bool {
        let range = NSRange(value.startIndex..., in: value)
        return pattern.firstMatch(in: value, range: range) != nil
    }

    /// A hint for what is wrong, or nil when valid or still empty.
    static func hint(for value: String) -> String? {
        if value.isEmpty || isValid(value) { return nil }
        let letters = value.prefix(2)
        if letters.contains(where: { !isCyrillicLetter($0) }) {
            return "Эхний 2 тэмдэгт кирилл үсэг байна (ж: УБ)."
        }
        let digits = value.dropFirst(2)
        if digits.contains(where: { !$0.isASCII || !$0.isNumber }) {
            return "Үсгийн дараа зөвхөн 8 оронтой тоо орно."
        }
        return "2 үсэг, 8 тоо — нийт 10 тэмдэгт (одоо \(value.count))."
    }

    static func isCyrillicLetter(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first else { return false }
        return (0x0410...0x042F).contains(scalar.value) || ch == "Ё" || ch == "Ө" || ch == "Ү"
    }
}
