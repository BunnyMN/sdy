import SwiftUI

/// Гишүүд ба албан тушаал: the branch chair assigns positions (an
/// administrator names the chair), within the control committee's seats.
/// The server checks every rule; this screen offers only what the policy allows.
struct MembersAdminView: View {
    @EnvironmentObject var app: AppModel
    @State private var members: ManagedMembers?
    @State private var policy: PositionPolicy?
    @State private var error: APIError?
    @State private var actionError: String?
    @State private var notice: String?
    @State private var search = ""
    @State private var busy: String?

    static let positions = ["chair", "vice_chair", "secretary", "finance", "auditor", "board", "member"]

    var body: some View {
        List {
            if let policy {
                Section {
                    Text("Тэргүүн, Дэд тэргүүн, Нарийн бичиг арга хэмжээ үүсгэж, ирц ба оноог батална. Санхүүч хураамж, төлбөрийг хариуцна. Хяналтын хороо оноо хасаж, сануулга өгнө.")
                        .font(.footnote).foregroundStyle(.secondary)
                    LabeledContent("Хяналтын хороо", value: "\(Int(policy.auditors))/\(Int(policy.auditorSeats)) суудал")
                    if !policy.canAssign {
                        Text("Албан тушаалыг салбарын Тэргүүн онооно.").font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }
            if let notice { Section { NoticeView(text: notice, kind: .success) } }
            if let actionError { Section { NoticeView(text: actionError, kind: .error) } }
            if let members {
                Section {
                    if members.members.isEmpty { Text("Гишүүн олдсонгүй.").foregroundStyle(.secondary) }
                    ForEach(members.members) { member in row(member) }
                    if members.hasMore {
                        Button("Цааш үзэх") { Task { await more() } }.disabled(busy != nil)
                    }
                }
            } else if let error {
                Section { ErrorStateView(error: error) { Task { await load() } } }
            } else {
                Section { ProgressView() }
            }
        }
        .navigationTitle("Гишүүд ба албан тушаал")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Нэр, имэйлээр хайх")
        .onSubmit(of: .search) { Task { await load() } }
        .task { await load() }
        .refreshable { await load() }
        .offlineBanner()
    }

    @ViewBuilder
    private func row(_ member: ManagedMember) -> some View {
        let editable = (policy?.canAssign ?? false) && member.userId != app.me?.id
            && (policy?.canAssignChair == true || member.positionValue != "chair")
        VStack(alignment: .leading, spacing: 6) {
            Text(member.name.isEmpty ? member.email : member.name).font(.headline)
            Text(Labels.membershipStatus(member.status)).font(.caption).foregroundStyle(.secondary)
            if editable {
                Picker("Албан тушаал", selection: Binding(
                    get: { member.positionValue },
                    set: { new in Task { await assign(member, new) } })) {
                    ForEach(Self.positions, id: \.self) { code in
                        Text(Labels.position(code) ?? code).tag(code)
                            .selectionDisabled(code == "chair" && policy?.canAssignChair != true)
                    }
                }
                .disabled(busy != nil || app.isOffline)
            } else {
                LabeledContent("Албан тушаал", value: Labels.position(member.positionValue) ?? "—")
                    .font(.subheadline)
            }
        }
        .padding(.vertical, 4)
        .overlay(alignment: .topTrailing) { if busy == member.userId { ProgressView() } }
    }

    private func load() async {
        do {
            async let list = app.api.managedMembers(query: search.trimmingCharacters(in: .whitespaces))
            async let rules = app.api.positionPolicy()
            (members, policy) = try await (list, rules)
            error = nil
        } catch {
            self.error = APIError.wrap(error)
        }
    }

    private func more() async {
        guard let members, let next = members.nextOffset else { return }
        busy = "more"; defer { busy = nil }
        do {
            var page = try await app.api.managedMembers(query: search, offset: next)
            page.members = members.members + page.members
            self.members = page
        } catch { actionError = APIError.wrap(error).message }
    }

    private func assign(_ member: ManagedMember, _ position: String) async {
        guard position != member.positionValue else { return }
        busy = member.userId; actionError = nil; notice = nil
        defer { busy = nil }
        do {
            try await app.api.setPosition(member.userId, position: position)
            notice = "\(member.name): \(Labels.position(position) ?? position)"
            Haptics.success()
            await load()
        } catch {
            actionError = Self.message(APIError.wrap(error))
        }
    }

    /// The database's refusals, said in Mongolian.
    static func message(_ error: APIError) -> String {
        switch error.serverMessage {
        case "position_chair_required": return "Албан тушаалыг зөвхөн салбарын Тэргүүн оноох боломжтой."
        case "position_chair_admin_only": return "Тэргүүнийг зөвхөн админ томилж, чөлөөлнө."
        case "position_chair_taken": return "Энэ салбарт Тэргүүн аль хэдийн томилогдсон байна."
        case "position_needs_active_member": return "Албан тушаалыг зөвхөн идэвхтэй гишүүнд оноох боломжтой."
        case "auditor_seats_full": return "Хяналтын хорооны суудал дүүрсэн байна."
        case "membership_self_decision_forbidden": return "Өөрийнхөө талаар шийдвэр гаргах боломжгүй."
        default: return error.message
        }
    }
}
