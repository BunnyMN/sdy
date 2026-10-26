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
        .animation(.default, value: app.phase)
    }
}

struct LaunchView: View {
    var body: some View {
        ZStack {
            Color("LaunchBackground").ignoresSafeArea()
            VStack(spacing: 24) {
                Image("LaunchLogo").resizable().scaledToFit().frame(maxWidth: 240)
                    .accessibilityLabel("SDY")
                ProgressView().tint(.white)
            }
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
