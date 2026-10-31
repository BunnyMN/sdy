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
            HeroScaffold(heroHeight: 230, onRefresh: { await loader.load() }) {
                HeroTitle(title: "Арга хэмжээ", subtitle: app.me?.tenantName)
            } content: {
                if let events = loader.value {
                    list(events)
                } else if let error = loader.error {
                    ErrorStateView(error: error) { Task { await loader.load() } }
                } else {
                    SkeletonCards(count: 4)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { id in EventDetailView(eventID: id) }
            .offlineBanner()
        }
        .task { await loader.loadIfNeeded() }
    }

    @ViewBuilder
    private func list(_ events: [EventRecord]) -> some View {
        let shown = filtered(events)
        FilterBar(selection: $filter)
            .rise(0)
        if shown.isEmpty {
            DarkCard {
                VStack(spacing: 10) {
                    Image(systemName: "calendar").font(.system(size: 34)).foregroundStyle(Theme.secondaryText)
                    Text(filter == .upcoming ? "Удахгүй болох арга хэмжээ алга" : "Өнгөрсөн арга хэмжээ алга")
                        .font(.headline).foregroundStyle(.white)
                    Text(filter == .upcoming ? "Салбар шинэ арга хэмжээ зарлахад энд гарна. Доош татаж шинэчилнэ үү." : "Таны салбарт болсон арга хэмжээ энд харагдана.")
                        .font(.subheadline).foregroundStyle(Theme.secondaryText).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
            }
            .rise(1)
        } else {
            ForEach(Array(shown.enumerated()), id: \.element.id) { index, event in
                NavigationLink(value: event.id) { EventRow(event: event) }
                    .buttonStyle(PressableStyle(scale: 0.98))
                    .rise(index + 1)
            }
        }
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

/// Upcoming / past, as a capsule switch whose knob slides between the two.
struct FilterBar: View {
    @Binding var selection: EventsListView.Filter
    @Namespace private var knob

    var body: some View {
        HStack(spacing: 4) {
            ForEach(EventsListView.Filter.allCases) { item in
                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { selection = item }
                    Haptics.tap()
                } label: {
                    Text(item.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(selection == item ? .black : .white)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background {
                            if selection == item {
                                Capsule().fill(.white).matchedGeometryEffect(id: "knob", in: knob)
                            }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selection == item ? .isSelected : [])
            }
        }
        .padding(4)
        .background(Theme.card, in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.06), lineWidth: 1))
    }
}

struct EventRow: View {
    let event: EventRecord

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(spacing: 2) {
                Text(day).font(.system(size: 22, weight: .bold, design: .rounded)).foregroundStyle(.black)
                Text(month).font(.caption2.weight(.semibold)).foregroundStyle(.black.opacity(0.55))
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            .frame(width: 52, height: 58)
            .background(.white, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 6) {
                Text(event.title).font(.headline).foregroundStyle(event.status == "cancelled" ? Theme.secondaryText : .white)
                    .strikethrough(event.status == "cancelled")
                    .multilineTextAlignment(.leading)
                Label(Formatters.relative(event.startsAt), systemImage: "clock")
                    .font(.subheadline).foregroundStyle(Theme.secondaryText)
                if !event.location.isEmpty {
                    Label(event.location, systemImage: "mappin.and.ellipse")
                        .font(.subheadline).foregroundStyle(Theme.secondaryText).lineLimit(1)
                }
                HStack(spacing: 6) {
                    Label(event.capacityText, systemImage: "person.2").font(.caption).foregroundStyle(Theme.secondaryText)
                    Spacer(minLength: 4)
                    if event.status != "planned" { StatusChip.eventStatus(event.status) }
                    if let chip = StatusChip.attendance(event.myStatus) { chip }
                    else if event.isFull && event.isOpen { StatusChip(text: "Дүүрсэн", systemImage: "person.fill.xmark", tone: .danger) }
                }
            }
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.tertiaryText)
                .padding(.top, 4)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(.white.opacity(0.06), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    private var date: Date? { event.startDate }
    private var day: String { date.map { String(Calendar.current.component(.day, from: $0)) } ?? "—" }
    private var month: String {
        guard let date else { return "" }
        return "\(Calendar.current.component(.month, from: date)) сар"
    }
}
