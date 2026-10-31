import SwiftUI

struct DiscussionSection: View {
    @ObservedObject var model: DiscussionModel
    @EnvironmentObject var app: AppModel
    @State private var confirm: (motion: Motion, choice: String)?
    @State private var proposing = false

    var body: some View {
        Section {
            if let error = model.loadError, model.data == nil {
                HStack {
                    Text(error.message).font(.footnote).foregroundStyle(.secondary)
                    Spacer()
                    Button("Дахин") { Task { await model.load() } }.buttonStyle(.bordered)
                }
            } else if let data = model.data {
                eligibility(data)
                if let actionError = model.actionError { NoticeView(text: actionError, kind: .error) }
                if data.motions.isEmpty {
                    Text("Одоогоор хэлэлцэх асуудал алга.").foregroundStyle(.secondary)
                }
                ForEach(data.motions) { motion in
                    MotionRow(motion: motion, data: data, signingActive: model.signing != nil, offline: app.isOffline) { choice in
                        confirm = (motion, choice)
                    } onCheck: {
                        model.vote(motion, choice: motion.myVote?.choice ?? "yes")
                    }
                }
                if data.eventStatus != "cancelled" {
                    Button { proposing = true } label: {
                        Label("Асуудал дэвшүүлэх", systemImage: "text.bubble")
                            .frame(minHeight: Theme.minTap)
                    }
                    .disabled(app.isOffline)
                }
            } else {
                HStack { ProgressView(); Text("Ачаалж байна…").foregroundStyle(.secondary) }
            }
        } header: {
            Label("Хэлэлцүүлэг", systemImage: "building.columns")
        } footer: {
            Text("Ирц нь батлагдсан гишүүд саналаа eID тоон гарын үсгээр баталгаажуулна; өгсөн саналын олонхоор шийдэгдэнэ.")
        }
        .confirmationDialog(confirmTitle, isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
            Button("eID-ээр зурж илгээх") {
                if let c = confirm { model.vote(c.motion, choice: c.choice) }
            }
            Button("Болих", role: .cancel) {}
        } message: {
            Text("eID Mongolia апп нээгдэж, PIN2-оор баталгаажуулна. Зурсан саналыг өөрчлөх боломжгүй.")
        }
        .sheet(isPresented: $proposing) { ProposeSheet(model: model) }
    }

    private var confirmTitle: String {
        guard let confirm else { return "" }
        return "«\(Labels.choice(confirm.choice))» гэж санал өгөх үү?"
    }

    @ViewBuilder
    private func eligibility(_ data: MotionList) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let eligible = data.eligible {
                Text("Санал өгөх эрхтэй: \(eligible)").font(.caption).foregroundStyle(.secondary)
            }
            if !data.signingReady {
                Label("eID гарын үсэг тохируулагдаагүй тул санал өгөх боломжгүй.", systemImage: "exclamationmark.triangle")
                    .font(.caption).foregroundStyle(.orange)
            } else if !data.canVote {
                Label("Санал өгөхийн тулд энэ арга хэмжээнд ирцээ баталгаажуулна уу.", systemImage: "info.circle")
                    .font(.caption).foregroundStyle(.secondary)
            } else if let points = data.votePoints, points > 0 {
                Label("Зурсан санал бүр +\(Int(points)) оноо", systemImage: "star")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

struct MotionRow: View {
    let motion: Motion
    let data: MotionList
    let signingActive: Bool
    let offline: Bool
    let onVote: (String) -> Void
    let onCheck: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(motion.title).font(.headline)
                    Text("Дэвшүүлсэн: \(motion.proposerName.isEmpty ? "—" : motion.proposerName)")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
            }
            statusChip
            if !motion.body.isEmpty { Text(motion.body).font(.subheadline) }
            if motion.status == "voting" || motion.status == "decided" { tally }
            myVote
            if data.needsMyVote(motion) {
                HStack(spacing: 8) {
                    ForEach(["yes", "no", "abstain"], id: \.self) { choice in
                        if choice == "yes" {
                            Button { onVote(choice) } label: { Text(Labels.choice(choice)).frame(maxWidth: .infinity, minHeight: 36) }
                                .buttonStyle(.borderedProminent)
                        } else {
                            Button { onVote(choice) } label: { Text(Labels.choice(choice)).frame(maxWidth: .infinity, minHeight: 36) }
                                .buttonStyle(.bordered)
                        }
                    }
                }
                .disabled(signingActive || offline)
                .font(.subheadline.weight(.semibold))
            }
        }
        .padding(.vertical, 6)
    }

    private var statusChip: some View {
        let s = motion.displayStatus
        let tone: StatusChip.Tone = s == "voting" ? .info : s == "approved" ? .success : s == "rejected" ? .danger : s == "withdrawn" ? .warning : .neutral
        let icon = s == "voting" ? "hand.raised" : s == "approved" ? "checkmark.circle" : s == "rejected" ? "xmark.circle" : "doc.text"
        return StatusChip(text: Labels.motionStatus(s), systemImage: icon, tone: tone)
    }

    private var tally: some View {
        let total = max(1, motion.counted)
        return VStack(alignment: .leading, spacing: 4) {
            GeometryReader { geo in
                HStack(spacing: 0) {
                    Rectangle().fill(Color.green).frame(width: geo.size.width * motion.yes / Double(total))
                    Rectangle().fill(Color.red).frame(width: geo.size.width * motion.no / Double(total))
                    Rectangle().fill(Color.gray).frame(width: geo.size.width * motion.abstain / Double(total))
                    Spacer(minLength: 0)
                }
            }
            .frame(height: 6)
            .background(Color(.tertiarySystemFill))
            .clipShape(Capsule())
            .accessibilityHidden(true)
            Text("Зөвшөөрсөн \(Int(motion.yes)) · Татгалзсан \(Int(motion.no)) · Түдгэлзсэн \(Int(motion.abstain))")
                .font(.caption).monospacedDigit().foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var myVote: some View {
        if let vote = motion.myVote {
            switch vote.status {
            case "signed":
                Label("Таны санал: \(Labels.chose(vote.choice)) · eID-ээр зурсан", systemImage: "checkmark.seal.fill")
                    .font(.footnote.weight(.medium)).foregroundStyle(.green)
            case "signing":
                HStack {
                    Label("Таны санал (\(Labels.chose(vote.choice))) зурагдаж дуусаагүй байна.", systemImage: "hourglass")
                        .font(.footnote).foregroundStyle(.orange)
                    Spacer()
                }
            default:
                Label("Таны санал зурагдаагүй — дахин санал өгнө үү.", systemImage: "exclamationmark.circle")
                    .font(.footnote).foregroundStyle(.red)
            }
        }
    }
}

struct VoteSigningSheet: View {
    @ObservedObject var model: DiscussionModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                if let s = model.signing {
                    Image(systemName: s.phase == .done ? "checkmark.seal.fill" : s.phase == .failed ? "xmark.octagon.fill" : "signature")
                        .font(.system(size: 48))
                        .foregroundStyle(s.phase == .done ? Color.green : s.phase == .failed ? Color.red : Theme.accent)
                        .accessibilityHidden(true)
                    Text(s.motion.title).font(.headline).multilineTextAlignment(.center)
                    Text("Таны сонголт: \(Labels.choice(s.choice))").font(.subheadline).foregroundStyle(.secondary)

                    switch s.phase {
                    case .starting:
                        ProgressView("eID хүсэлт илгээж байна…")
                    case .waiting:
                        if !s.code.isEmpty {
                            VStack(spacing: 4) {
                                Text("Баталгаажуулах код").font(.caption).foregroundStyle(.secondary)
                                Text(s.code)
                                    .font(.system(size: 48, weight: .bold, design: .rounded).monospacedDigit())
                                    .tracking(6)
                                    .accessibilityLabel("Баталгаажуулах код \(s.code.map(String.init).joined(separator: " "))")
                            }
                        }
                        Text(s.appLink != nil
                             ? "eID Mongolia апп нээгдэнэ. Код таарч байгааг шалгаад PIN2-оо оруулбал энд буцаж ирнэ."
                             : "Утсан дээрх eID Mongolia апп руу хүсэлт илгээлээ. Аппаа нээж, код таарч байгааг шалгаад PIN2-оо оруулна уу.")
                            .font(.footnote).multilineTextAlignment(.center).foregroundStyle(.secondary)
                        HStack(spacing: 8) {
                            ProgressView()
                            Text("Гарын үсгийг хүлээж байна · \(Formatters.clock(model.secondsLeft))").monospacedDigit()
                        }
                        .font(.subheadline)
                        if let link = s.appLink, let url = URL(string: link) {
                            Button { UIApplication.shared.open(url) } label: {
                                Label("eID апп нээх", systemImage: "arrow.up.forward.app").frame(maxWidth: .infinity, minHeight: Theme.minTap)
                            }
                            .buttonStyle(.bordered)
                        }
                    case .done:
                        Text("Санал тань тоологдлоо.").font(.title3.bold()).foregroundStyle(.green)
                        if let points = s.points, points > 0 {
                            Text("+\(Int(points)) оноо").font(.headline)
                        }
                    case .failed:
                        Text(s.message ?? "Гарын үсэг зурагдсангүй. Дахин оролдоно уу.")
                            .multilineTextAlignment(.center).foregroundStyle(.red)
                        Text("Санал тань тоологдоогүй.").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }
            .padding(24)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(model.signing?.phase == .waiting || model.signing?.phase == .starting ? "Цуцлах" : "Хаах") {
                        model.cancelSigning()
                        dismiss()
                    }
                }
            }
            .navigationTitle("eID-ээр баталгаажуулах")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }
}

struct ProposeSheet: View {
    @ObservedObject var model: DiscussionModel
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var text = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Асуудлын нэр", text: $title)
                        .onChange(of: title) { _, v in if v.count > 200 { title = String(v.prefix(200)) } }
                    TextField("Тайлбар, санал болгож буй шийдвэр", text: $text, axis: .vertical)
                        .lineLimit(4...10)
                        .onChange(of: text) { _, v in if v.count > 4000 { text = String(v.prefix(4000)) } }
                } footer: {
                    Text("Зохион байгуулагч санал хураалт нээсний дараа гишүүд санал өгнө.")
                }
                if let error = model.actionError { Section { NoticeView(text: error, kind: .error) } }
            }
            .navigationTitle("Асуудал дэвшүүлэх")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Болих") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Дэвшүүлэх") {
                        Task {
                            if await model.propose(title: title.trimmingCharacters(in: .whitespaces), body: text.trimmingCharacters(in: .whitespacesAndNewlines)) {
                                dismiss()
                            }
                        }
                    }
                    .disabled(model.busy || title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
