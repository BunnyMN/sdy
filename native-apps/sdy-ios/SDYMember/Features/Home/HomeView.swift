import SwiftUI

struct HomeData {
    var profile: Profile
    var branches: [Branch]
    var joinItems: [MyItem]
    var transfers: [MembershipTransfer]
    var dues: MyDuesPage?
    var nextEvent: EventRecord?
    var openVotes: [(event: EventRecord, motion: Motion)] = []
    var taskOffers: [(event: EventRecord, task: EventTask)] = []
    var unread: Int
    var points: Int?
}

struct HomeView: View {
    @EnvironmentObject var app: AppModel
    @StateObject private var loader = Loader<HomeData> { try await HomeView.fetch(app: nil) }
    @State private var switching: String?
    @State private var switchError: String?
    @State private var pointsHidden = false

    var body: some View {
        NavigationStack(path: $app.homePath) {
            Group {
                if let data = loader.value {
                    content(data)
                } else if let error = loader.error {
                    ErrorStateView(error: error) { Task { await loader.load() } }
                } else {
                    HeroScaffold(header: { heroHeader(nil) }) { SkeletonCards() }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: HomeRoute.self) { route in route.destination }
            .offlineBanner()
        }
        .task {
            loader.setFetch { [weak app] in try await HomeView.fetch(app: app) }
            await loader.loadIfNeeded()
        }
    }

    private func content(_ data: HomeData) -> some View {
        HeroScaffold(heroHeight: 400, onRefresh: { await loader.load(); await app.refreshUnread() }) {
            heroHeader(data)
        } content: {
            if app.hasApprovedBranch {
                todoSection(data)
            } else {
                joinSection(data)
            }
            branchSection(data)
            if app.hasApprovedBranch || !data.transfers.isEmpty {
                NavigationLink(value: HomeRoute.transfers) {
                    DarkCard(padding: 16) {
                        IconRow(title: "Харьяалал шилжүүлэх",
                                subtitle: data.transfers.first(where: { $0.status == "PENDING" }).map { "Хүлээгдэж буй: \($0.toName)" },
                                systemImage: "arrow.left.arrow.right")
                    }
                }
                .buttonStyle(PressableStyle(scale: 0.98))
                .rise(8)
            }
        }
    }

    // MARK: - Header

    private func heroHeader(_ data: HomeData?) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(greeting).font(.subheadline).foregroundStyle(.white.opacity(0.65))
                    Text(displayName(data?.profile.name ?? app.me?.name ?? ""))
                        .font(.title2.weight(.bold)).foregroundStyle(.white)
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
                Spacer()
                HStack(spacing: 12) {
                    if app.hasApprovedBranch {
                        GlassCircleButton(systemImage: pointsHidden ? "eye.slash.fill" : "eye.fill",
                                          label: pointsHidden ? "Оноог харуулах" : "Оноог нуух") {
                            withAnimation(.snappy) { pointsHidden.toggle() }
                        }
                    }
                    GlassCircleButton(systemImage: "bell.fill",
                                      label: app.unreadCount > 0 ? "Мэдэгдэл, \(app.unreadCount) уншаагүй" : "Мэдэгдэл",
                                      dot: app.unreadCount > 0) {
                        app.homePath.append(HomeRoute.notifications)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 70)

            Spacer(minLength: 12)

            if app.hasApprovedBranch {
                VStack(spacing: 10) {
                    Text(app.me?.tenantName ?? "Миний оноо")
                        .font(.subheadline).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        if pointsHidden {
                            Text("••••")
                        } else {
                            Text("\(data?.points ?? 0)")
                                .contentTransition(.numericText(value: Double(data?.points ?? 0)))
                            Text("оноо").font(.title3.weight(.semibold)).foregroundStyle(.white.opacity(0.7))
                        }
                    }
                    .font(.system(size: 46, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(pointsHidden ? "Оноо нуугдсан" : "Миний оноо \(data?.points ?? 0)")
                    GlassCapsule(title: "Тэргүүлэгчид") { app.homePath.append(HomeRoute.leaderboard) }
                }
                .animation(.snappy, value: data?.points)
            } else {
                VStack(spacing: 8) {
                    Image("Logo").resizable().scaledToFill().frame(width: 72, height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .accessibilityHidden(true)
                    Text("Салбартаа элсээд бүх боломжийг нээгээрэй")
                        .font(.subheadline).foregroundStyle(.white.opacity(0.75))
                }
            }

            Spacer(minLength: 16)

            HStack(spacing: 8) {
                if app.hasApprovedBranch {
                    GlassTile(title: "Арга хэмжээ", systemImage: "calendar") { app.tab = .events }
                    GlassTile(title: "Ирц", systemImage: "qrcode.viewfinder") { app.tab = .checkin }
                    GlassTile(title: "Хураамж", systemImage: "banknote.fill") { app.tab = .dues }
                    GlassTile(title: "Түүх", systemImage: "clock.arrow.circlepath") { app.homePath.append(HomeRoute.history) }
                } else {
                    GlassTile(title: "Элсэх", systemImage: "person.badge.plus") { app.homePath.append(HomeRoute.joinRequest) }
                    GlassTile(title: "Мэдэгдэл", systemImage: "bell.fill", badge: app.unreadCount) { app.homePath.append(HomeRoute.notifications) }
                    GlassTile(title: "Гишүүнчлэл", systemImage: "person.text.rectangle") { app.homePath.append(HomeRoute.record) }
                    GlassTile(title: "Тусламж", systemImage: "questionmark") { UIApplication.shared.open(AppConfig.supportURL) }
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 52)
        }
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12: return "Өглөөний мэнд"
        case 12..<18: return "Өдрийн мэнд"
        default: return "Оройн мэнд"
        }
    }

    /// "Батболд Ганзориг" → "Б. ГАНЗОРИГ", the way a bank card prints a name.
    private func displayName(_ full: String) -> String {
        let parts = full.split(separator: " ").map(String.init)
        guard parts.count >= 2, let initial = parts[0].first else { return full.uppercased() }
        return "\(initial). \(parts[1])".uppercased()
    }

    // MARK: - Sheet

    @ViewBuilder
    private func todoSection(_ data: HomeData) -> some View {
        let toReport = data.dues?.totals.map { $0.outstanding - $0.pending } ?? 0
        let anything = toReport > 0 || data.nextEvent != nil || !data.openVotes.isEmpty || !data.taskOffers.isEmpty || data.unread > 0
        SheetHeader("Танд хийх зүйл") {
            if data.unread > 0 {
                Text("\(data.unread)").font(.subheadline.bold()).foregroundStyle(.white)
                    .frame(minWidth: 34, minHeight: 34).background(Theme.brandRed, in: Circle())
                    .accessibilityLabel("\(data.unread) уншаагүй мэдэгдэл")
            }
        }
        .rise(0)

        if let dues = data.dues, let totals = dues.totals, toReport > 0 {
            let overdue = dues.charges.contains { $0.isOverdue() }
            Button { app.tab = .dues } label: {
                DarkCard {
                    HStack(spacing: 14) {
                        Image(systemName: "banknote.fill")
                            .font(.system(size: 20, weight: .semibold)).foregroundStyle(.black)
                            .frame(width: 52, height: 52)
                            .background(.white, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Төлөх хураамж").font(.subheadline).foregroundStyle(Theme.secondaryText)
                            Text(Formatters.money(totals.outstanding - totals.pending))
                                .font(.system(size: 26, weight: .bold, design: .rounded)).foregroundStyle(.white)
                            if overdue {
                                StatusChip(text: "Хугацаа хэтэрсэн", systemImage: "exclamationmark.triangle.fill", tone: .danger)
                            }
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.tertiaryText)
                    }
                }
            }
            .buttonStyle(PressableStyle(scale: 0.98))
            .accessibilityHint("Хураамжийн хэсэг рүү шилжинэ")
            .rise(1)
        }

        let rows = todoRows(data)
        if !rows.isEmpty {
            RowGroup {
                ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                    Button(action: row.action) {
                        IconRow(title: row.title, subtitle: row.subtitle, systemImage: row.icon)
                    }
                    .buttonStyle(PressableStyle(scale: 0.98))
                    if index < rows.count - 1 { RowDivider() }
                }
            }
            .rise(2)
        }

        if !anything {
            DarkCard {
                IconRow(title: "Одоогоор хийх зүйл алга", subtitle: "Сайн байна! Шинэ зүйл гарвал энд харагдана.",
                        systemImage: "checkmark", tint: .white, tile: Theme.cardRaised, chevron: false)
            }
            .rise(1)
        }
    }

    private struct TodoRow { let icon: String; let title: String; let subtitle: String; let action: () -> Void }

    private func todoRows(_ data: HomeData) -> [TodoRow] {
        var rows: [TodoRow] = []
        if let event = data.nextEvent {
            rows.append(TodoRow(icon: "calendar.badge.clock", title: event.title,
                                subtitle: "Дараагийн арга хэмжээ · \(Formatters.relative(event.startsAt))") { app.openEvent(event.id) })
        }
        for item in data.openVotes {
            rows.append(TodoRow(icon: "checkmark.seal.fill", title: "Санал өгөх: \(item.motion.title)", subtitle: item.event.title) { app.openEvent(item.event.id) })
        }
        for item in data.taskOffers {
            rows.append(TodoRow(icon: "hand.raised.fill", title: "Танд санал болгосон ажил: \(item.task.title)", subtitle: item.event.title) { app.openEvent(item.event.id) })
        }
        if data.unread > 0 {
            rows.append(TodoRow(icon: "bell.badge.fill", title: "\(data.unread) уншаагүй мэдэгдэл", subtitle: "Шинэ мэдээллээ үзнэ үү") {
                app.homePath.append(HomeRoute.notifications)
            })
        }
        return rows
    }

    @ViewBuilder
    private func joinSection(_ data: HomeData) -> some View {
        let pending = data.joinItems.filter { $0.status.uppercased() == "PENDING" }
        SheetHeader("Гишүүнчлэл").rise(0)
        if !data.joinItems.isEmpty {
            RowGroup {
                ForEach(Array(data.joinItems.enumerated()), id: \.offset) { index, item in
                    IconRow(title: item.provider,
                            subtitle: Labels.joinRequest(item.status) + (item.answer.isEmpty ? "" : "\n\(item.answer)"),
                            systemImage: item.status.uppercased() == "PENDING" ? "hourglass" : "info",
                            chevron: false)
                    if index < data.joinItems.count - 1 { RowDivider() }
                }
            }
            .rise(1)
        }
        if pending.isEmpty && !(app.record?.hasPrimary ?? false) {
            NavigationLink(value: HomeRoute.joinRequest) {
                DarkCard(padding: 16) {
                    IconRow(title: "Салбарт элсэх хүсэлт илгээх", systemImage: "person.badge.plus", tint: .white, tile: Theme.brandRed)
                }
            }
            .buttonStyle(PressableStyle(scale: 0.98))
            .rise(2)
        }
        Text(pending.isEmpty
             ? "Харьяалагдах салбараа сонгож элсэх хүсэлт илгээнэ. Салбарын менежер баталсны дараа арга хэмжээ, ирц, хураамжийн хэсгүүд нээгдэнэ."
             : "Таны хүсэлтийг салбарын менежер шийдвэрлэсний дараа бүх хэсэг нээгдэнэ. Доош татаж шинэчилнэ үү.")
            .font(.footnote).foregroundStyle(Theme.secondaryText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
            .rise(3)
    }

    @ViewBuilder
    private func branchSection(_ data: HomeData) -> some View {
        let slugs = Set(data.branches.map(\.slug))
        let orgs = data.profile.organisations.filter { slugs.contains($0.slug) }
        if !orgs.isEmpty {
            SheetHeader("Миний салбарууд").padding(.top, 8).rise(4)
            RowGroup {
                ForEach(Array(orgs.enumerated()), id: \.element.id) { index, org in
                    let primary = app.record?.memberships.contains { $0.tenantId == org.id && $0.isPrimary } ?? false
                    HStack(spacing: 14) {
                        Image(systemName: "building.2.fill")
                            .font(.system(size: 18, weight: .semibold)).foregroundStyle(.black)
                            .frame(width: 44, height: 44)
                            .background(.white, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(org.name).font(.body.weight(.semibold)).foregroundStyle(.white)
                            Text(primary ? "Үндсэн харьяалал" : "Бусад харьяалал / ажиллах эрх")
                                .font(.subheadline).foregroundStyle(Theme.secondaryText)
                        }
                        Spacer()
                        if org.id == app.me?.tenantId {
                            StatusChip(text: "Идэвхтэй", systemImage: "checkmark.circle.fill", tone: .success)
                        } else if switching == org.id {
                            ProgressView()
                        } else {
                            Button("Орох") { Task { await switchTo(org) } }
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 16).padding(.vertical, 8)
                                .background(Theme.cardRaised, in: Capsule())
                                .buttonStyle(PressableStyle())
                                .disabled(switching != nil || app.isOffline)
                                .accessibilityLabel("\(org.name) салбар руу орох")
                        }
                    }
                    .padding(.vertical, 10)
                    if index < orgs.count - 1 { RowDivider() }
                }
                if let switchError { NoticeView(text: switchError, kind: .error).padding(.vertical, 8) }
            }
            .rise(5)
        }
    }

    private func switchTo(_ org: Organisation) async {
        switching = org.id; switchError = nil
        defer { switching = nil }
        do { try await app.switchBranch(to: org.id) } catch { switchError = APIError.wrap(error).message }
    }

    @MainActor
    static func fetch(app: AppModel?) async throws -> HomeData {
        let api = APIClient.shared
        async let profile = api.profile()
        async let branches = api.branches()
        async let items = api.myItems()
        async let transfers = api.transfers()
        async let notifications = api.notifications()
        if let app { await app.reloadRecord() }
        let approved = app?.hasApprovedBranch ?? false

        var data = HomeData(
            profile: try await profile,
            branches: (try? await branches)?.branches ?? [],
            joinItems: ((try? await items)?.items ?? []).filter { $0.code == "join_request" },
            transfers: (try? await transfers)?.requests ?? [],
            unread: (try? await notifications).map { $0.unread ?? $0.items.filter { !$0.isRead }.count } ?? 0
        )
        app?.unreadCount = data.unread
        guard approved else { return data }

        async let dues = api.myDues()
        async let events = api.events()
        async let board = api.leaderboard(period: "all")
        data.dues = try? await dues
        data.points = (try? await board)?.me.map { Int($0.points) }
        let list = (try? await events)?.events ?? []
        let now = Date()
        let mine = list.filter { $0.isOpen && !$0.myStatus.isEmpty }
        data.nextEvent = mine
            .filter { ($0.startDate ?? .distantPast) >= now.addingTimeInterval(-3 * 3600) }
            .sorted { ($0.startDate ?? .distantFuture) < ($1.startDate ?? .distantFuture) }
            .first
        // Votes and task offers live on events the member takes part in that
        // are happening now or soon.
        let active = mine.filter {
            guard let start = $0.startDate else { return false }
            return start > now.addingTimeInterval(-86400) && start < now.addingTimeInterval(14 * 86400)
        }.prefix(3)
        for event in active {
            if let motions = try? await api.motions(event.id) {
                for motion in motions.motions where motions.needsMyVote(motion) {
                    data.openVotes.append((event, motion))
                }
            }
            if let tasks = try? await api.tasks(event.id) {
                for task in tasks.tasks where task.mine(tasks.me)?.status == "offered" {
                    data.taskOffers.append((event, task))
                }
            }
        }
        return data
    }
}

extension HomeRoute {
    @ViewBuilder
    var destination: some View {
        switch self {
        case .notifications: NotificationsView()
        case .transfers: TransfersView()
        case .record: MemberRecordView()
        case .participation: ParticipationView()
        case .leaderboard: LeaderboardView()
        case .history: PersonalHistoryView()
        case .about: AboutView()
        case .deleteAccount: DeleteAccountView()
        case .joinRequest: JoinRequestView()
        }
    }
}
