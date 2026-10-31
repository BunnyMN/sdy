import SwiftUI

/// The dark, slowly moving background behind every screen's header, in the
/// theme the member chose (Профайл → Өнгө төрх): silk ribbons in red, silver
/// or gold, or a starfield. All drawn in code, so the app carries no borrowed
/// imagery. Holds still when Reduce Motion is on.
struct SilkBackground: View {
    var redTint: Double = 0.35
    /// Shows a given theme instead of the chosen one (the theme previews).
    var forcedTheme: AppTheme?
    @AppStorage(AppTheme.storageKey) private var chosen = AppTheme.silk.rawValue
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var theme: AppTheme { forcedTheme ?? AppTheme(rawValue: chosen) ?? .silk }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { context in
            let t = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
            Canvas { ctx, size in
                ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Theme.canvas))
                if theme == .space {
                    Starfield.draw(&ctx, size, t: t)
                } else if theme == .glass {
                    Aurora.draw(&ctx, size, t: t)
                } else {
                    let r = theme.ribbons(redTint: redTint)
                    ribbon(&ctx, size, t: t, phase: 0, y: 0.30, depth: 0.22, colors: r.0)
                    ribbon(&ctx, size, t: t * 0.8, phase: 2.1, y: 0.48, depth: 0.18, colors: r.1)
                    ribbon(&ctx, size, t: t * 0.6, phase: 4.2, y: 0.66, depth: 0.14, colors: r.2)
                }
            }
        }
        .overlay(LinearGradient(colors: [.black.opacity(0.55), .clear, .black.opacity(0.35)],
                                startPoint: .top, endPoint: .bottom))
        .animation(.easeInOut(duration: 0.5), value: chosen)
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
    /// What stays pinned at the top once the header has collapsed — a name,
    /// a small avatar. Nil keeps no bar.
    var compact: AnyView?
    /// The header's top row (greeting, round buttons): held still at the top
    /// of the screen — pulling down moves everything under it, not it — and
    /// faded out as the page scrolls up. The header leaves room for it.
    var pinned: AnyView?
    /// How much the header grows per point pulled down (0 = stays its size).
    var pullZoom: CGFloat = 0
    var header: () -> Header
    var content: () -> Content
    @State private var offset: CGFloat = 0

    init(heroHeight: CGFloat = 320, overlap: CGFloat = 32, onRefresh: (() async -> Void)? = nil,
         compact: AnyView? = nil, pinned: AnyView? = nil, pullZoom: CGFloat = 0,
         @ViewBuilder header: @escaping () -> Header, @ViewBuilder content: @escaping () -> Content) {
        self.heroHeight = heroHeight
        self.overlap = overlap
        self.onRefresh = onRefresh
        self.compact = compact
        self.pinned = pinned
        self.pullZoom = pullZoom
        self.header = header
        self.content = content
    }

    var body: some View {
        ScrollView(.vertical) {
            VStack(spacing: 0) {
                StretchyHero(height: heroHeight, overlap: overlap, pullZoom: pullZoom, header: header)
                sheet
            }
        }
        .scrollIndicators(.hidden)
        .background(Theme.canvas.ignoresSafeArea())
        .ignoresSafeArea(edges: .top)
        .refreshable { await onRefresh?() }
        .onPreferenceChange(HeroOffsetKey.self) { offset = $0 }
        .overlay(alignment: .top) { pinnedRow }
        .overlay(alignment: .top) { compactBar }
    }

    @ViewBuilder
    private var pinnedRow: some View {
        if let pinned {
            let fade = offset < 0 ? max(0, 1 + Double(offset / 140)) : 1
            pinned
                .padding(.horizontal, 20)
                .padding(.top, 6)
                .opacity(fade)
                .allowsHitTesting(fade > 0.5)
        }
    }

    /// The pinned bar fades in over the last stretch before the sheet reaches
    /// the top, as the header shrinks away underneath it.
    @ViewBuilder
    private var compactBar: some View {
        if let compact {
            let start = heroHeight - 190
            let progress = min(max((-offset - start) / 70, 0), 1)
            compact
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .frame(height: 52)
                .background {
                    Rectangle()
                        .fill(.ultraThinMaterial)
                        .overlay(Color.black.opacity(0.35))
                        .overlay(alignment: .bottom) { Rectangle().fill(.white.opacity(0.08)).frame(height: 0.5) }
                        .ignoresSafeArea(edges: .top)
                }
                .offset(y: (1 - progress) * -8)
                .opacity(progress)
                .allowsHitTesting(progress > 0.5)
                .animation(.easeOut(duration: 0.15), value: progress > 0.5)
        }
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
    var pullZoom: CGFloat = 0
    let header: () -> Header

    var body: some View {
        GeometryReader { geo in
            let y: CGFloat = geo.frame(in: .scrollView).minY
            let pull: CGFloat = max(0, y)
            let fade: Double = y < 0 ? max(0, 1 + Double(y / (height * 0.6))) : 1
            // Scrolling up shrinks the header towards the top as it fades;
            // pulling down zooms the silk, and the header too if asked.
            let scale: CGFloat = y < 0 ? max(0.8, 1 + y / (height * 1.6)) : 1 + min(pull * pullZoom, 0.35)
            ZStack(alignment: .top) {
                SilkBackground()
                    .frame(height: height + pull + overlap)
                    .scaleEffect(1 + pull / 500, anchor: .bottom)
                    .offset(y: y > 0 ? -y : -y * 0.5)
                header()
                    .frame(height: height, alignment: .top)
                    .scaleEffect(scale, anchor: y < 0 ? .top : .center)
                    .offset(y: y < 0 ? -y * 0.45 : 0)
                    .opacity(fade)
            }
            .preference(key: HeroOffsetKey.self, value: y)
        }
        .frame(height: height)
    }
}

/// How far the hero has scrolled (negative going up), read by HeroScaffold.
private struct HeroOffsetKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
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
