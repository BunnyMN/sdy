import CoreImage.CIFilterBuiltins
import SwiftUI

/// Creates or edits an event (Тэргүүн, Дэд тэргүүн, Нарийн бичиг — events.manage).
/// Points cannot change once attendance is recorded; the server says so.
struct EventEditorView: View {
    let event: EventRecord?
    let onSaved: (EventRecord) -> Void
    @EnvironmentObject var app: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var draft: EventDraft
    @State private var busy = false
    @State private var error: String?

    init(event: EventRecord? = nil, onSaved: @escaping (EventRecord) -> Void) {
        self.event = event
        self.onSaved = onSaved
        _draft = State(initialValue: event.map(EventDraft.init) ?? EventDraft())
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error { Section { NoticeView(text: error, kind: .error) } }
                Section {
                    TextField("Нэр", text: $draft.title)
                    TextField("Тайлбар", text: $draft.description, axis: .vertical).lineLimit(3...8)
                    TextField("Байршил", text: $draft.location)
                }
                Section("Хугацаа") {
                    DatePicker("Эхлэх", selection: $draft.startsAt)
                    Toggle("Дуусах цагтай", isOn: $draft.hasEnd)
                    if draft.hasEnd { DatePicker("Дуусах", selection: $draft.endsAt, in: draft.startsAt...) }
                }
                Section {
                    TextField("Хүний тоо (хоосон бол хязгааргүй)", text: $draft.capacity).keyboardType(.numberPad)
                    LabeledContent("Ирцийн оноо") {
                        TextField("0", text: $draft.pointsValue).keyboardType(.numberPad).multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Санал бүрийн оноо") {
                        TextField("0", text: $draft.votePoints).keyboardType(.numberPad).multilineTextAlignment(.trailing)
                    }
                } footer: {
                    Text("Ирц баталгаажмагц гишүүнд ирцийн оноо орно. Ирц бүртгэгдсэний дараа оноог өөрчлөх боломжгүй.")
                }
                if event != nil {
                    Section {
                        Picker("Төлөв", selection: $draft.status) {
                            Text("Төлөвлөсөн").tag("planned")
                            Text("Болсон").tag("done")
                            Text("Цуцалсан").tag("cancelled")
                        }
                    }
                }
            }
            // Times are Ulaanbaatar's, wherever the organiser's phone is set.
            .environment(\.timeZone, Formatters.timeZone)
            .navigationTitle(event == nil ? "Шинэ арга хэмжээ" : "Засах")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Болих") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Хадгалах") { Task { await save() } }.disabled(busy || !draft.isValid || app.isOffline)
                }
            }
            .interactiveDismissDisabled(busy)
        }
    }

    private func save() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            let saved: EventRecord
            if let event {
                saved = try await app.api.updateEvent(event.id, draft)
            } else {
                saved = try await app.api.createEvent(draft)
            }
            Haptics.success()
            onSaved(saved)
            dismiss()
        } catch {
            self.error = APIError.wrap(error).message
            Haptics.error()
        }
    }
}

/// Ирц батлах: the organiser marks who came — which awards the event's
/// points — or did not, and adds somebody who is not on the list.
struct AttendanceManageView: View {
    let event: EventRecord
    @EnvironmentObject var app: AppModel
    @State private var participants: [Participant]?
    @State private var people: [BranchPerson] = []
    @State private var error: APIError?
    @State private var actionError: String?
    @State private var busy: String?
    @State private var adding = false
    /// A recorded attendance being changed: the server needs a reason.
    @State private var correcting: Correction?

    struct Correction: Identifiable {
        let participant: Participant
        let status: String
        var id: String { participant.userId + status }
    }

    var body: some View {
        List {
            Section {
                Text("«Ирсэн» гэж баталгаажуулахад \(Int(event.pointsValue ?? 0)) оноо орно; буцаавал хасагдана.")
                    .font(.footnote).foregroundStyle(.secondary)
                Button { adding = true } label: { Label("Оролцогч нэмэх", systemImage: "person.badge.plus") }
                    .disabled(people.isEmpty || app.isOffline)
            }
            if let actionError { Section { NoticeView(text: actionError, kind: .error) } }
            if let participants {
                Section("Оролцогчид (\(participants.count))") {
                    if participants.isEmpty { Text("Одоогоор бүртгүүлсэн хүн алга.").foregroundStyle(.secondary) }
                    ForEach(participants) { p in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(p.name.isEmpty ? p.email : p.name)
                                Text(Labels.attendance(p.status)).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if busy == p.userId { ProgressView() }
                            Menu {
                                Button { choose(p, "attended") } label: { Label("Ирсэн", systemImage: "checkmark.circle") }
                                    .disabled(p.status == "attended")
                                Button { choose(p, "absent") } label: { Label("Ирээгүй", systemImage: "xmark.circle") }
                                    .disabled(p.status == "absent")
                                Button { choose(p, "registered") } label: { Label("Бүртгүүлсэн", systemImage: "circle") }
                                    .disabled(p.status == "registered")
                            } label: {
                                Image(systemName: "ellipsis.circle").font(.title3).frame(width: Theme.minTap, height: Theme.minTap)
                            }
                            .disabled(busy != nil || app.isOffline)
                            .accessibilityLabel("\(p.name): ирц өөрчлөх")
                        }
                    }
                }
            } else if let error {
                Section { ErrorStateView(error: error) { Task { await load() } } }
            } else {
                Section { ProgressView() }
            }
        }
        .navigationTitle("Ирц батлах")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $adding) {
            PersonPicker(people: people.filter { person in !(participants ?? []).contains { $0.userId == person.userId } }) { person in
                Task { await add(person) }
            }
        }
        .sheet(item: $correcting) { c in
            ReasonSheet(title: "\(c.participant.name.isEmpty ? c.participant.email : c.participant.name): \(Labels.attendance(c.participant.status)) → \(Labels.attendance(c.status))",
                        action: "Залруулах", destructive: c.status != "attended") { reason in
                await mark(c.participant, c.status, note: reason)
            }
        }
        .offlineBanner()
    }

    private func load() async {
        do {
            async let list = app.api.participants(event.id)
            async let branch = app.api.branchPeople()
            let (l, b) = try await (list, branch)
            participants = l.participants
            people = b.members.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
            error = nil
        } catch { self.error = APIError.wrap(error) }
    }

    /// First marks go straight through; a change to a recorded attendance
    /// (which moves points) asks for the reason the server keeps.
    private func choose(_ p: Participant, _ status: String) {
        guard status != p.status else { return }
        if p.status == "registered" {
            Task { await mark(p, status, note: "") }
        } else {
            correcting = Correction(participant: p, status: status)
        }
    }

    @discardableResult
    private func mark(_ p: Participant, _ status: String, note: String) async -> Bool {
        busy = p.userId; actionError = nil
        defer { busy = nil }
        do {
            try await app.api.markAttendance(event.id, userID: p.userId, status: status, note: note)
            Haptics.success()
            await load()
            return true
        } catch {
            actionError = APIError.wrap(error).message
            Haptics.error()
            await load()
            return false
        }
    }

    private func add(_ person: BranchPerson) async {
        busy = person.userId; actionError = nil
        defer { busy = nil }
        do {
            try await app.api.addParticipant(event.id, userID: person.userId)
            await load()
        } catch { actionError = APIError.wrap(error).message }
    }
}

/// Ирцийн QR: the code members scan at the event. It lasts five minutes and
/// is renewed before it runs out while the screen is open.
struct CheckinQRView: View {
    let event: EventRecord
    @EnvironmentObject var app: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var image: UIImage?
    @State private var expires: Date?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text(event.title).font(.title3.bold()).multilineTextAlignment(.center)
                if let image {
                    // A code past its time is never left on screen to be scanned.
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        let left = expires.map { max(0, Int($0.timeIntervalSince(context.date))) } ?? 0
                        VStack(spacing: 12) {
                            Image(uiImage: image).interpolation(.none).resizable().scaledToFit()
                                .frame(maxWidth: 300).padding(16).background(.white, in: RoundedRectangle(cornerRadius: 16))
                                .blur(radius: left == 0 ? 12 : 0)
                                .overlay { if left == 0 { ProgressView().controlSize(.large) } }
                                .accessibilityLabel(left == 0 ? "QR кодын хугацаа дууссан" : "Ирцийн QR код")
                            if left == 0 {
                                Text("Хугацаа дууссан — шинэ код гаргаж байна…").font(.footnote).foregroundStyle(.orange)
                            } else {
                                Text("\(Formatters.clock(left))-ийн дараа шинэчлэгдэнэ").font(.footnote).foregroundStyle(.secondary).monospacedDigit()
                            }
                        }
                    }
                    if let error { NoticeView(text: error, kind: .error) }
                    Text("Гишүүд E-sdy апп-ын «Ирц» хэсгээр уншуулна. Шинэ код гаргахад өмнөх код хүчингүй болно — нэг арга хэмжээнд нэг л төхөөрөмжөөр QR харуулна уу.")
                        .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                } else if let error {
                    NoticeView(text: error, kind: .error)
                    Button("Дахин") { Task { await issue() } }.buttonStyle(.bordered)
                } else {
                    ProgressView()
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("Ирцийн QR")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Хаах") { dismiss() } } }
            .task {
                while !Task.isCancelled {
                    let ok = await issue()
                    // After a failure try again soon; the expired code is hidden meanwhile.
                    let wait = ok ? max(30, (expires?.timeIntervalSinceNow ?? 60) - 20) : 10
                    try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
                }
            }
            // Members walk up to scan: the screen must not go dark under them.
            .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
            .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        }
    }

    @discardableResult
    private func issue() async -> Bool {
        do {
            let code = try await app.api.issueCheckin(event.id)
            var parts = URLComponents(url: AppConfig.webOrigin, resolvingAgainstBaseURL: false)!
            parts.path = "/member/check-in"
            let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
            parts.percentEncodedFragment = "event=\(event.id.addingPercentEncoding(withAllowedCharacters: allowed) ?? event.id)&token=\(code.token.addingPercentEncoding(withAllowedCharacters: allowed) ?? code.token)"
            image = Self.qr(parts.url?.absoluteString ?? "")
            expires = Formatters.parseDate(code.expiresAt) ?? Date().addingTimeInterval(300)
            error = nil
            return true
        } catch {
            self.error = APIError.wrap(error).message
            return false
        }
    }

    static func qr(_ text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)),
              let cg = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// Somebody of the branch to add to an event's list, found by name or e-mail.
struct PersonPicker: View {
    let people: [BranchPerson]
    let onPick: (BranchPerson) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    static func filter(_ people: [BranchPerson], _ query: String) -> [BranchPerson] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return people }
        return people.filter { $0.name.localizedCaseInsensitiveContains(q) || $0.email.localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        NavigationStack {
            let shown = Self.filter(people, query)
            List {
                if shown.isEmpty {
                    Text(people.isEmpty ? "Нэмэх гишүүн алга." : "Олдсонгүй.").foregroundStyle(.secondary)
                }
                ForEach(shown) { person in
                    Button {
                        onPick(person)
                        dismiss()
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(person.name.isEmpty ? person.email : person.name).foregroundStyle(.primary)
                            if !person.name.isEmpty, !person.email.isEmpty {
                                Text(person.email).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: Theme.minTap, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Нэр, имэйлээр хайх")
            .navigationTitle("Оролцогч нэмэх")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Болих") { dismiss() } } }
        }
    }
}
