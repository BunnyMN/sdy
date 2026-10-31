import SwiftUI

/// The union's own event posters, shown behind the sign-in wordmark — the
/// same five the web front page carries (frontend/components/landing/SdyEventSlides.tsx).
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

/// Which poster is showing; moves on every few seconds while the screen is up.
@MainActor
final class PosterReel: ObservableObject {
    @Published private(set) var index = 0
    let posters = EventPoster.all
    private var timer: Timer?

    var current: EventPoster { posters[index] }

    func start() {
        guard timer == nil else { return }
        timer = Timer.scheduledTimer(withTimeInterval: 5.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.advance() }
        }
    }

    func stop() { timer?.invalidate(); timer = nil }

    func advance() {
        withAnimation(.easeInOut(duration: 1.2)) { index = (index + 1) % posters.count }
    }
}

/// The posters filling the top of the screen, one at a time, each drifting
/// slowly closer (Ken Burns) and cross-fading into the next, under a dark
/// wash so the wordmark and the sign-in sheet stay readable.
struct PosterBackdrop: View {
    @ObservedObject var reel: PosterReel
    var height: CGFloat

    var body: some View {
        ZStack {
            Theme.canvas
            ForEach(Array(reel.posters.enumerated()), id: \.element.id) { i, poster in
                if i == reel.index {
                    KenBurnsImage(poster: poster, flip: i.isMultiple(of: 2))
                        .transition(.opacity)
                }
            }
            Color.black.opacity(0.45)
            RadialGradient(colors: [.clear, .black.opacity(0.65)], center: .center, startRadius: 120, endRadius: 420)
            LinearGradient(stops: [
                .init(color: .black.opacity(0.7), location: 0),
                .init(color: .clear, location: 0.3),
                .init(color: .clear, location: 0.65),
                .init(color: Color(red: 0.05, green: 0.055, blue: 0.075), location: 1),
            ], startPoint: .top, endPoint: .bottom)
        }
        .frame(height: height)
        .clipped()
        .accessibilityHidden(true)
    }
}

private struct KenBurnsImage: View {
    let poster: EventPoster
    let flip: Bool
    @State private var drift = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            if let image = poster.image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: geo.size.width, height: geo.size.height)
                    .scaleEffect(drift ? 1.18 : 1.06)
                    .offset(x: drift ? (flip ? -18 : 18) : 0, y: drift ? -10 : 0)
                    // Atmosphere, not reading matter: the poster's own text
                    // must not fight the wordmark.
                    .blur(radius: 5)
                    .saturation(1.15)
                    .clipped()
            }
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 7.5)) { drift = true }
        }
    }
}

/// The current poster's name under the wordmark, with a dot per poster.
struct PosterCaption: View {
    @ObservedObject var reel: PosterReel

    var body: some View {
        VStack(spacing: 8) {
            Text("БИДНИЙ ХАМТДАА БҮТЭЭСЭН МӨЧҮҮД")
                .font(.caption2.weight(.bold)).tracking(1.5)
                .foregroundStyle(.white.opacity(0.55))
            Text(reel.current.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .id(reel.current.id)
                .transition(.opacity.combined(with: .offset(y: 6)))
            HStack(spacing: 6) {
                ForEach(Array(reel.posters.enumerated()), id: \.element.id) { i, _ in
                    Capsule()
                        .fill(i == reel.index ? Color.white : Color.white.opacity(0.3))
                        .frame(width: i == reel.index ? 18 : 6, height: 6)
                }
            }
            .padding(.top, 2)
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onTapGesture { reel.advance() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Бидний хамтдаа бүтээсэн мөчүүд: \(reel.current.kicker), \(reel.current.title)")
        .accessibilityAddTraits(.updatesFrequently)
    }
}
