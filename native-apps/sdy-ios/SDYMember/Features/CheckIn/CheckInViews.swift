import SwiftUI

/// The "Ирц" tab: scan a QR, then my attendance and points.
struct CheckInTabView: View {
    @EnvironmentObject var app: AppModel
    @State private var scanning = false
    @StateObject private var loader = Loader<(MyEventsPage, PointsPage)> {
        async let mine = APIClient.shared.myEvents()
        async let points = APIClient.shared.points()
        return (try await mine, try await points)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button { scanning = true } label: {
                        HStack(spacing: 14) {
                            Image(systemName: "qrcode.viewfinder").font(.system(size: 34))
                            VStack(alignment: .leading, spacing: 2) {
                                Text("QR уншуулж ирцээ батлах").font(.headline)
                                Text("Арга хэмжээн дээр зохион байгуулагчийн QR-ийг уншуулна").font(.caption)
                                    .opacity(0.85)
                            }
                            Spacer()
                        }
                        .foregroundStyle(.white)
                        .padding(.vertical, 12)
                        .frame(minHeight: 64)
                    }
                    .listRowBackground(Theme.brandRed)
                    .disabled(app.isOffline)
                    if app.isOffline {
                        Text("Ирц батлахад интернэт холболт шаардлагатай.").font(.footnote).foregroundStyle(.secondary)
                    }
                }

                if let value = loader.value {
                    let (mine, points) = value
                    Section {
                        VStack(alignment: .leading) {
                            Text("Нийт оноо").font(.caption).foregroundStyle(.secondary)
                            Text("\(Int(points.total))").font(.system(size: 36, weight: .bold, design: .rounded)).monospacedDigit()
                        }
                        .accessibilityElement(children: .combine)
                        NavigationLink(value: HomeRoute.leaderboard) {
                            Label("Тэргүүлэгчид", systemImage: "trophy").frame(minHeight: Theme.minTap)
                        }
                    }
                    Section("Миний ирц") {
                        if mine.items.isEmpty {
                            Text("Одоогоор оролцооны бүртгэл алга. Арга хэмжээнд бүртгүүлж, QR-ээр ирцээ батлаарай.")
                                .foregroundStyle(.secondary)
                        }
                        ForEach(mine.items) { item in
                            Button { app.openEvent(item.eventId) } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.title).foregroundStyle(.primary)
                                        Text(Formatters.dateTime(item.startsAt)).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 4) {
                                        StatusChip.attendance(item.status)
                                        if item.points > 0 { Text("+\(Int(item.points))").font(.caption.bold()).monospacedDigit() }
                                    }
                                }
                                .frame(minHeight: Theme.minTap)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    if !points.entries.isEmpty {
                        Section("Онооны түүх") {
                            ForEach(points.entries.prefix(10)) { entry in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(entry.title)
                                        Text("\(Labels.pointReason(entry.reason)) · \(Formatters.dateTime(entry.createdAt))")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Text("\(entry.delta > 0 ? "+" : "")\(Int(entry.delta))").bold().monospacedDigit()
                                }
                            }
                            NavigationLink("Бүх түүх", value: HomeRoute.participation)
                        }
                    }
                } else if let error = loader.error {
                    Section { ErrorStateView(error: error) { Task { await loader.load() } } }
                } else {
                    Section { ForEach(0..<3, id: \.self) { _ in Text("Арга хэмжээний нэр").redacted(reason: .placeholder) } }
                }
            }
            .listStyle(.insetGrouped)
        .silkListBackground()
            .navigationTitle("Ирц")
            .navigationDestination(for: HomeRoute.self) { $0.destination }
            .refreshable { await loader.load() }
            .offlineBanner()
            .task { await loader.loadIfNeeded() }
            .onChange(of: app.pendingCheckin) { _, code in if code == nil { Task { await loader.load() } } }
            .fullScreenCover(isPresented: $scanning) {
                QRScannerScreen { code in app.pendingCheckin = code }
            }
        }
    }
}

/// "Би ирсэн — батлах": confirm one scanned check-in code.
struct CheckInConfirmView: View {
    let code: CheckinCode
    @EnvironmentObject var app: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var event: EventRecord?
    @State private var error: APIError?
    @State private var wrongBranch = false
    @State private var tenants: [Tenant] = []
    @State private var busy = false
    @State private var actionError: String?
    @State private var done: ActionResult?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    if let done {
                        success(done)
                    } else if wrongBranch {
                        branchMismatch
                    } else if let event {
                        confirm(event)
                    } else if let error {
                        ErrorStateView(error: error) { Task { await load() } }
                    } else {
                        ProgressView("Арга хэмжээг шалгаж байна…").padding(.top, 60)
                    }
                }
                .padding(24)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("Ирцээ бүртгүүлэх")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(done == nil ? "Болих" : "Хаах") { close() } }
            }
            .task { await load() }
        }
        .presentationDetents([.large])
    }

    private func confirm(_ event: EventRecord) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "person.badge.clock.fill").font(.system(size: 52)).foregroundStyle(Theme.accent)
                .accessibilityHidden(true)
            Text(event.title).font(.title2.bold()).multilineTextAlignment(.center)
            VStack(spacing: 6) {
                if !event.location.isEmpty { Label(event.location, systemImage: "mappin.and.ellipse") }
                Label(Formatters.dateTime(event.startsAt), systemImage: "clock")
                if let points = event.pointsValue, points > 0 { Label("Ирцийн оноо: \(Int(points))", systemImage: "star") }
            }
            .font(.subheadline).foregroundStyle(.secondary)
            if event.myStatus == "attended" {
                NoticeView(text: "Таны ирц аль хэдийн баталгаажсан байна.", kind: .success)
            }
            if event.myStatus.isEmpty {
                Text("Та энэ арга хэмжээнд бүртгүүлээгүй байна. Батлахад эхлээд автоматаар бүртгэнэ.")
                    .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            if let actionError { NoticeView(text: actionError, kind: .error) }
            Button {
                Task { await submit(event) }
            } label: {
                HStack { if busy { ProgressView().tint(.white) }; Text("Би ирсэн — батлах").bold() }
                    .frame(maxWidth: .infinity, minHeight: 52)
            }
            .buttonStyle(.borderedProminent)
            .disabled(busy || event.myStatus == "attended" || app.isOffline)
        }
    }

    private func success(_ result: ActionResult) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.seal.fill").font(.system(size: 64)).foregroundStyle(.green)
                .accessibilityHidden(true)
            Text("Таны ирц баталгаажлаа.").font(.title2.bold())
            if let event { Text(event.title).foregroundStyle(.secondary).multilineTextAlignment(.center) }
            if let points = result.points ?? event?.pointsValue, points > 0 {
                Text("+\(Int(points)) оноо").font(.system(size: 34, weight: .bold, design: .rounded)).foregroundStyle(Theme.accent)
            }
            Button("Болсон") { close() }
                .buttonStyle(.borderedProminent)
                .frame(minHeight: Theme.minTap)
        }
        .padding(.top, 24)
    }

    private var branchMismatch: some View {
        VStack(spacing: 14) {
            Image(systemName: "building.2.crop.circle").font(.system(size: 52)).foregroundStyle(.orange)
                .accessibilityHidden(true)
            Text("Энэ арга хэмжээ өөр салбарынх байна").font(.title3.bold()).multilineTextAlignment(.center)
            Text("Та одоо «\(app.me?.tenantName ?? "")» салбарт идэвхтэй байна. QR-ийн арга хэмжээ таны идэвхтэй салбарт олдсонгүй. Арга хэмжээ зохиож буй салбар руу шилжээд дахин оролдоно уу.")
                .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            if let actionError { NoticeView(text: actionError, kind: .error) }
            let others = tenants.filter { $0.id != app.me?.tenantId }
            if others.isEmpty {
                Text("Танд шилжих өөр салбар алга. Зохион байгуулагчид хандана уу.").font(.footnote)
            }
            ForEach(others) { tenant in
                Button {
                    Task { await switchAndRetry(tenant) }
                } label: {
                    Label("«\(tenant.name)» руу шилжих", systemImage: "arrow.left.arrow.right")
                        .frame(maxWidth: .infinity, minHeight: Theme.minTap)
                }
                .buttonStyle(.bordered)
                .disabled(busy)
            }
        }
    }

    private func load() async {
        error = nil; wrongBranch = false
        do {
            event = try await app.api.event(code.eventId)
        } catch {
            let e = APIError.wrap(error)
            if e.status == 404 || e.status == 403 {
                wrongBranch = true
                tenants = (try? await app.api.tenants().tenants) ?? []
            } else {
                self.error = e
            }
        }
    }

    private func submit(_ event: EventRecord) async {
        busy = true; actionError = nil
        defer { busy = false }
        do {
            if event.myStatus.isEmpty { _ = try await app.api.register(code.eventId) }
            let result = try await app.api.checkIn(code.eventId, token: code.token)
            Haptics.success()
            done = result
        } catch {
            Haptics.error()
            actionError = APIError.wrap(error).message
        }
    }

    private func switchAndRetry(_ tenant: Tenant) async {
        busy = true; actionError = nil
        defer { busy = false }
        do {
            try await app.switchBranch(to: tenant.id)
            await load()
            if wrongBranch { actionError = "Энэ салбарт ч арга хэмжээ олдсонгүй." }
        } catch {
            actionError = APIError.wrap(error).message
        }
    }

    private func close() {
        app.pendingCheckin = nil
        dismiss()
    }
}
