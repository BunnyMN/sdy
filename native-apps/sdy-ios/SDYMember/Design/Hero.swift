import SwiftUI

/// The dark, slowly moving "silk" behind every screen's header: three soft
/// ribbons of graphite light with a breath of SDY red, drawn in code so the app
/// carries no borrowed imagery. Holds still when Reduce Motion is on.
struct SilkBackground: View {
    var redTint: Double = 0.35
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { context in
            let t = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
            Canvas { ctx, size in
                ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Theme.canvas))
                ribbon(&ctx, size, t: t, phase: 0, y: 0.30, depth: 0.22,
                       colors: [Color(white: 0.10), Color(white: 0.34), Color(white: 0.12)])
                ribbon(&ctx, size, t: t * 0.8, phase: 2.1, y: 0.48, depth: 0.18,
                       colors: [Color(white: 0.06), Theme.brandRed.opacity(redTint), Color(white: 0.20)])
                ribbon(&ctx, size, t: t * 0.6, phase: 4.2, y: 0.66, depth: 0.14,
                       colors: [Color(white: 0.14), Color(white: 0.42), Color(white: 0.08)])
            }
        }
        .overlay(LinearGradient(colors: [.black.opacity(0.55), .clear, .black.opacity(0.35)],
                                startPoint: .top, endPoint: .bottom))
        .accessibilityHidden(true)
    }

    /// One ribbon: a wide band whose upper edge is a slow sine wave, shaded
    /// across its width so it reads as folded fabric catching light.
    private func ribbon(_ ctx: inout GraphicsContext, _ size: CGSize, t: Double, phase: Double,
                        y: Double, depth: Double, colors: [Color]) {
        let w = size.width, h = size.height
        var path = Path()
        let base = h * y
        path.move(to: CGPoint(x: 0, y: base))
        let steps = 48
        for i in 0...steps {
            let x = w * Double(i) / Double(steps)
            let u = Double(i) / Double(steps)
            let wave = sin(u * .pi * 1.6 + t * 0.35 + phase) * h * depth * 0.5
                + sin(u * .pi * 3.2 - t * 0.22 + phase) * h * depth * 0.18
            path.addLine(to: CGPoint(x: x, y: base + wave))
        }
        path.addLine(to: CGPoint(x: w, y: h))
        path.addLine(to: CGPoint(x: 0, y: h))
        path.closeSubpath()
        let shift = sin(t * 0.25 + phase) * 0.15
        ctx.fill(path, with: .linearGradient(Gradient(colors: colors),
                                             startPoint: CGPoint(x: w * (0.0 + shift), y: base - h * 0.2),
                                             endPoint: CGPoint(x: w * (1.0 + shift), y: base + h * 0.3)))
    }
}

/// A screen with a silk header that the content sheet slides over: the
/// header stretches when pulled down and drifts at half speed when scrolled,
/// and the content sits on a black sheet with large rounded top corners.
struct HeroScaffold<Header: View, Content: View>: View {
    var heroHeight: CGFloat = 320
    var overlap: CGFloat = 32
    var onRefresh: (() async -> Void)?
    @ViewBuilder var header: () -> Header
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView(.vertical) {
            VStack(spacing: 0) {
                StretchyHero(height: heroHeight, overlap: overlap, header: header)
                sheet
            }
        }
        .scrollIndicators(.hidden)
        .background(Theme.canvas.ignoresSafeArea())
        .ignoresSafeArea(edges: .top)
        .refreshable { await onRefresh?() }
    }

    private var sheet: some View {
        VStack(spacing: 16) { content() }
            .padding(.horizontal, 16)
            .padding(.top, 24)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity, alignment: .top)
            .background(
                UnevenRoundedRectangle(topLeadingRadius: 32, topTrailingRadius: 32, style: .continuous)
                    .fill(Theme.canvas)
                    .ignoresSafeArea(edges: .bottom)
            )
            .offset(y: -overlap)
            .padding(.bottom, -overlap)
    }
}

/// The silk header itself: stretches when pulled, drifts when scrolled,
/// and fades its content as the sheet covers it.
private struct StretchyHero<Header: View>: View {
    let height: CGFloat
    let overlap: CGFloat
    let header: () -> Header

    var body: some View {
        GeometryReader { geo in
            let y: CGFloat = geo.frame(in: .scrollView).minY
            let pull: CGFloat = max(0, y)
            let fade: Double = y < 0 ? max(0, 1 + Double(y / (height * 0.7))) : 1
            ZStack(alignment: .top) {
                SilkBackground()
                    .frame(height: height + pull + overlap)
                    .offset(y: y > 0 ? -y : -y * 0.5)
                header()
                    .frame(height: height, alignment: .top)
                    .offset(y: y < 0 ? -y * 0.35 : 0)
                    .opacity(fade)
            }
        }
        .frame(height: height)
    }
}

/// The header of a list screen (Events, Dues): a large title on the silk.
struct HeroTitle: View {
    let title: String
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Spacer(minLength: 0)
            Text(title).font(.system(size: 40, weight: .bold)).foregroundStyle(.white)
            if let subtitle {
                Text(subtitle).font(.subheadline).foregroundStyle(.white.opacity(0.7))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.bottom, 52)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

extension View {
    /// A grouped list on black with the silk glowing behind its large title,
    /// so list screens (Dues, Check-in, event details) match the hero screens.
    func silkListBackground(height: CGFloat = 300) -> some View {
        scrollContentBackground(.hidden)
            .background(alignment: .top) {
                ZStack(alignment: .top) {
                    Theme.canvas
                    SilkBackground()
                        .frame(height: height)
                        .mask(LinearGradient(colors: [.black, .black, .clear], startPoint: .top, endPoint: .bottom))
                }
                .ignoresSafeArea()
            }
    }
}
