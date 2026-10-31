import SwiftUI

/// The header background a member chooses in Профайл → Өнгө төрх. Kept on the
/// device (UserDefaults), not on the server: it is how this phone looks.
enum AppTheme: String, CaseIterable, Identifiable {
    case silk, glass, space, silver, gold

    static let storageKey = "sdy.theme"
    var id: String { rawValue }

    var title: String {
        switch self {
        case .silk: return "Улаан торго"
        case .glass: return "Шилэн туяа"
        case .space: return "Сансар"
        case .silver: return "Мөнгөлөг"
        case .gold: return "Алтан"
        }
    }

    var subtitle: String {
        switch self {
        case .silk: return "SDY-ийн улаан, графит торго"
        case .glass: return "Өнгөлөг туяа, царцмаг шил"
        case .space: return "Анивчих одод, гариг"
        case .silver: return "Цэвэр мөнгөлөг графит"
        case .gold: return "Алтлаг гэрэлтэй торго"
        }
    }

    /// The theme's accent: the picker's Save button and the preview's icons.
    var accent: Color {
        switch self {
        case .silk: return Theme.brandRed
        case .glass: return Color(red: 0.55, green: 0.33, blue: 0.98)
        case .space: return Color(red: 0.42, green: 0.45, blue: 0.95)
        case .silver: return Color(white: 0.50)
        case .gold: return Color(red: 0.55, green: 0.36, blue: 0.06)
        }
    }

    /// The three ribbons' colours, darkest edge → highlight → edge.
    func ribbons(redTint: Double) -> ([Color], [Color], [Color]) {
        switch self {
        case .silk, .space, .glass:
            return ([Color(white: 0.10), Color(white: 0.34), Color(white: 0.12)],
                    [Color(white: 0.06), Theme.brandRed.opacity(redTint), Color(white: 0.20)],
                    [Color(white: 0.14), Color(white: 0.42), Color(white: 0.08)])
        case .silver:
            return ([Color(white: 0.10), Color(white: 0.40), Color(white: 0.12)],
                    [Color(white: 0.08), Color(white: 0.55), Color(white: 0.18)],
                    [Color(white: 0.14), Color(white: 0.48), Color(white: 0.08)])
        case .gold:
            let gold = Color(red: 0.85, green: 0.66, blue: 0.32)
            return ([Color(white: 0.08), gold.opacity(0.35), Color(white: 0.10)],
                    [Color(white: 0.06), gold.opacity(0.65), Color(red: 0.25, green: 0.18, blue: 0.08)],
                    [Color(white: 0.12), Color(red: 0.55, green: 0.42, blue: 0.22), Color(white: 0.08)])
        }
    }
}

/// Stars that twinkle slowly over a dark sky, and the rim of a planet rising
/// at the bottom, lit from above.
enum Starfield {
    /// Fixed positions, so the sky does not reshuffle between frames.
    private static let stars: [(x: Double, y: Double, r: Double, phase: Double)] = {
        var seed: UInt64 = 1997
        func next() -> Double {
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            return Double(seed >> 33) / Double(1 << 31)
        }
        return (0..<170).map { _ in (next(), next() * 0.85, 0.5 + next() * 1.3, next() * 6.28) }
    }()

    static func draw(_ ctx: inout GraphicsContext, _ size: CGSize, t: Double) {
        let w = size.width, h = size.height
        ctx.fill(Path(CGRect(origin: .zero, size: size)),
                 with: .linearGradient(Gradient(colors: [Color(red: 0.01, green: 0.01, blue: 0.04), Color(red: 0.03, green: 0.03, blue: 0.08)]),
                                       startPoint: .zero, endPoint: CGPoint(x: 0, y: h)))
        for s in stars {
            let twinkle = 0.45 + 0.55 * (0.5 + 0.5 * sin(t * 1.3 + s.phase))
            let rect = CGRect(x: s.x * w - s.r, y: s.y * h - s.r, width: s.r * 2, height: s.r * 2)
            ctx.fill(Path(ellipseIn: rect), with: .color(.white.opacity(twinkle)))
        }
        // The planet: a huge disc whose top edge rises into the frame.
        let radius = w * 1.25
        let centre = CGPoint(x: w / 2 + sin(t * 0.05) * 6, y: h + radius * 0.72)
        let disc = Path(ellipseIn: CGRect(x: centre.x - radius, y: centre.y - radius, width: radius * 2, height: radius * 2))
        ctx.fill(disc, with: .radialGradient(Gradient(colors: [Color(white: 0.55), Color(white: 0.30), Color(white: 0.10)]),
                                             center: CGPoint(x: centre.x, y: centre.y - radius * 0.9),
                                             startRadius: 0, endRadius: radius * 1.1))
        ctx.stroke(disc, with: .color(.white.opacity(0.25)), lineWidth: 1.5)
        // A faint red atmosphere along the rim.
        ctx.stroke(disc, with: .color(Theme.brandRed.opacity(0.35)), lineWidth: 8)
    }
}

/// Large soft orbs of colour drifting and blending on a deep night blue —
/// the backdrop that makes the app's frosted-glass buttons read as glass.
enum Aurora {
    private static let orbs: [(color: Color, x: Double, y: Double, r: Double, speed: Double, phase: Double)] = [
        (Color(red: 1.00, green: 0.30, blue: 0.62), 0.20, 0.30, 0.55, 0.11, 0.0),
        (Color(red: 0.48, green: 0.36, blue: 1.00), 0.80, 0.25, 0.60, 0.09, 1.7),
        (Color(red: 0.13, green: 0.83, blue: 0.93), 0.65, 0.75, 0.50, 0.13, 3.1),
        (Color(red: 1.00, green: 0.54, blue: 0.24), 0.25, 0.85, 0.45, 0.10, 4.4),
    ]

    static func draw(_ ctx: inout GraphicsContext, _ size: CGSize, t: Double) {
        let w = size.width, h = size.height
        ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(red: 0.05, green: 0.04, blue: 0.12)))
        var layer = ctx
        layer.addFilter(.blur(radius: min(w, h) * 0.16))
        for o in orbs {
            let cx = (o.x + 0.12 * sin(t * o.speed + o.phase)) * w
            let cy = (o.y + 0.10 * cos(t * o.speed * 1.3 + o.phase)) * h
            let r = o.r * max(w, h) * 0.5 * (1 + 0.08 * sin(t * 0.4 + o.phase))
            layer.fill(Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2)),
                       with: .color(o.color.opacity(0.85)))
        }
        // A pale sheen across the top, like light on a pane.
        ctx.fill(Path(CGRect(origin: .zero, size: size)),
                 with: .linearGradient(Gradient(colors: [.white.opacity(0.10), .clear]),
                                       startPoint: .zero, endPoint: CGPoint(x: w * 0.6, y: h * 0.6)))
    }
}

/// Профайл → Өнгө төрх: swipe through the themes, each shown as a small
/// phone screen; the whole page takes on the one in front, and Хадгалах keeps it.
struct ThemePickerView: View {
    @AppStorage(AppTheme.storageKey) private var chosen = AppTheme.silk.rawValue
    @Environment(\.dismiss) private var dismiss
    @State private var current: AppTheme.ID?

    private var shown: AppTheme { AppTheme(rawValue: current ?? chosen) ?? .silk }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal) {
                LazyHStack(spacing: 14) {
                    ForEach(AppTheme.allCases) { theme in
                        ThemePreviewPhone(theme: theme)
                            .containerRelativeFrame(.horizontal)
                            .scrollTransition(.interactive, axis: .horizontal) { view, phase in
                                view.scaleEffect(phase.isIdentity ? 1 : 0.86)
                                    .opacity(phase.isIdentity ? 1 : 0.55)
                            }
                            .onTapGesture { withAnimation(.snappy) { current = theme.id } }
                            .accessibilityLabel("\(theme.title). \(theme.subtitle)")
                    }
                }
                .scrollTargetLayout()
            }
            // The card in front fills the width less these margins, so it
            // sits centred with its neighbours peeking in on both sides.
            .safeAreaPadding(.horizontal, 64)
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $current)
            .scrollIndicators(.hidden)
            .frame(maxHeight: .infinity)
            .onChange(of: current) { _, _ in Haptics.tap() }

            VStack(spacing: 6) {
                Text(shown.title).font(.title3.bold()).foregroundStyle(.white)
                Text(shown.subtitle).font(.subheadline).foregroundStyle(.white.opacity(0.7))
            }
            .id(shown.id)
            .transition(.opacity)
            .padding(.bottom, 22)

            Button {
                chosen = shown.rawValue
                Haptics.success()
                dismiss()
            } label: {
                Text(shown.rawValue == chosen ? "Сонгогдсон" : "Хадгалах")
                    .font(.headline).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(shown.accent, in: Capsule())
            }
            .buttonStyle(PressableStyle())
            .padding(.horizontal, 20)
            .padding(.bottom, 16)
        }
        .background {
            ZStack {
                SilkBackground(forcedTheme: shown)
                    .blur(radius: 30)
                    .scaleEffect(1.2)
                    .id(shown.id)
                    .transition(.opacity)
                Color.black.opacity(0.35)
            }
            .ignoresSafeArea()
            .animation(.easeInOut(duration: 0.45), value: shown)
        }
        .animation(.easeInOut(duration: 0.3), value: shown)
        .navigationTitle("Өнгө төрх")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .onAppear { if current == nil { current = chosen } }
    }
}

/// A theme drawn as a small phone screen: the header on its background with
/// placeholder text, glass actions, and the black sheet with two rows.
private struct ThemePreviewPhone: View {
    let theme: AppTheme

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                SilkBackground(forcedTheme: theme)
                VStack(spacing: 12) {
                    Spacer(minLength: 0)
                    Capsule().fill(.white.opacity(0.28)).frame(width: 120, height: 14)
                    Capsule().fill(.white.opacity(0.28)).frame(width: 170, height: 22)
                    Capsule().fill(.white.opacity(0.22)).frame(width: 80, height: 22).padding(.top, 10)
                    Spacer(minLength: 0)
                    HStack(spacing: 10) {
                        ForEach(0..<4, id: \.self) { i in
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(i == 3 ? AnyShapeStyle(.white) : AnyShapeStyle(.ultraThinMaterial))
                                .frame(width: 44, height: 44)
                                .overlay {
                                    Image(systemName: ["ellipsis", "calendar", "qrcode", "banknote.fill"][i])
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundStyle(i == 3 ? theme.accent : .white)
                                }
                        }
                    }
                    .padding(.bottom, 18)
                }
            }
            .frame(height: 300)
            .clipped()

            VStack(spacing: 10) {
                ForEach(0..<2, id: \.self) { _ in
                    HStack(spacing: 12) {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(theme.accent)
                            .frame(width: 36, height: 36)
                            .overlay(Image(systemName: "creditcard.fill").font(.caption).foregroundStyle(.white))
                        VStack(alignment: .leading, spacing: 7) {
                            Capsule().fill(Color(white: 0.24)).frame(height: 9)
                            Capsule().fill(Color(white: 0.20)).frame(width: 90, height: 9)
                        }
                    }
                    .padding(12)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity)
            .background(UnevenRoundedRectangle(topLeadingRadius: 22, topTrailingRadius: 22, style: .continuous).fill(Theme.canvas))
            .offset(y: -18)
            .padding(.bottom, -18)
        }
        .background(Theme.canvas)
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).strokeBorder(.white.opacity(0.15), lineWidth: 1))
        .shadow(color: .black.opacity(0.5), radius: 20, y: 12)
        .padding(.vertical, 20)
    }
}
