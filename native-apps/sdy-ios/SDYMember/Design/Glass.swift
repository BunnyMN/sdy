import SwiftUI

/// Presses in with a spring and a light tap — the feel of every tappable
/// surface in the dark design.
struct PressableStyle: ButtonStyle {
    var scale: CGFloat = 0.96

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .brightness(configuration.isPressed ? -0.04 : 0)
            .animation(.spring(response: 0.28, dampingFraction: 0.62), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, pressed in if pressed { Haptics.tap() } }
    }
}

/// A square glass button with its label underneath, for a header's row of
/// quick actions.
struct GlassTile: View {
    let title: String
    let systemImage: String
    var badge: Int = 0
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 66, height: 66)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .strokeBorder(LinearGradient(colors: [.white.opacity(0.35), .white.opacity(0.06)],
                                                     startPoint: .top, endPoint: .bottom), lineWidth: 1))
                    .overlay(alignment: .topTrailing) {
                        if badge > 0 {
                            Text("\(badge)").font(.caption2.bold()).foregroundStyle(.white)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Theme.brandRed, in: Capsule())
                                .offset(x: 6, y: -6)
                        }
                    }
                    .shadow(color: .black.opacity(0.35), radius: 10, y: 6)
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle(scale: 0.9))
        .accessibilityLabel(badge > 0 ? "\(title), \(badge)" : title)
    }
}

/// A round glass button for a header's corners (notifications, sign out).
struct GlassCircleButton: View {
    let systemImage: String
    let label: String
    var dot = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 50, height: 50)
                .background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().strokeBorder(.white.opacity(0.14), lineWidth: 1))
                .overlay(alignment: .topTrailing) {
                    if dot { Circle().fill(Theme.brandRed).frame(width: 11, height: 11).offset(x: -6, y: 6) }
                }
        }
        .buttonStyle(PressableStyle(scale: 0.88))
        .accessibilityLabel(label)
    }
}

/// A glass capsule on the silk ("Тэргүүлэгчид" under the points).
struct GlassCapsule: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 22).padding(.vertical, 10)
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(Capsule().strokeBorder(.white.opacity(0.14), lineWidth: 1))
        }
        .buttonStyle(PressableStyle())
    }
}

/// The section heading inside the dark sheet, with optional round actions.
struct SheetHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: () -> Trailing

    init(_ title: String, @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }) {
        self.title = title
        self.trailing = trailing
    }

    var body: some View {
        HStack {
            Text(title).font(.title2.bold()).foregroundStyle(.white)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            trailing()
        }
        .padding(.top, 4)
    }
}

/// A rounded card on the black sheet.
struct DarkCard<Content: View>: View {
    var padding: CGFloat = 18
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(.white.opacity(0.06), lineWidth: 1))
    }
}

/// A row with a white rounded-square icon, the way account and settings rows
/// look in the dark design.
struct IconRow: View {
    let title: String
    var subtitle: String?
    let systemImage: String
    var tint: Color = .black
    var tile: Color = .white
    var trailing: String?
    var chevron = true

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .background(tile, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.body.weight(.semibold)).foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                if let subtitle {
                    Text(subtitle).font(.subheadline).foregroundStyle(Theme.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            if let trailing {
                Text(trailing).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.secondaryText)
            }
            if chevron {
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.tertiaryText)
            }
        }
        .frame(minHeight: Theme.minTap)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// Several IconRows in one card; put a RowDivider between them.
struct RowGroup<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) { content() }
        .padding(.horizontal, 16).padding(.vertical, 4)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(.white.opacity(0.06), lineWidth: 1))
    }
}

/// The inset hairline between rows of a RowGroup.
struct RowDivider: View {
    var body: some View {
        Rectangle().fill(.white.opacity(0.08)).frame(height: 1).padding(.leading, 58)
    }
}

/// Rises into place a moment after the screen appears, each item a little
/// after the one before it.
struct Rise: ViewModifier {
    let index: Int
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .opacity(shown || reduceMotion ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : 18)
            .onAppear {
                guard !shown else { return }
                withAnimation(.spring(response: 0.55, dampingFraction: 0.82).delay(0.05 + Double(index) * 0.06)) { shown = true }
            }
    }
}

extension View {
    func rise(_ index: Int) -> some View { modifier(Rise(index: index)) }
}

/// Placeholder cards while a sheet's first answer is on its way.
struct SkeletonCards: View {
    var count = 3
    var body: some View {
        VStack(spacing: 16) {
            ForEach(0..<count, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Theme.card)
                    .frame(height: 92)
                    .overlay(alignment: .leading) {
                        HStack(spacing: 14) {
                            RoundedRectangle(cornerRadius: 13).fill(Theme.cardRaised).frame(width: 44, height: 44)
                            VStack(alignment: .leading, spacing: 8) {
                                Capsule().fill(Theme.cardRaised).frame(width: 160, height: 12)
                                Capsule().fill(Theme.cardRaised).frame(width: 100, height: 10)
                            }
                        }
                        .padding(.horizontal, 18)
                    }
            }
        }
        .opacity(0.8)
        .accessibilityLabel("Ачаалж байна")
    }
}
