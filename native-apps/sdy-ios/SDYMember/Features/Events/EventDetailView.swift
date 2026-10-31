import SwiftUI

struct EventDetailView: View {
    let eventID: String
    @EnvironmentObject var app: AppModel
    @StateObject private var loader: Loader<EventRecord>
    @StateObject private var discussion: DiscussionModel
    @StateObject private var tasks: TasksModel
    @State private var busy = false
    @State private var notice: NoticeView?
    @State private var confirmWithdraw = false
    @State private var participants: [Participant]?
    @State private var participantsError: String?
    @State private var showParticipants = false

    init(eventID: String) {
        self.eventID = eventID
        _loader = StateObject(wrappedValue: Loader { try await APIClient.shared.event(eventID) })
        _discussion = StateObject(wrappedValue: DiscussionModel(eventID: eventID))
        _tasks = StateObject(wrappedValue: TasksModel(eventID: eventID))
    }

    var body: some View {
        LoadingView(loader: loader, skeletonRows: 4) { event in content(event) }
            .navigationTitle(loader.value?.title ?? "Арга хэмжээ")
            .navigationBarTitleDisplayMode(.inline)
            .offlineBanner()
            .task {
                await loader.loadIfNeeded()
                await discussion.load()
                await tasks.load()
            }
            .onChange(of: app.resumeTick) { _, _ in discussion.resume() }
            .confirmationDialog("Бүртгэлээ цуцлах уу?", isPresented: $confirmWithdraw, titleVisibility: .visible) {
                Button("Бүртгэл цуцлах", role: .destructive) { Task { await withdraw() } }
                Button("Буцах", role: .cancel) {}
            } message: {
                Text("Дахин бүртгүүлэхэд суудал үлдсэн байх шаардлагатай.")
            }
            .sheet(item: $discussion.signing) { _ in
                VoteSigningSheet(model: discussion)
                    .interactiveDismissDisabled(discussion.signing?.phase == .waiting)
            }
    }

    @ViewBuilder
    private func content(_ event: EventRecord) -> some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 6) {
                        StatusChip.eventStatus(event.status)
                        if let chip = StatusChip.attendance(event.myStatus) { chip }
                        if event.isFull && event.isOpen { StatusChip(text: "Хүний тоо дүүрсэн", systemImage: "person.fill.xmark", tone: .danger) }
                    }
                    Text(event.title).font(.title2.bold())
                    if !event.description.isEmpty {
                        Text(event.description).font(.body)
                    }
                }
                .padding(.vertical, 4)
                LabeledContent {
                    Text(event.endsAt.map { "\(Formatters.dateTime(event.startsAt)) – \(Formatters.dateTime($0))" } ?? Formatters.dateTime(event.startsAt))
                        .multilineTextAlignment(.trailing)
                } label: { Label("Хэзээ", systemImage: "clock") }
                if !event.location.isEmpty {
                    LabeledContent { Text(event.location).multilineTextAlignment(.trailing) } label: { Label("Хаана", systemImage: "mappin.and.ellipse") }
                }
                LabeledContent { Text(event.capacityText).monospacedDigit() } label: { Label("Оролцогч", systemImage: "person.2") }
                if let points = event.pointsValue, points > 0 {
                    LabeledContent { Text(Formatters.points(points)) } label: { Label("Ирцийн оноо", systemImage: "star") }
                }
            }

            registrationSection(event)

            if !event.myStatus.isEmpty {
                DiscussionSection(model: discussion)
                TasksSection(model: tasks, closed: !event.isOpen)
            } else {
                TasksSection(model: tasks, closed: !event.isOpen)
                DiscussionSection(model: discussion)
            }

            Section {
                DisclosureGroup(isExpanded: $showParticipants) {
                    if let participants {
                        if participants.isEmpty {
                            Text("Одоогоор бүртгүүлсэн хүн алга.").foregroundStyle(.secondary)
                        }
                        ForEach(participants) { p in
                            HStack {
                                Text(p.name.isEmpty ? "—" : p.name)
                                Spacer()
                                Text(Labels.attendance(p.status)).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    } else if let participantsError {
                        Text(participantsError).font(.footnote).foregroundStyle(.secondary)
                    } else {
                        ProgressView()
                    }
                } label: {
                    Label("Оролцогчид (\(event.registeredCount))", systemImage: "person.3")
                }
                .onChange(of: showParticipants) { _, open in
                    if open && participants == nil { Task { await loadParticipants() } }
                }
            }
        }
        .listStyle(.insetGrouped)
        .silkListBackground()
        .refreshable {
            await loader.load()
            await discussion.load()
            await tasks.load()
        }
    }

    @ViewBuilder
    private func registrationSection(_ event: EventRecord) -> some View {
        Section {
            if let notice { notice }
            if event.myStatus == "registered" {
                Label("Та бүртгүүлсэн байна. Арга хэмжээн дээр QR уншуулж ирцээ батлаарай.", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                if event.isOpen {
                    Button("Бүртгэл цуцлах", role: .destructive) { confirmWithdraw = true }
                        .frame(minHeight: Theme.minTap)
                        .disabled(busy || app.isOffline)
                }
            } else if event.myStatus == "attended" {
                Label("Таны ирц баталгаажсан.", systemImage: "checkmark.seal.fill").foregroundStyle(.green)
            } else if event.myStatus == "absent" {
                Label("Ирээгүй гэж тэмдэглэгдсэн.", systemImage: "xmark.circle").foregroundStyle(.orange)
            } else if event.isOpen && !event.isFull {
                Button {
                    Task { await register() }
                } label: {
                    HStack { Spacer(); if busy { ProgressView().tint(.white) } else { Label("Бүртгүүлэх", systemImage: "plus.circle.fill").bold() }; Spacer() }
                        .frame(minHeight: 48)
                }
                .buttonStyle(.borderedProminent)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .disabled(busy || app.isOffline)
            } else if event.isFull {
                Label("Хүний тоо дүүрсэн тул бүртгэл хаагдсан.", systemImage: "person.fill.xmark").foregroundStyle(.secondary)
            } else {
                Label("Бүртгэл хаагдсан.", systemImage: "lock").foregroundStyle(.secondary)
            }
        } header: {
            Text("Миний бүртгэл")
        }
    }

    private func register() async {
        busy = true; notice = nil
        defer { busy = false }
        do {
            _ = try await app.api.register(eventID)
            Haptics.success()
            notice = NoticeView(text: "Бүртгэл амжилттай.", kind: .success)
            await loader.load()
        } catch {
            notice = NoticeView(text: APIError.wrap(error).message, kind: .error)
            Haptics.error()
        }
    }

    private func withdraw() async {
        busy = true; notice = nil
        defer { busy = false }
        do {
            _ = try await app.api.withdraw(eventID)
            notice = NoticeView(text: "Бүртгэл цуцлагдлаа.", kind: .info)
            await loader.load()
        } catch {
            notice = NoticeView(text: APIError.wrap(error).message, kind: .error)
        }
    }

    private func loadParticipants() async {
        do {
            participants = try await app.api.participants(eventID).participants
        } catch {
            let e = APIError.wrap(error)
            participantsError = e.status == 403 ? "Оролцогчдын жагсаалтыг зөвхөн зохион байгуулагч харна." : e.message
        }
    }
}
