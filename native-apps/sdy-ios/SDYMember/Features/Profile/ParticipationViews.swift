import SwiftUI

struct ParticipationView: View {
    @EnvironmentObject var app: AppModel
    @State private var mine: MyEventsPage?
    @State private var points: PointsPage?
    @State private var error: APIError?
    @State private var busy = false

    var body: some View {
        Group {
            if let mine, let points {
                List {
                    Section {
                        VStack(alignment: .leading) {
                            Text("Нийт оноо").font(.caption).foregroundStyle(.secondary)
                            Text("\(Int(points.total))").font(.system(size: 40, weight: .bold, design: .rounded)).monospacedDigit()
                        }
                        .accessibilityElement(children: .combine)
                        NavigationLink(value: HomeRoute.leaderboard) { Label("Тэргүүлэгчдийн самбар", systemImage: "trophy") }
                    }
                    Section("Миний ирц") {
                        if mine.items.isEmpty { Text("Одоогоор оролцооны бүртгэл алга.").foregroundStyle(.secondary) }
                        ForEach(mine.items) { item in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.title)
                                    Text("\(Labels.attendance(item.status)) · \(Formatters.dateTime(item.startsAt))").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text("\(Int(item.points))").bold().monospacedDigit()
                            }
                            .accessibilityElement(children: .combine)
                        }
                        if mine.hasMore {
                            Button("Цааш үзэх") { Task { await moreMine() } }.disabled(busy).frame(minHeight: Theme.minTap)
                        }
                    }
                    Section("Онооны түүх") {
                        if points.entries.isEmpty { Text("Онооны өөрчлөлт алга.").foregroundStyle(.secondary) }
                        ForEach(points.entries) { entry in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(entry.title)
                                    Text("\(Labels.pointReason(entry.reason)) · \(Formatters.dateTime(entry.createdAt))").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text("\(entry.delta > 0 ? "+" : "")\(Int(entry.delta))").bold().monospacedDigit()
                            }
                            .accessibilityElement(children: .combine)
                        }
                        if points.hasMore {
                            Button("Цааш үзэх") { Task { await morePoints() } }.disabled(busy).frame(minHeight: Theme.minTap)
                        }
                    }
                }
                .refreshable { await load() }
            } else if let error {
                ErrorStateView(error: error) { Task { await load() } }
            } else {
                SkeletonList()
            }
        }
        .navigationTitle("Ирц ба оноо")
        .navigationBarTitleDisplayMode(.inline)
        .task { if mine == nil { await load() } }
        .offlineBanner()
    }

    private func load() async {
        do {
            async let m = app.api.myEvents()
            async let p = app.api.points()
            (mine, points) = try await (m, p)
            error = nil
        } catch { self.error = APIError.wrap(error) }
    }

    private func moreMine() async {
        guard let current = mine else { return }
        busy = true; defer { busy = false }
        if var next = try? await app.api.myEvents(offset: current.nextOffset ?? current.items.count) {
            next.items = current.items + next.items
            mine = next
        }
    }

    private func morePoints() async {
        guard let current = points else { return }
        busy = true; defer { busy = false }
        if var next = try? await app.api.points(offset: current.nextOffset ?? current.entries.count) {
            next.entries = current.entries + next.entries
            points = next
        }
    }
}

struct LeaderboardView: View {
    @EnvironmentObject var app: AppModel
    @State private var period = "month"
    @State private var data: Leaderboard?
    @State private var error: APIError?

    var body: some View {
        List {
            Section {
                Picker("Хугацаа", selection: $period) {
                    Text("Энэ сар").tag("month")
                    Text("Энэ жил").tag("year")
                    Text("Бүх цаг").tag("all")
                }
                .pickerStyle(.segmented)
            } footer: {
                Text("Ирц, батлагдсан ажил үүрэг, зурсан саналаар цуглуулсан оноо. Зөвхөн өөрийн салбарын гишүүд.")
            }
            if let data {
                Section("Таны байр") {
                    if let me = data.me {
                        HStack(spacing: 14) {
                            Image(systemName: "rosette").font(.title).foregroundStyle(Theme.accent).accessibilityHidden(true)
                            VStack(alignment: .leading) {
                                Text("\(me.rank)-р байр · \(Int(me.points)) оноо").font(.title3.bold()).monospacedDigit()
                                counts(me)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    } else {
                        Text("Та энэ хугацаанд оноо цуглуулаагүй байна.").foregroundStyle(.secondary)
                    }
                }
                Section("Тэргүүлэгчид") {
                    if data.standings.isEmpty {
                        Text("Энэ хугацаанд оноо цуглуулсан гишүүн алга.").foregroundStyle(.secondary)
                    }
                    ForEach(data.standings) { s in
                        let mine = s.userId == data.me?.userId
                        HStack(spacing: 12) {
                            HStack(spacing: 2) {
                                Text("\(s.rank)")
                                    .font(.headline).monospacedDigit()
                                    .foregroundStyle(s.rank <= 3 ? Color.primary : Color.secondary)
                                if s.rank <= 3 {
                                    Image(systemName: "medal.fill")
                                        .font(.caption)
                                        .foregroundStyle(s.rank == 1 ? Color.yellow : s.rank == 2 ? Color.gray : Color.brown)
                                        .accessibilityHidden(true)
                                }
                            }
                            .frame(width: 44, alignment: .leading)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(s.name.isEmpty ? "—" : s.name + (mine ? " (та)" : ""))
                                    .font(mine ? .body.bold() : .body)
                                    .foregroundStyle(mine ? Theme.accent : .primary)
                                counts(s)
                            }
                            Spacer()
                            Text("\(Int(s.points))").font(.headline).monospacedDigit()
                        }
                        .listRowBackground(mine ? Theme.accent.opacity(0.08) : nil)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("\(s.rank)-р байр, \(s.name), \(Int(s.points)) оноо\(mine ? ", та" : "")")
                    }
                }
            } else if let error {
                Section { ErrorStateView(error: error) { Task { await load() } } }
            } else {
                Section { ForEach(0..<5, id: \.self) { _ in Text("Гишүүний нэр — 100").redacted(reason: .placeholder) } }
            }
        }
        .navigationTitle("Тэргүүлэгчид")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: period) { await load() }
        .refreshable { await load() }
        .offlineBanner()
    }

    private func counts(_ s: Standing) -> some View {
        Text("Ирц \(Int(s.attended)) · Ажил \(Int(s.tasks)) · Санал \(Int(s.votes))")
            .font(.caption).foregroundStyle(.secondary).monospacedDigit()
    }

    private func load() async {
        do { data = try await app.api.leaderboard(period: period); error = nil }
        catch { data = nil; self.error = APIError.wrap(error) }
    }
}

struct PersonalHistoryView: View {
    @EnvironmentObject var app: AppModel
    @State private var events: PersonalParticipationHistory?
    @State private var dues: PersonalDuesHistory?
    @State private var error: APIError?

    var body: some View {
        Group {
            if let events, let dues {
                List {
                    Section {
                        Text("Өмнөх болон одоогийн салбар дахь өөрийн түүхийг энд харна.").font(.footnote).foregroundStyle(.secondary)
                    }
                    Section("Ирц · \(Int(events.totalPoints)) оноо") {
                        if events.items.isEmpty { Text("Бүртгэл алга.").foregroundStyle(.secondary) }
                        ForEach(events.items) { e in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.title).font(.subheadline.weight(.medium))
                                Text("\(e.branch) · \(Formatters.dateTime(e.startsAt))").font(.caption).foregroundStyle(.secondary)
                                Text("\(Labels.attendance(e.status)) · \(Int(e.points)) оноо").font(.caption)
                            }
                        }
                    }
                    Section("Хураамж") {
                        if dues.charges.isEmpty { Text("Хураамж алга.").foregroundStyle(.secondary) }
                        ForEach(dues.charges) { c in
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(c.branch) · \(c.period)").font(.subheadline.weight(.medium))
                                Text("Дүн: \(Formatters.money(c.amount)) · Төлсөн: \(Formatters.money(c.paid))").font(.caption).monospacedDigit()
                                Text(c.waived ? "Чөлөөлсөн" : "Үлдэгдэл: \(Formatters.money(c.balance))").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    Section("Төлөлт") {
                        if dues.payments.isEmpty { Text("Төлөлт алга.").foregroundStyle(.secondary) }
                        ForEach(dues.payments) { p in
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(p.branch) · \(Formatters.money(p.amount))").font(.subheadline.weight(.medium)).monospacedDigit()
                                Text("\(Labels.payment(p.status)) · \(Formatters.dateTime(p.createdAt))").font(.caption)
                                if !p.reference.isEmpty { Text(p.reference).font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                    }
                }
                .refreshable { await load() }
            } else if let error {
                ErrorStateView(error: error) { Task { await load() } }
            } else {
                SkeletonList()
            }
        }
        .navigationTitle("Миний түүх")
        .navigationBarTitleDisplayMode(.inline)
        .task { if events == nil { await load() } }
        .offlineBanner()
    }

    private func load() async {
        do {
            async let e = app.api.participationHistory()
            async let d = app.api.duesHistory()
            (events, dues) = try await (e, d)
            error = nil
        } catch { self.error = APIError.wrap(error) }
    }
}
