import SwiftUI

enum Theme {
    /// SDY red, #AF1D26 (lighter in dark mode for contrast) — from the asset catalog.
    static let accent = Color.accentColor
    static let brandRed = Color("BrandRed")
    static let success = Color.green
    static let warning = Color.orange
    static let danger = Color.red
    static let cardBackground = Color(.secondarySystemGroupedBackground)
    static let groupedBackground = Color(.systemGroupedBackground)
    static let minTap: CGFloat = 44

    // The dark design: a black canvas, graphite cards, white type.
    static let canvas = Color.black
    static let card = Color(white: 0.11)
    static let cardRaised = Color(white: 0.17)
    static let secondaryText = Color(white: 0.62)
    static let tertiaryText = Color(white: 0.42)
}

/// A short coloured label that never relies on colour alone: it always has text
/// and, where it matters, an icon.
struct StatusChip: View {
    enum Tone { case neutral, accent, success, warning, danger, info }
    let text: String
    var systemImage: String?
    var tone: Tone = .neutral

    var color: Color {
        switch tone {
        case .neutral: return .secondary
        case .accent: return Theme.accent
        case .success: return .green
        case .warning: return .orange
        case .danger: return .red
        case .info: return .blue
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage { Image(systemName: systemImage).imageScale(.small) }
            Text(text).lineLimit(1)
        }
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .foregroundStyle(color)
        .background(color.opacity(0.14), in: Capsule())
        .accessibilityElement(children: .combine)
    }
}

extension StatusChip {
    static func attendance(_ status: String) -> StatusChip? {
        switch status {
        case "registered": return StatusChip(text: "Бүртгүүлсэн", systemImage: "checkmark.circle", tone: .info)
        case "attended": return StatusChip(text: "Ирсэн", systemImage: "checkmark.seal.fill", tone: .success)
        case "absent": return StatusChip(text: "Ирээгүй", systemImage: "xmark.circle", tone: .warning)
        default: return nil
        }
    }

    static func eventStatus(_ status: String) -> StatusChip {
        switch status {
        case "planned": return StatusChip(text: "Товлогдсон", systemImage: "calendar", tone: .info)
        case "done": return StatusChip(text: "Болсон", systemImage: "checkmark", tone: .neutral)
        case "cancelled": return StatusChip(text: "Цуцлагдсан", systemImage: "xmark", tone: .danger)
        default: return StatusChip(text: status)
        }
    }
}

enum Labels {
    static func membershipStatus(_ status: String) -> String {
        switch status {
        case "active": return "Идэвхтэй"
        case "suspended": return "Түдгэлзсэн"
        case "expired": return "Хугацаа дууссан"
        case "left": return "Гарсан"
        case "alumni": return "Ахмад гишүүн"
        default: return "Гишүүнчлэл баталгаажаагүй"
        }
    }

    static func attendance(_ status: String) -> String {
        switch status {
        case "registered": return "Бүртгүүлсэн"
        case "attended": return "Ирсэн"
        case "absent": return "Ирээгүй"
        default: return "—"
        }
    }

    static func payment(_ status: String) -> String {
        switch status {
        case "pending": return "Шалгагдаж байна"
        case "approved": return "Баталгаажсан"
        case "rejected": return "Татгалзсан"
        case "reversed": return "Буцаагдсан"
        default: return status
        }
    }

    static func transfer(_ status: String) -> String {
        switch status {
        case "PENDING": return "Очих байгууллагын шийдвэр хүлээж байна"
        case "ACCEPTED": return "Шилжилт батлагдсан"
        case "DECLINED": return "Шилжих хүсэлт татгалзсан"
        case "CANCELLED": return "Шилжих хүсэлт цуцлагдсан"
        default: return status
        }
    }

    static func joinRequest(_ status: String) -> String {
        switch status.uppercased() {
        case "PENDING": return "Шийдвэр хүлээж байна"
        case "ACCEPTED", "APPROVED": return "Элсэх хүсэлт батлагдсан"
        case "DECLINED", "REJECTED": return "Элсэх хүсэлт татгалзсан"
        default: return status
        }
    }

    static func motionStatus(_ status: String) -> String {
        switch status {
        case "proposed": return "Хэлэлцэхээр дэвшүүлсэн"
        case "voting": return "Санал хураалт явагдаж байна"
        case "approved": return "Батлагдсан"
        case "rejected": return "Батлагдсангүй"
        case "withdrawn": return "Буцаасан"
        default: return status
        }
    }

    static func choice(_ choice: String) -> String {
        switch choice {
        case "yes": return "Зөвшөөрөх"
        case "no": return "Татгалзах"
        case "abstain": return "Түдгэлзэх"
        default: return choice
        }
    }

    static func chose(_ choice: String) -> String {
        switch choice {
        case "yes": return "Зөвшөөрсөн"
        case "no": return "Татгалзсан"
        case "abstain": return "Түдгэлзсэн"
        default: return choice
        }
    }

    static func taskStatus(_ status: String) -> String {
        switch status {
        case "offered": return "Санал болгосон"
        case "accepted": return "Хүлээн авсан"
        case "declined": return "Татгалзсан"
        case "done": return "Гүйцэтгэсэн"
        default: return status
        }
    }

    static func pointReason(_ reason: String) -> String {
        switch reason {
        case "attendance": return "Ирц"
        case "task": return "Ажил үүрэг"
        case "vote": return "Санал"
        default: return reason
        }
    }
}
