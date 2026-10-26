import SwiftUI

@MainActor
final class TasksModel: ObservableObject {
    let eventID: String
    private let api: APIClient
    @Published var data: TasksResponse?
    @Published var error: String?
    @Published var busy = false

    init(eventID: String, api: APIClient = .shared) {
        self.eventID = eventID
        self.api = api
    }

    func load() async {
        do { data = try await api.tasks(eventID); error = nil }
        catch { if data == nil { self.error = APIError.wrap(error).message } }
    }

    func act(_ run: @escaping () async throws -> Void) async {
        busy = true; error = nil
        defer { busy = false }
        do {
            try await run()
            Haptics.success()
            await load()
        } catch {
            self.error = APIError.wrap(error).message
            Haptics.error()
        }
    }

    func volunteer(_ task: EventTask) async { await act { [api, eventID] in try await api.volunteer(eventID, task: task.id) } }
    func respond(_ task: EventTask, accept: Bool) async { await act { [api, eventID] in try await api.respond(eventID, task: task.id, accept: accept) } }
}

struct TasksSection: View {
    @ObservedObject var model: TasksModel
    let closed: Bool
    @EnvironmentObject var app: AppModel

    var body: some View {
        Section {
            if let error = model.error { NoticeView(text: error, kind: .error) }
            if let data = model.data {
                if data.tasks.isEmpty {
                    Text("Ажил үүрэг хуваарилаагүй байна.").foregroundStyle(.secondary)
                }
                ForEach(data.tasks) { task in row(task, me: data.me) }
            } else if model.error == nil {
                HStack { ProgressView(); Text("Ачаалж байна…").foregroundStyle(.secondary) }
            }
        } header: {
            Label("Ажил үүрэг", systemImage: "checklist")
        } footer: {
            Text("Гүйцэтгэл батлагдахад тухайн ажлын оноо танд орно.")
        }
    }

    @ViewBuilder
    private func row(_ task: EventTask, me: String) -> some View {
        let mine = task.mine(me)
        VStack(alignment: .leading, spacing: 8) {
            Text(task.title).font(.headline)
            if !task.description.isEmpty { Text(task.description).font(.subheadline).foregroundStyle(.secondary) }
            HStack(spacing: 6) {
                StatusChip(text: "+\(Int(task.points)) оноо", systemImage: "star", tone: .success)
                StatusChip(text: "\(task.taken)/\(task.slots) хүн", systemImage: "person.2", tone: task.isFree ? .info : .neutral)
                if let mine { StatusChip(text: Labels.taskStatus(mine.status), tone: mine.status == "offered" ? .warning : mine.status == "done" ? .success : .accent) }
            }
            if mine?.status == "offered" {
                Text("Танд энэ ажлыг санал болгосон байна.").font(.footnote)
                HStack {
                    Button { Task { await model.respond(task, accept: true) } } label: {
                        Label("Хүлээн авах", systemImage: "checkmark").frame(maxWidth: .infinity, minHeight: 36)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.busy || !task.isFree || app.isOffline)
                    Button { Task { await model.respond(task, accept: false) } } label: {
                        Label("Татгалзах", systemImage: "xmark").frame(maxWidth: .infinity, minHeight: 36)
                    }
                    .buttonStyle(.bordered)
                    .disabled(model.busy || app.isOffline)
                }
            } else if mine?.status == "accepted" {
                Button("Чөлөөлөгдөх") { Task { await model.respond(task, accept: false) } }
                    .buttonStyle(.bordered)
                    .disabled(model.busy || app.isOffline)
            } else if !closed && task.isFree && (mine == nil || mine?.status == "declined") {
                Button { Task { await model.volunteer(task) } } label: {
                    Label("Би хийнэ", systemImage: "hand.raised").frame(minHeight: 36)
                }
                .buttonStyle(.bordered)
                .disabled(model.busy || app.isOffline)
            }
        }
        .padding(.vertical, 6)
    }
}
