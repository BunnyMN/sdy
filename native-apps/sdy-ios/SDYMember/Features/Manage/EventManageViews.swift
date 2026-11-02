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
                                Button { Task { await mark(p, "attended") } } label: { Label("Ирсэн", systemImage: "checkmark.circle") }
                                Button { Task { await mark(p, "absent") } } label: { Label("Ирээгүй", systemImage: "xmark.circle") }
                                Button { Task { await mark(p, "registered") } } label: { Label("Бүртгүүлсэн", systemImage: "circle") }
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
        .confirmationDialog("Оролцогч нэмэх", isPresented: $adding, titleVisibility: .visible) {
            ForEach(people.filter { person in !(participants ?? []).contains { $0.userId == person.userId } }.prefix(30)) { person in
                Button(person.name.isEmpty ? person.email : person.name) { Task { await add(person) } }
            }
            Button("Болих", role: .cancel) {}
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

    private func mark(_ p: Participant, _ status: String) async {
        guard status != p.status else { return }
        busy = p.userId; actionError = nil
        defer { busy = nil }
        do {
            // A correction of a recorded attendance needs a reason (the server checks).
            try await app.api.markAttendance(event.id, userID: p.userId, status: status,
                                              note: p.status == "registered" ? "" : "Зохион байгуулагч апп-аар залруулсан")
            Haptics.success()
            await load()
        } catch { actionError = APIError.wrap(error).message; Haptics.error() }
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
                    Image(uiImage: image).interpolation(.none).resizable().scaledToFit()
                        .frame(maxWidth: 300).padding(16).background(.white, in: RoundedRectangle(cornerRadius: 16))
                        .accessibilityLabel("Ирцийн QR код")
                    if let expires {
                        TimelineView(.periodic(from: .now, by: 1)) { context in
                            let left = max(0, Int(expires.timeIntervalSince(context.date)))
                            Text("\(Formatters.clock(left))-ийн дараа шинэчлэгдэнэ").font(.footnote).foregroundStyle(.secondary).monospacedDigit()
                        }
                    }
                    Text("Гишүүд E-sdy апп-ын «Ирц» хэсгээр уншуулна.").font(.footnote).foregroundStyle(.secondary)
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
                    await issue()
                    let wait = max(30, (expires?.timeIntervalSinceNow ?? 60) - 20)
                    try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
                }
            }
        }
    }

    private func issue() async {
        do {
            let code = try await app.api.issueCheckin(event.id)
            var parts = URLComponents(url: AppConfig.webOrigin, resolvingAgainstBaseURL: false)!
            parts.path = "/member/check-in"
            let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
            parts.percentEncodedFragment = "event=\(event.id.addingPercentEncoding(withAllowedCharacters: allowed) ?? event.id)&token=\(code.token.addingPercentEncoding(withAllowedCharacters: allowed) ?? code.token)"
            image = Self.qr(parts.url?.absoluteString ?? "")
            expires = Formatters.parseDate(code.expiresAt) ?? Date().addingTimeInterval(300)
            error = nil
        } catch {
            self.error = APIError.wrap(error).message
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
