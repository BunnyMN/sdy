import SwiftUI

struct RootView: View {
    @EnvironmentObject var app: AppModel

    var body: some View {
        Group {
            switch app.phase {
            case .launching:
                LaunchView()
            case .signedOut:
                LoginView()
            case .signedIn:
                MainTabView()
            case .failed(let error):
                VStack {
                    ErrorStateView(error: error) { Task { app.phase = .launching; await app.bootstrap() } }
                    Button("Гарах", role: .destructive) { Task { await app.signOut() } }
                        .frame(minHeight: Theme.minTap)
                        .padding(.bottom, 32)
                }
            }
        }
        .animation(.easeInOut(duration: 0.4), value: app.phase)
    }
}

/// Shown while the session is checked. It begins exactly where the system
/// launch screen ends — the silver wordmark, centred, on black — then lets
/// the silk fade in, sweeps light across the letters and runs a slim loader,
/// so the hand-over to Home is black to black with nothing jumping.
struct LaunchView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var silk = false

    var body: some View {
        ZStack {
            Theme.canvas.ignoresSafeArea()
            SilkBackground()
                .ignoresSafeArea()
                .opacity(silk ? 1 : 0)
            TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { context in
                let t = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
                // Centred like the launch screen's image; the loader hangs below
                // without moving it.
                ShimmerWordmark(width: 213, sweep: min((t.truncatingRemainder(dividingBy: 2.6)) / 1.2, 1.2))
                    .overlay(alignment: .bottom) { LoaderBar(phase: t).offset(y: 48) }
            }
        }
        .onAppear { withAnimation(.easeOut(duration: 0.9)) { silk = true } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("SDY. Ачаалж байна")
    }
}

/// The wordmark with a band of light crossing it; `sweep` runs 0 → 1 across.
struct ShimmerWordmark: View {
    var width: CGFloat
    var sweep: Double

    var body: some View {
        mark
            .overlay {
                LinearGradient(stops: [.init(color: .clear, location: 0),
                                       .init(color: .white.opacity(0.85), location: 0.5),
                                       .init(color: .clear, location: 1)],
                               startPoint: .leading, endPoint: .trailing)
                    .frame(width: width * 0.35)
                    .rotationEffect(.degrees(18))
                    .offset(x: -width * 0.85 + width * 1.7 * sweep)
                    .blendMode(.plusLighter)
                    .mask(mark)
            }
            .shadow(color: .black.opacity(0.6), radius: 12, y: 10)
    }

    private var mark: some View {
        Image("Wordmark").resizable().scaledToFit().frame(width: width)
    }
}

/// A slim track with a light that glides back and forth.
struct LoaderBar: View {
    var phase: Double

    var body: some View {
        let x = (sin(phase * 2.4) + 1) / 2
        Capsule()
            .fill(.white.opacity(0.12))
            .frame(width: 120, height: 3)
            .overlay(alignment: .leading) {
                Capsule()
                    .fill(LinearGradient(colors: [Theme.brandRed.opacity(0), Theme.brandRed, .white],
                                         startPoint: .leading, endPoint: .trailing))
                    .frame(width: 44, height: 3)
                    .offset(x: CGFloat(x) * (120 - 44))
            }
    }
}

struct MainTabView: View {
    @EnvironmentObject var app: AppModel

    var body: some View {
        TabView(selection: $app.tab) {
            HomeView()
                .tabItem { Label("Нүүр", systemImage: "house") }
                .tag(AppModel.Tab.home)
                .badge(app.unreadCount)
            if app.hasApprovedBranch {
                EventsListView()
                    .tabItem { Label("Арга хэмжээ", systemImage: "calendar") }
                    .tag(AppModel.Tab.events)
                CheckInTabView()
                    .tabItem { Label("Ирц", systemImage: "qrcode.viewfinder") }
                    .tag(AppModel.Tab.checkin)
                DuesView()
                    .tabItem { Label("Хураамж", systemImage: "banknote") }
                    .tag(AppModel.Tab.dues)
            }
            ProfileView()
                .tabItem { Label("Профайл", systemImage: "person.crop.circle") }
                .tag(AppModel.Tab.profile)
        }
        .id(app.epoch)
        .sheet(item: $app.pendingCheckin) { code in
            CheckInConfirmView(code: code)
                .environmentObject(app)
        }
    }
}
