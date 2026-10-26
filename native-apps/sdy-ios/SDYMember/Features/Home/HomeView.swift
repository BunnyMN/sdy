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
}

struct HomeView: View {
    @EnvironmentObject var app: AppModel
    @StateObject private var loader = Loader<HomeData> { try await HomeView.fetch(app: nil) }
    @State private var switching: String?
    @State private var switchError: String?

    var body: some View {
        NavigationStack(path: $app.homePath) {
            LoadingView(loader: loader) { data in content(data) }
                .navigationTitle("Нүүр")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink(value: HomeRoute.notifications) {
                            Image(systemName: app.unreadCount > 0 ? "bell.badge.fill" : "bell")
                                .symbolRenderingMode(.multicolor)
                                .frame(minWidth: Theme.minTap, minHeight: Theme.minTap)
                        }
                        .accessibilityLabel(app.unreadCount > 0 ? "Мэдэгдэл, \(app.unreadCount) уншаагүй" : "Мэдэгдэл")
                    }
                }
                .navigationDestination(for: HomeRoute.self) { route in route.destination }
                .offlineBanner()
        }
        .task {
            loader.setFetch { [weak app] in try await HomeView.fetch(app: app) }
            await loader.loadIfNeeded()
        }
    }

    @ViewBuilder
    private func content(_ data: HomeData) -> some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Сайн байна уу, \(firstName(data.profile.name))").font(.title2.bold())
                    if let me = app.me, app.hasApprovedBranch {
                        Label(me.tenantName, systemImage: "building.2").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4))
            }

            if app.hasApprovedBranch {
                todoSection(data)
            } else {
                joinSection(data)
            }

            branchSection(data)

            if app.hasApprovedBranch || !data.transfers.isEmpty {
                Section {
                    NavigationLink(value: HomeRoute.transfers) {
                        Label {
                            VStack(alignment: .leading) {
                                Text("Харьяалал шилжүүлэх")
                                if let pending = data.transfers.first(where: { $0.status == "PENDING" }) {
                                    Text("Хүлээгдэж буй: \(pending.toName)").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        } icon: { Image(systemName: "arrow.left.arrow.right") }
                    }
                    .frame(minHeight: Theme.minTap)
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await loader.load(); await app.refreshUnread() }
    }

    @ViewBuilder
    private func todoSection(_ data: HomeData) -> some View {
        let toReport = data.dues?.totals.map { $0.outstanding - $0.pending } ?? 0
        let anything = toReport > 0 || data.nextEvent != nil || !data.openVotes.isEmpty || !data.taskOffers.isEmpty || data.unread > 0
        Section("Танд хийх зүйл") {
            if let dues = data.dues, let totals = dues.totals, toReport > 0 {
                let overdue = dues.charges.contains { $0.isOverdue() }
                Button { app.tab = .dues } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "banknote.fill").foregroundStyle(Theme.accent).font(.title3)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Төлөх хураамж: \(Formatters.money(totals.outstanding - totals.pending))").font(.headline)
                            if overdue {
                                StatusChip(text: "Хугацаа хэтэрсэн", systemImage: "exclamationmark.triangle.fill", tone: .danger)
                            }
                            Text("Шилжүүлсэн бол «Төлбөр мэдэгдэх» товчоор мэдэгдэнэ үү.").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Хураамжийн хэсэг рүү шилжинэ")
            }
            if let event = data.nextEvent {
                Button { app.openEvent(event.id) } label: {
                    todoRow(icon: "calendar.badge.clock", title: event.title,
                            subtitle: "Дараагийн арга хэмжээ · \(Formatters.relative(event.startsAt))")
                }
                .buttonStyle(.plain)
            }
            ForEach(Array(data.openVotes.enumerated()), id: \.offset) { _, item in
                Button { app.openEvent(item.event.id) } label: {
                    todoRow(icon: "checkmark.seal", title: "Санал өгөх: \(item.motion.title)", subtitle: item.event.title)
                }
                .buttonStyle(.plain)
            }
            ForEach(Array(data.taskOffers.enumerated()), id: \.offset) { _, item in
                Button { app.openEvent(item.event.id) } label: {
                    todoRow(icon: "hand.raised", title: "Танд санал болгосон ажил: \(item.task.title)", subtitle: item.event.title)
                }
                .buttonStyle(.plain)
            }
            if data.unread > 0 {
                NavigationLink(value: HomeRoute.notifications) {
                    todoRow(icon: "bell.badge", title: "\(data.unread) уншаагүй мэдэгдэл", subtitle: "Шинэ мэдээллээ үзнэ үү", chevron: false)
                }
            }
            if !anything {
                Label("Одоогоор хийх зүйл алга. Сайн байна!", systemImage: "checkmark.circle")
                    .foregroundStyle(.secondary)
                    .frame(minHeight: Theme.minTap)
            }
        }
    }

    private func todoRow(icon: String, title: String, subtitle: String, chevron: Bool = true) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).foregroundStyle(Theme.accent).font(.title3).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body.weight(.medium)).foregroundStyle(.primary)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if chevron { Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary) }
        }
        .frame(minHeight: Theme.minTap)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func joinSection(_ data: HomeData) -> some View {
        let pending = data.joinItems.filter { $0.status.uppercased() == "PENDING" }
        Section {
            if !data.joinItems.isEmpty {
                ForEach(data.joinItems) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.provider).font(.headline)
                        Label(Labels.joinRequest(item.status),
                              systemImage: item.status.uppercased() == "PENDING" ? "hourglass" : "info.circle")
                            .font(.subheadline)
                            .foregroundStyle(item.status.uppercased() == "PENDING" ? .orange : .secondary)
                        if !item.answer.isEmpty { Text(item.answer).font(.footnote) }
                    }
                    .padding(.vertical, 4)
                }
            }
            if pending.isEmpty && !(app.record?.hasPrimary ?? false) {
                NavigationLink(value: HomeRoute.joinRequest) {
                    Label("Салбарт элсэх хүсэлт илгээх", systemImage: "person.badge.plus")
                        .font(.headline)
                        .frame(minHeight: Theme.minTap)
                }
            }
        } header: {
            Text("Гишүүнчлэл")
        } footer: {
            Text(pending.isEmpty
                 ? "Харьяалагдах салбараа сонгож элсэх хүсэлт илгээнэ. Салбарын менежер баталсны дараа арга хэмжээ, ирц, хураамжийн хэсгүүд нээгдэнэ."
                 : "Таны хүсэлтийг салбарын менежер шийдвэрлэсний дараа бүх хэсэг нээгдэнэ. Доош татаж шинэчилнэ үү.")
        }
    }

    @ViewBuilder
    private func branchSection(_ data: HomeData) -> some View {
        let slugs = Set(data.branches.map(\.slug))
        let orgs = data.profile.organisations.filter { slugs.contains($0.slug) }
        if !orgs.isEmpty {
            Section {
                ForEach(orgs) { org in
                    let primary = app.record?.memberships.contains { $0.tenantId == org.id && $0.isPrimary } ?? false
                    HStack(spacing: 12) {
                        Image(systemName: "building.2.fill").foregroundStyle(Theme.accent).frame(width: 28)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(org.name).font(.body.weight(.medium))
                            Text(primary ? "Үндсэн харьяалал" : "Бусад харьяалал / ажиллах эрх")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if org.id == app.me?.tenantId {
                            StatusChip(text: "Идэвхтэй", systemImage: "checkmark.circle.fill", tone: .success)
                        } else if switching == org.id {
                            ProgressView()
                        } else {
                            Button("Орох") { Task { await switchTo(org) } }
                                .buttonStyle(.bordered)
                                .disabled(switching != nil || app.isOffline)
                                .accessibilityLabel("\(org.name) салбар руу орох")
                        }
                    }
                    .frame(minHeight: Theme.minTap)
                }
                if let switchError { NoticeView(text: switchError, kind: .error) }
            } header: {
                Text("Миний салбарууд")
            }
        }
    }

    private func switchTo(_ org: Organisation) async {
        switching = org.id; switchError = nil
        defer { switching = nil }
        do { try await app.switchBranch(to: org.id) } catch { switchError = APIError.wrap(error).message }
    }

    private func firstName(_ full: String) -> String {
        full.split(separator: " ").first.map(String.init) ?? full
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
        data.dues = try? await dues
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
