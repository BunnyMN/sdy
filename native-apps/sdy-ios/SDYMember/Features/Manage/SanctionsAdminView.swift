import SwiftUI

/// Хяналтын хороо: warn any member of the branch with a reason, perhaps
/// deducting points. Never oneself; every decision is kept and the member told.
struct SanctionsAdminView: View {
    @EnvironmentObject var app: AppModel
    @State private var list: SanctionList?
    @State private var people: [BranchPerson] = []
    @State private var error: APIError?
    @State private var actionError: String?
    @State private var notice: String?
    @State private var composing = false
    @State private var busy = false

    var body: some View {
        List {
            Section {
                Text("Салбарын аль ч гишүүнд шалтгаантай сануулга өгч, шаардлагатай бол оноо хасна. Шийдвэр түүхэнд үлдэж, тухайн хүнд мэдэгдэл очно. Өөртөө шийдвэр гаргахгүй.")
                    .font(.footnote).foregroundStyle(.secondary)
                Button { composing = true } label: {
                    Label("Шинэ шийдвэр", systemImage: "plus.circle.fill").frame(minHeight: Theme.minTap)
                }
                .disabled(people.isEmpty || app.isOffline)
            }
            if let notice { Section { NoticeView(text: notice, kind: .success) } }
            if let actionError { Section { NoticeView(text: actionError, kind: .error) } }
            if let list {
                Section("Шийдвэрийн түүх") {
                    if list.sanctions.isEmpty { Text("Шийдвэр алга.").foregroundStyle(.secondary) }
                    ForEach(list.sanctions) { SanctionRow(sanction: $0, showMember: true) }
                    if list.hasMore { Button("Цааш үзэх") { Task { await more() } }.disabled(busy) }
                }
            } else if let error {
                Section { ErrorStateView(error: error) { Task { await load() } } }
            } else {
                Section { ProgressView() }
            }
        }
        .navigationTitle("Хяналтын хороо")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $composing) {
            SanctionComposer(people: people.filter { $0.userId != app.me?.id }) { userID, points, reason in
                await record(userID: userID, points: points, reason: reason)
            }
        }
        .offlineBanner()
    }

    private func load() async {
        do {
            async let decisions = app.api.sanctions()
            async let branch = app.api.branchPeople()
            let (d, b) = try await (decisions, branch)
            list = d
            people = b.members.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
            error = nil
        } catch { self.error = APIError.wrap(error) }
    }

    private func more() async {
        guard let list, let next = list.nextOffset else { return }
        busy = true; defer { busy = false }
        do {
            var page = try await app.api.sanctions(offset: next)
            page.sanctions = list.sanctions + page.sanctions
            self.list = page
        } catch { actionError = APIError.wrap(error).message }
    }

    /// True when recorded, so the sheet can close.
    private func record(userID: String, points: Int, reason: String) async -> Bool {
        actionError = nil; notice = nil
        do {
            _ = try await app.api.sanction(userID: userID, points: points, reason: reason)
            notice = "Шийдвэр бүртгэгдлээ."
            Haptics.success()
            await load()
            return true
        } catch {
            actionError = APIError.wrap(error).message
            Haptics.error()
            return false
        }
    }
}

struct SanctionRow: View {
    let sanction: Sanction
    var showMember = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                if showMember { Text(sanction.userName.isEmpty ? "—" : sanction.userName).font(.headline) }
                Spacer()
                Text(sanction.points > 0 ? "−\(Int(sanction.points)) оноо" : "Сануулга")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(sanction.points > 0 ? Color.red : Color.secondary)
            }
            Text(sanction.reason).font(.subheadline)
            Text([Formatters.dateTime(sanction.createdAt), sanction.actorName.isEmpty ? nil : "Шийдвэрлэсэн: \(sanction.actorName)"]
                    .compactMap { $0 }.joined(separator: " · "))
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

private struct SanctionComposer: View {
    let people: [BranchPerson]
    let onSubmit: (String, Int, String) async -> Bool
    @Environment(\.dismiss) private var dismiss
    @State private var userID = ""
    @State private var points = 0
    @State private var reason = ""
    @State private var confirming = false
    @State private var busy = false

    private var chosen: BranchPerson? { people.first { $0.userId == userID } }
    private var ready: Bool { chosen != nil && !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && reason.count <= 500 }

    var body: some View {
        NavigationStack {
            Form {
                Picker("Гишүүн", selection: $userID) {
                    Text("Сонгох").tag("")
                    ForEach(people) { Text($0.name.isEmpty ? $0.email : $0.name).tag($0.userId) }
                }
                Stepper(value: $points, in: 0...10000, step: 1) {
                    LabeledContent("Хасах оноо", value: points == 0 ? "Зөвхөн сануулга" : "\(points)")
                }
                Section("Шалтгаан") {
                    TextField("Юуны төлөө", text: $reason, axis: .vertical).lineLimit(3...6)
                }
            }
            .navigationTitle("Шинэ шийдвэр")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Болих") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) { Button("Бүртгэх") { confirming = true }.disabled(!ready || busy) }
            }
            .confirmationDialog(confirmTitle, isPresented: $confirming, titleVisibility: .visible) {
                Button("Бүртгэх", role: .destructive) {
                    Task {
                        busy = true
                        let ok = await onSubmit(userID, points, reason.trimmingCharacters(in: .whitespacesAndNewlines))
                        busy = false
                        if ok { dismiss() }
                    }
                }
                Button("Болих", role: .cancel) {}
            } message: { Text(reason) }
            .interactiveDismissDisabled(busy)
        }
    }

    private var confirmTitle: String {
        let name = chosen?.name ?? ""
        return points > 0 ? "\(name)-д \(points) оноо хасаж, сануулга өгөх үү?" : "\(name)-д сануулга өгөх үү?"
    }
}
