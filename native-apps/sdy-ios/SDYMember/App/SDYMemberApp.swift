import SwiftUI

@main
struct SDYMemberApp: App {
    @StateObject private var app = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .tint(Theme.accent)
                .preferredColorScheme(.dark)
                .task { await app.bootstrap() }
                .onOpenURL { app.handle(url: $0) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { app.handle(url: url) }
                }
                .onChange(of: scenePhase) { _, phase in
                    // Pattern from native-apps/mobile/ios MobileLoginView: a
                    // long-poll that died in the background restarts the
                    // moment the app is active again.
                    if phase == .active { app.resumeTick += 1 }
                }
        }
    }
}
