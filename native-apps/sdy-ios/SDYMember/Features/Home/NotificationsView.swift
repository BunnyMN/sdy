import SwiftUI

struct NotificationsView: View {
    @EnvironmentObject var app: AppModel
    @State private var items: [MemberNotification] = []
    @State private var unread = 0
    @State private var hasMore = false
    @State private var nextOffset = 0
    @State private var loaded = false
    @State private var error: APIError?
    @State private var busy = false
    @State private var actionError: String?
    /// A screen a notification names, opened on top of this list.
    @State private var pushed: HomeRoute?

    var body: some View {
        Group {
            if !loaded, let error {
                ErrorStateView(error: error) { Task { await load() } }
            } else if !loaded {
                SkeletonList()
            } else if items.isEmpty {
                EmptyStateView(title: "Шинэ мэдэгдэл алга", systemImage: "bell.slash",
                               message: "Арга хэмжээ, хураамж, санал хураалтын мэдээ энд ирнэ.")
            } else {
                List {
                    if let actionError { NoticeView(text: actionError, kind: .error) }
                    ForEach(items) { item in
                        Button { Task { await open(item) } } label: { row(item) }
                            .buttonStyle(.plain)
                    }
                    if hasMore {
                        Button("Цааш үзэх") { Task { await more() } }
                            .frame(maxWidth: .infinity, minHeight: Theme.minTap)
                            .disabled(busy)
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Мэдэгдэл")
        .navigationDestination(item: $pushed) { $0.destination }
        .toolbar {
            // Small, and only while something is unread.
            if unread > 0 {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { Task { await readAll() } } label: {
                            Label("Бүгдийг уншсанд тооцох", systemImage: "checkmark.circle")
                        }
                        .disabled(busy || app.isOffline)
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .frame(minWidth: Theme.minTap, minHeight: Theme.minTap)
                    }
                    .accessibilityLabel("Мэдэгдлийн үйлдэл")
                }
            }
        }
        .refreshable { await load() }
        .task { if !loaded { await load() } }
        .offlineBanner()
    }

    private func row(_ item: MemberNotification) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(item.isRead ? Color.clear : Theme.accent)
                .frame(width: 10, height: 10)
                .padding(.top, 6)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(item.title).font(item.isRead ? .body : .body.weight(.semibold))
                    Spacer()
                    if !item.isRead { Text("Шинэ").font(.caption2.weight(.bold)).foregroundStyle(Theme.accent) }
                }
                if !item.body.isEmpty {
                    Text(item.body).font(.subheadline).foregroundStyle(.secondary)
                }
                Text(Formatters.relative(item.createdAt)).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel((item.isRead ? "" : "Уншаагүй. ") + item.title + ". " + item.body)
    }

    private func load() async {
        do {
            let page = try await app.api.notifications()
            items = page.items
            unread = page.unread ?? page.items.filter { !$0.isRead }.count
            hasMore = page.hasMore
            nextOffset = page.nextOffset ?? page.items.count
            loaded = true
            error = nil
            app.unreadCount = unread
        } catch {
            self.error = APIError.wrap(error)
        }
    }

    private func more() async {
        busy = true; defer { busy = false }
        if let page = try? await app.api.notifications(offset: nextOffset) {
            items = items.appendingUnique(page.items)
            hasMore = page.hasMore
            nextOffset = page.nextOffset ?? items.count
        }
    }

    private func open(_ item: MemberNotification) async {
        actionError = nil
        // Shown as read only once the server has it so.
        if !item.isRead, !app.isOffline, await app.markNotificationRead(item.id) {
            if let index = items.firstIndex(where: { $0.id == item.id }) {
                items[index].readAt = Formatters.dateTime(Date())
            }
            unread = max(0, unread - 1)
        }
        do {
            // From the list, a screen opens on top of it (in Нүүр or Профайл,
            // wherever the list is); tabs and events switch as a push would.
            switch try await app.resolveNotification(item.path) {
            case .route(let route): pushed = route
            case .event(let id, _): app.openEvent(id)
            case .tab(let tab): app.tab = tab
            case .home: app.tab = .home; app.homePath = []
            case .none: break
            }
        } catch { actionError = APIError.wrap(error).message }
    }

    private func readAll() async {
        busy = true; defer { busy = false }
        do {
            try await app.api.markAllRead()
            await load()
        } catch { actionError = APIError.wrap(error).message }
    }
}
