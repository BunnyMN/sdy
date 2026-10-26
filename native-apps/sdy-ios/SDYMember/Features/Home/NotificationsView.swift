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
        .toolbar {
            if unread > 0 {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Бүгдийг уншсан") { Task { await readAll() } }
                        .disabled(busy || app.isOffline)
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
            items += page.items
            hasMore = page.hasMore
            nextOffset = page.nextOffset ?? items.count
        }
    }

    private func open(_ item: MemberNotification) async {
        actionError = nil
        if !item.isRead, !app.isOffline {
            try? await app.api.markRead(item.id)
            if let index = items.firstIndex(of: item) {
                items[index].readAt = Formatters.dateTime(Date())
                unread = max(0, unread - 1)
                app.unreadCount = unread
            }
        }
        do { try await app.openNotificationPath(item.path) } catch { actionError = APIError.wrap(error).message }
    }

    private func readAll() async {
        busy = true; defer { busy = false }
        do {
            try await app.api.markAllRead()
            await load()
        } catch { actionError = APIError.wrap(error).message }
    }
}
