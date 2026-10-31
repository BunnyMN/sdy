import SwiftUI

struct EventsListView: View {
    enum Filter: String, CaseIterable, Identifiable {
        case upcoming, past
        var id: String { rawValue }
        var title: String { self == .upcoming ? "Удахгүй" : "Өнгөрсөн" }
    }

    @EnvironmentObject var app: AppModel
    @StateObject private var loader = Loader<[EventRecord]> { try await APIClient.shared.events().events }
    @State private var filter: Filter = .upcoming

    var body: some View {
        NavigationStack(path: $app.eventsPath) {
            LoadingView(loader: loader) { events in list(events) }
                .navigationTitle("Арга хэмжээ")
                .navigationDestination(for: String.self) { id in EventDetailView(eventID: id) }
                .offlineBanner()
        }
        .task { await loader.loadIfNeeded() }
    }

    @ViewBuilder
    private func list(_ events: [EventRecord]) -> some View {
        let shown = filtered(events)
        List {
            Section {
                Picker("Шүүлтүүр", selection: $filter) {
                    ForEach(Filter.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowSeparator(.hidden)
            }
            if shown.isEmpty {
                EmptyStateView(title: filter == .upcoming ? "Удахгүй болох арга хэмжээ алга" : "Өнгөрсөн арга хэмжээ алга",
                               systemImage: "calendar",
                               message: filter == .upcoming ? "Салбар шинэ арга хэмжээ зарлахад энд гарна. Доош татаж шинэчилнэ үү." : "Таны салбарт болсон арга хэмжээ энд харагдана.",
                               actionTitle: "Шинэчлэх") { Task { await loader.load() } }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            } else {
                Section {
                    ForEach(shown) { event in
                        NavigationLink(value: event.id) { EventRow(event: event) }
                    }
                }
            }
        }
        .listStyle(.plain)
        .refreshable { await loader.load() }
    }

    private func filtered(_ events: [EventRecord]) -> [EventRecord] {
        let now = Date()
        switch filter {
        case .upcoming:
            return events.filter { ($0.startDate ?? .distantPast) >= now.addingTimeInterval(-6 * 3600) && $0.status != "done" }
                .sorted { ($0.startDate ?? .distantFuture) < ($1.startDate ?? .distantFuture) }
        case .past:
            return events.filter { ($0.startDate ?? .distantPast) < now.addingTimeInterval(-6 * 3600) || $0.status == "done" }
                .sorted { ($0.startDate ?? .distantPast) > ($1.startDate ?? .distantPast) }
        }
    }
}

struct EventRow: View {
    let event: EventRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(event.title).font(.headline).foregroundStyle(event.status == "cancelled" ? .secondary : .primary)
                .strikethrough(event.status == "cancelled")
            Label(Formatters.relative(event.startsAt), systemImage: "clock")
                .font(.subheadline).foregroundStyle(.secondary)
            if !event.location.isEmpty {
                Label(event.location, systemImage: "mappin.and.ellipse")
                    .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            }
            HStack(spacing: 6) {
                Label(event.capacityText, systemImage: "person.2").font(.caption).foregroundStyle(.secondary)
                Spacer(minLength: 4)
                if event.status != "planned" { StatusChip.eventStatus(event.status) }
                if let chip = StatusChip.attendance(event.myStatus) { chip }
                else if event.isFull && event.isOpen { StatusChip(text: "Дүүрсэн", systemImage: "person.fill.xmark", tone: .danger) }
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }
}
