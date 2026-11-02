import SwiftUI

/// The union's own event posters, shown on the sign-in screen — the same five
/// the web front page carries (frontend/components/landing/SdyEventSlides.tsx).
struct EventPoster: Identifiable {
    let id: String
    let kicker: String
    let title: String

    static let all: [EventPoster] = [
        EventPoster(id: "sdy-festival-2026", kicker: "Наадам", title: "SDY Festival 2026"),
        EventPoster(id: "moddoo-usalya-2026", kicker: "Ногоон аян", title: "Моддоо усалъя — хаврын цэнэг усалгааны аян"),
        EventPoster(id: "nairamdal-moto-festival-2026", kicker: "Фестиваль", title: "Азна базна — Найрамдал Moto Festival"),
        EventPoster(id: "sd-walking-festival-2026", kicker: "Аялал", title: "SD Walking Festival — Go walk, feel free!"),
        EventPoster(id: "silver-rose-2025", kicker: "Хүндэтгэлийн үдэш", title: "SDY Mode On — Silver Rose"),
    ]

    private static var cache: [String: UIImage] = [:]

    var image: UIImage? {
        if let hit = Self.cache[id] { return hit }
        guard let url = Bundle.main.url(forResource: id, withExtension: "webp"),
              let image = UIImage(contentsOfFile: url.path) else { return nil }
        Self.cache[id] = image
        return image
    }
}

/// The sign-in slideshow: first the SDY mark on black, then each poster,
/// then the mark again.
@MainActor
final class PosterReel: ObservableObject {
    /// 0 is the mark; 1… are `posters`.
    @Published private(set) var index = 0
    let posters = EventPoster.all
    private var task: Task<Void, Never>?

    var count: Int { posters.count + 1 }
    var poster: EventPoster? { index == 0 ? nil : posters[index - 1] }

    func start() {
        guard task == nil else { return }
        task = Task { [weak self] in
            while !Task.isCancelled {
                let hold: UInt64 = (self?.index ?? 0) == 0 ? 5_000_000_000 : 5_500_000_000
                try? await Task.sleep(nanoseconds: hold)
                guard !Task.isCancelled else { return }
                self?.advance()
            }
        }
    }

    func stop() { task?.cancel(); task = nil }

    func advance() {
        withAnimation(.easeInOut(duration: 0.9)) { index = (index + 1) % count }
    }
}

/// Full-bleed behind the top of the screen: black for the mark, and for a
/// poster a dark, blurred copy of it so posters of any shape sit on their own colours.
struct PosterBackdrop: View {
    @ObservedObject var reel: PosterReel
    var height: CGFloat

    var body: some View {
        ZStack {
            Color.black
            if let poster = reel.poster, let image = poster.image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(height: height)
                    .blur(radius: 40)
                    .opacity(0.55)
                    .id(poster.id)
                    .transition(.opacity)
            }
            LinearGradient(stops: [
                .init(color: .black.opacity(0.6), location: 0),
                .init(color: .clear, location: 0.3),
                .init(color: .clear, location: 0.7),
                .init(color: Color(red: 0.05, green: 0.055, blue: 0.075), location: 1),
            ], startPoint: .top, endPoint: .bottom)
        }
        .frame(height: height)
        .clipped()
        .accessibilityHidden(true)
    }
}

/// The slide itself: the spinning mark, or the current poster shown whole
/// and sharp, drifting slowly closer.
struct PosterStage: View {
    @ObservedObject var reel: PosterReel

    var body: some View {
        ZStack {
            if let poster = reel.poster {
                SharpPoster(poster: poster)
                    .id(poster.id)
                    .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 1.06)),
                                            removal: .opacity.combined(with: .scale(scale: 0.96))))
            } else {
                SpinningMark()
                    .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }
}

private struct SharpPoster: View {
    let poster: EventPoster
    @State private var drift = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if let image = poster.image {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.white.opacity(0.12), lineWidth: 1))
                .shadow(color: .black.opacity(0.6), radius: 24, y: 14)
                .scaleEffect(drift ? 1.03 : 0.98)
                // Fits the stage both ways: a tall poster is held by the
                // height, a wide one by the width.
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.horizontal, 10)
                .padding(.vertical, 2)
                .onAppear {
                    guard !reduceMotion else { return }
                    withAnimation(.easeInOut(duration: 6)) { drift = true }
                }
        }
    }
}

/// The SDY Darkhan-Uul wordmark on black: it settles into place, then light
/// sweeps across it.
private struct SpinningMark: View {
    @State private var start = Date()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 60, paused: reduceMotion)) { context in
            let t = reduceMotion ? 10 : context.date.timeIntervalSince(start)
            let p = min(t / 0.9, 1)
            let eased = 1 - pow(1 - p, 3)
            let sweep = t < 0.9 ? -1 : min((t - 0.9).truncatingRemainder(dividingBy: 2.2) / 1.1, 1.2)
            ShimmerWordmark(width: 310, sweep: sweep)
                .opacity(eased)
                .scaleEffect(0.92 + 0.08 * eased)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                // The glow is decoration: drawn behind, taking no room, so
                // it can be wider than the screen without pushing anything.
                .background {
                    RadialGradient(colors: [Theme.brandRed.opacity(0.45), .clear],
                                   center: .center, startRadius: 10, endRadius: 220)
                        .opacity(p)
                        .allowsHitTesting(false)
                }
        }
        .onAppear { start = Date() }
    }
}

/// The current slide's name under the stage.
struct PosterCaption: View {
    @ObservedObject var reel: PosterReel

    var body: some View {
        VStack(spacing: 8) {
            Text(reel.poster == nil ? "1997 ОНООС" : "БИДНИЙ ХАМТДАА БҮТЭЭСЭН МӨЧҮҮД")
                .font(.caption2.weight(.bold)).tracking(1.5)
                .foregroundStyle(.white.opacity(0.55))
            Text(reel.poster?.title ?? "SDY Darkhan-Uul")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .lineLimit(2, reservesSpace: true)
                .id(reel.index)
                .transition(.opacity.combined(with: .offset(y: 6)))
        }
        .padding(.horizontal, 20)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onTapGesture { reel.advance() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(reel.poster.map { "Бидний хамтдаа бүтээсэн мөчүүд: \($0.kicker), \($0.title)" } ?? "SDY Darkhan-Uul")
        .accessibilityAddTraits(.updatesFrequently)
    }
}
