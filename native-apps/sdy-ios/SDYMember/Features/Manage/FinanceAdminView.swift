import SwiftUI

/// Санхүү: the treasurer sees every charge and payment, confirms or rejects
/// reported transfers, waives a charge and raises a month's dues. Every
/// decision needs a reason; the server keeps them.
struct FinanceAdminView: View {
    @EnvironmentObject var app: AppModel
    @State private var data: FinanceOverview?
    @State private var error: APIError?
    @State private var actionError: String?
    @State private var notice: String?
    @State private var period = ""
    @State private var showing = Tab.payments
    @State private var deciding: Decision?
    @State private var confirmCharges = false
    @State private var busy = false

    enum Tab: String, CaseIterable { case payments = "Төлөлт", charges = "Хураамж" }

    struct Decision: Identifiable {
        enum Kind { case approve, reject, reverse, waive, unwaive }
        let kind: Kind
        let id: String
        let title: String
    }

    /// This month first, in Ulaanbaatar — worked out each time, so a screen
    /// left open across the 1st offers the new month.
    private var periods: [String] { Formatters.recentPeriods() }

    var body: some View {
        List {
            Section {
                Picker("Сар", selection: $period) {
                    Text("Бүх сар").tag("")
                    ForEach(periods, id: \.self) { Text($0).tag($0) }
                }
                if let totals = data?.totals {
                    LabeledContent("Ногдуулсан", value: Formatters.money(totals.charged))
                    LabeledContent("Орсон", value: Formatters.money(totals.received))
                    LabeledContent("Төлөгдөөгүй", value: Formatters.money(totals.outstanding))
                    LabeledContent("Чөлөөлсөн", value: Formatters.money(totals.waived))
                }
                Button { confirmCharges = true } label: {
                    Label("\(periods[0]) сарын хураамж ногдуулах", systemImage: "plus.circle")
                }
                .disabled(busy || app.isOffline)
            }
            if let notice { Section { NoticeView(text: notice, kind: .success) } }
            if let actionError { Section { NoticeView(text: actionError, kind: .error) } }
            Section {
                Picker("Харах", selection: $showing) {
                    ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            if let data {
                switch showing {
                case .payments: payments(data.payments)
                case .charges: charges(data.charges)
                }
                if data.hasMore { Button("Цааш үзэх") { Task { await more() } }.disabled(busy) }
            } else if let error {
                Section { ErrorStateView(error: error) { Task { await load() } } }
            } else {
                Section { ProgressView() }
            }
        }
        .navigationTitle("Санхүү")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: period) { await load() }
        .refreshable { await load() }
        .sheet(item: $deciding) { decision in
            ReasonSheet(title: decision.title, action: title(decision.kind), destructive: decision.kind != .approve) { reason in
                await decide(decision, reason: reason)
            }
        }
        .confirmationDialog("\(periods[0]) сарын хураамжийг бүх гишүүнд ногдуулах уу?", isPresented: $confirmCharges, titleVisibility: .visible) {
            Button("Ногдуулах") { Task { await raiseCharges() } }
            Button("Болих", role: .cancel) {}
        } message: { Text("Аль хэдийн ногдуулсан гишүүнд давхардахгүй.") }
        .offlineBanner()
    }

    @ViewBuilder
    private func payments(_ list: [FinancePayment]) -> some View {
        Section("Мэдэгдсэн төлөлт") {
            if list.isEmpty { Text("Төлөлт алга.").foregroundStyle(.secondary) }
            ForEach(list) { p in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(p.name.isEmpty ? "—" : p.name).font(.headline)
                        Spacer()
                        Text(Formatters.money(p.amount)).font(.headline).monospacedDigit()
                    }
                    Text("\(Labels.payment(p.status)) · \(p.reference) · \(Formatters.dateTime(p.createdAt))")
                        .font(.caption).foregroundStyle(.secondary)
                    if !p.reviewNote.isEmpty { Text(p.reviewNote).font(.caption) }
                    if p.status == "pending" {
                        HStack {
                            Button("Батлах") { deciding = Decision(kind: .approve, id: p.id, title: "\(p.name) · \(Formatters.money(p.amount))") }
                                .buttonStyle(.borderedProminent).frame(minHeight: Theme.minTap)
                            Button("Татгалзах", role: .destructive) { deciding = Decision(kind: .reject, id: p.id, title: "\(p.name) · \(Formatters.money(p.amount))") }
                                .buttonStyle(.bordered).frame(minHeight: Theme.minTap)
                        }
                        .disabled(busy || app.isOffline)
                    } else if p.status == "approved" {
                        Button("Буцаах", role: .destructive) { deciding = Decision(kind: .reverse, id: p.id, title: "\(p.name) · \(Formatters.money(p.amount))") }
                            .buttonStyle(.bordered).frame(minHeight: Theme.minTap).disabled(busy || app.isOffline)
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    @ViewBuilder
    private func charges(_ list: [FinanceCharge]) -> some View {
        Section("Ногдуулсан хураамж") {
            if list.isEmpty { Text("Хураамж алга.").foregroundStyle(.secondary) }
            ForEach(list) { c in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(c.name.isEmpty ? "—" : c.name).font(.headline)
                        Spacer()
                        Text(c.period).font(.subheadline).foregroundStyle(.secondary)
                    }
                    Text("Ногдуулсан \(Formatters.money(c.amount)) · Төлсөн \(Formatters.money(c.paid)) · Үлдэгдэл \(Formatters.money(c.balance))")
                        .font(.caption).foregroundStyle(.secondary).monospacedDigit()
                    if c.waived {
                        Text("Чөлөөлсөн: \(c.waiverReason)").font(.caption).foregroundStyle(.orange)
                        Button("Чөлөөлөлтийг буцаах", role: .destructive) {
                            deciding = Decision(kind: .unwaive, id: c.id, title: "\(c.name) · \(c.period)")
                        }
                        .buttonStyle(.bordered).frame(minHeight: Theme.minTap).disabled(busy || app.isOffline)
                    } else if c.balance > 0 {
                        if c.pending > 0 {
                            // The server refuses it (409): the transfer would never be confirmed.
                            Label("Хүлээгдэж буй төлбөр \(Formatters.money(c.pending)) байна. Чөлөөлөхийн өмнө төлбөрийг батлах эсвэл татгалзана уу.",
                                  systemImage: "hourglass")
                                .font(.caption).foregroundStyle(.orange)
                        }
                        Button("Чөлөөлөх") { deciding = Decision(kind: .waive, id: c.id, title: "\(c.name) · \(c.period)") }
                            .buttonStyle(.bordered).frame(minHeight: Theme.minTap)
                            .disabled(busy || app.isOffline || c.pending > 0)
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    private func title(_ kind: Decision.Kind) -> String {
        switch kind {
        case .approve: return "Батлах"
        case .reject: return "Татгалзах"
        case .reverse: return "Буцаах"
        case .waive: return "Чөлөөлөх"
        case .unwaive: return "Чөлөөлөлтийг буцаах"
        }
    }

    private func load() async {
        do { data = try await app.api.financeOverview(period: period); error = nil }
        catch { self.error = APIError.wrap(error) }
    }

    private func more() async {
        guard let data, let query = data.nextPageQuery(chargesShown: data.charges.count, paymentsShown: data.payments.count) else { return }
        busy = true; defer { busy = false }
        do {
            var page = try await app.api.financeOverview(period: period, page: query)
            page.charges = data.charges.appendingUnique(page.charges)
            page.payments = data.payments.appendingUnique(page.payments)
            self.data = page
        } catch { actionError = APIError.wrap(error).message }
    }

    private func decide(_ decision: Decision, reason: String) async -> Bool {
        busy = true; actionError = nil; notice = nil
        defer { busy = false }
        do {
            switch decision.kind {
            case .approve: try await app.api.reviewPayment(decision.id, action: "approve", reason: reason)
            case .reject: try await app.api.reviewPayment(decision.id, action: "reject", reason: reason)
            case .reverse: try await app.api.reviewPayment(decision.id, action: "reverse", reason: reason)
            case .waive: try await app.api.waiveCharge(decision.id, reason: reason)
            case .unwaive: try await app.api.unwaiveCharge(decision.id, reason: reason)
            }
            notice = "Хадгалагдлаа."
            Haptics.success()
            await load()
            return true
        } catch {
            actionError = APIError.wrap(error).message
            Haptics.error()
            return false
        }
    }

    private func raiseCharges() async {
        busy = true; actionError = nil; notice = nil
        defer { busy = false }
        do {
            try await app.api.createCharges(period: periods[0])
            notice = "\(periods[0]) сарын хураамж ногдууллаа."
            await load()
        } catch { actionError = APIError.wrap(error).message }
    }
}

/// Asks for the reason a decision needs, then runs it.
struct ReasonSheet: View {
    let title: String
    let action: String
    var destructive = false
    let onSubmit: (String) async -> Bool
    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section { Text(title).font(.headline) }
                Section("Шалтгаан") { TextField("Заавал бичнэ", text: $reason, axis: .vertical).lineLimit(2...5) }
            }
            .navigationTitle(action)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Болих") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(action, role: destructive ? .destructive : nil) {
                        Task {
                            busy = true
                            let ok = await onSubmit(reason.trimmingCharacters(in: .whitespacesAndNewlines))
                            busy = false
                            if ok { dismiss() }
                        }
                    }
                    .disabled(busy || reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || reason.count > 500)
                }
            }
            .interactiveDismissDisabled(busy)
        }
        .presentationDetents([.medium])
    }
}
