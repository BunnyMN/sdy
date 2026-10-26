import SwiftUI

struct DuesView: View {
    @EnvironmentObject var app: AppModel
    @State private var settings: DuesSettings?
    @State private var page: MyDuesPage?
    @State private var error: APIError?
    @State private var loadingMore = false
    @State private var reporting: Charge?
    @State private var notice: String?

    var body: some View {
        NavigationStack {
            Group {
                if let page {
                    content(page)
                } else if let error {
                    ErrorStateView(error: error) { Task { await load() } }
                } else {
                    SkeletonList(rows: 4)
                }
            }
            .navigationTitle("Хураамж")
            .offlineBanner()
            .task { if page == nil { await load() } }
            .sheet(item: $reporting) { charge in
                ReportPaymentSheet(charge: charge) {
                    notice = "Төлбөрийн мэдэгдэл илгээгдлээ. Санхүү шалгаж баталгаажуулна."
                    Task { await load() }
                }
            }
        }
    }

    @ViewBuilder
    private func content(_ page: MyDuesPage) -> some View {
        List {
            if let notice {
                Section { NoticeView(text: notice, kind: .success) }
            }
            if let totals = page.totals, totals.charged > 0 {
                Section { summary(totals) }
            }
            if let settings {
                if settings.enabled {
                    Section {
                        if settings.monthlyAmount > 0 {
                            LabeledContent("Сарын хураамж", value: Formatters.money(settings.monthlyAmount))
                        }
                        CopyRow(label: "Банк", value: settings.bankName)
                        CopyRow(label: "Дансны дугаар", value: settings.accountNumber)
                        CopyRow(label: "Хүлээн авагч", value: settings.accountHolder)
                        if !settings.instructions.isEmpty {
                            Text(settings.instructions).font(.footnote).foregroundStyle(.secondary)
                        }
                    } header: {
                        Text("Шилжүүлэх данс")
                    } footer: {
                        Text("Банкны аппаар шилжүүлсний дараа доорх хураамж дээр «Төлбөр мэдэгдэх» товчийг дарна уу. Апп дотор төлбөр авахгүй.")
                    }
                } else {
                    Section {
                        Label("Танай салбар хураамжийн тохиргоо хийгээгүй байна.", systemImage: "info.circle")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Section("Хураамжууд") {
                if page.charges.isEmpty {
                    Text("Танд ногдуулсан хураамж алга.").foregroundStyle(.secondary)
                }
                ForEach(page.charges) { charge in chargeRow(charge, payments: page.payments) }
            }
            if !page.payments.isEmpty {
                Section("Төлөлтийн түүх") {
                    ForEach(page.payments) { payment in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(Formatters.money(payment.amount)).font(.headline).monospacedDigit()
                                Spacer()
                                paymentChip(payment.status)
                            }
                            Text(payment.reference).font(.subheadline).foregroundStyle(.secondary)
                            if !payment.reviewNote.isEmpty { Text(payment.reviewNote).font(.footnote) }
                            Text(Formatters.dateTime(payment.createdAt)).font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            if page.hasMore {
                Section {
                    Button { Task { await more() } } label: {
                        HStack { Spacer(); if loadingMore { ProgressView() } else { Text("Цааш үзэх") }; Spacer() }
                            .frame(minHeight: Theme.minTap)
                    }
                    .disabled(loadingMore)
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await load() }
    }

    private func summary(_ totals: MyDuesTotals) -> some View {
        let left = max(0, totals.outstanding - totals.pending)
        let pendingPct = min(100 - totals.paidPercent, DuesMath.percent(totals.pending, of: totals.owed))
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Миний хураамж").font(.headline)
                Spacer()
                Text("\(totals.paidPercent)% төлсөн").font(.title2.bold()).foregroundStyle(Theme.success).monospacedDigit()
            }
            DuesProgressBar(paidPercent: totals.paidPercent, pendingPercent: pendingPct)
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                GridRow {
                    stat("Ногдуулсан", totals.owed)
                    stat("Төлсөн", totals.paid, accent: true)
                }
                GridRow {
                    stat("Шалгагдаж буй", totals.pending)
                    stat("Үлдэгдэл", left, danger: left > 0)
                }
            }
            Text("Шалгагдаж буй төлбөр санхүү баталсны дараа «Төлсөн»-д орно.").font(.caption).foregroundStyle(.secondary)
        }
        .padding(.vertical, 6)
    }

    private func stat(_ label: String, _ value: Double, accent: Bool = false, danger: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(Formatters.money(value)).font(.subheadline.bold()).monospacedDigit()
                .foregroundStyle(accent ? Theme.success : danger ? Color.red : Color.primary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func chargeRow(_ charge: Charge, payments: [Payment]) -> some View {
        let overdue = charge.isOverdue()
        let parts = payments.filter { $0.chargeId == charge.id }
        let paidPct = DuesMath.percent(charge.paid, of: charge.waived ? min(charge.amount, charge.paid) : charge.amount)
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(charge.period).font(.headline)
                Spacer()
                Text(Formatters.money(charge.amount)).font(.headline).monospacedDigit()
            }
            HStack(spacing: 6) {
                if charge.waived {
                    StatusChip(text: "Чөлөөлсөн", systemImage: "hand.thumbsup", tone: .neutral)
                } else if charge.balance <= 0 {
                    StatusChip(text: "Төлөгдсөн", systemImage: "checkmark.circle.fill", tone: .success)
                } else if overdue {
                    StatusChip(text: "Хугацаа хэтэрсэн", systemImage: "exclamationmark.triangle.fill", tone: .danger)
                } else {
                    StatusChip(text: "Төлөх", systemImage: "clock", tone: .warning)
                }
                if (charge.pending ?? 0) > 0 {
                    StatusChip(text: "Шалгагдаж буй \(Formatters.money(charge.pending ?? 0))", systemImage: "hourglass", tone: .info)
                }
            }
            DuesProgressBar(paidPercent: paidPct, pendingPercent: min(100 - paidPct, DuesMath.percent(charge.pending ?? 0, of: charge.amount)))
            VStack(alignment: .leading, spacing: 2) {
                Text("Төлсөн: \(Formatters.money(charge.paid)) · Үлдэгдэл: \(Formatters.money(charge.balance))").monospacedDigit()
                Text("Төлөх хугацаа: \(Formatters.day(charge.dueDate))")
                    .foregroundStyle(overdue ? Color.red : Color.secondary)
                if charge.waived && !charge.waiverReason.isEmpty { Text("Чөлөөлсөн шалтгаан: \(charge.waiverReason)") }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            if !parts.isEmpty {
                ForEach(parts) { part in
                    HStack {
                        Text(Formatters.money(part.amount)).monospacedDigit()
                        Spacer()
                        Text(Labels.payment(part.status)).foregroundStyle(part.status == "approved" ? .green : part.status == "pending" ? .secondary : .red)
                    }
                    .font(.caption)
                }
            }
            if charge.reportable > 0 {
                Button { reporting = charge; notice = nil } label: {
                    Label("Төлбөр мэдэгдэх", systemImage: "paperplane").frame(maxWidth: .infinity, minHeight: 40)
                }
                .buttonStyle(.bordered)
                .disabled(app.isOffline)
            } else if charge.balance > 0 {
                Text("Үлдэгдлийг бүхэлд нь мэдэгдсэн. Санхүүгийн баталгаажуулалтыг хүлээж байна.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }

    private func paymentChip(_ status: String) -> StatusChip {
        switch status {
        case "approved": return StatusChip(text: Labels.payment(status), systemImage: "checkmark.circle.fill", tone: .success)
        case "pending": return StatusChip(text: Labels.payment(status), systemImage: "hourglass", tone: .warning)
        default: return StatusChip(text: Labels.payment(status), systemImage: "xmark.circle", tone: .danger)
        }
    }

    private func load() async {
        do {
            async let s = app.api.duesSettings()
            async let p = app.api.myDues()
            let (settings, page) = try await (s, p)
            self.settings = settings
            self.page = page
            error = nil
        } catch {
            self.error = APIError.wrap(error)
        }
    }

    private func more() async {
        guard let page else { return }
        loadingMore = true; defer { loadingMore = false }
        do {
            var next = try await app.api.myDues(offset: page.nextOffset ?? page.charges.count)
            next.charges = page.charges + next.charges
            next.payments = page.payments + next.payments
            next.totals = next.totals ?? page.totals
            self.page = next
        } catch {
            notice = nil
            self.error = nil
        }
    }
}

struct ReportPaymentSheet: View {
    let charge: Charge
    let onSent: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var parts = 1
    @State private var amountText = ""
    @State private var reference = ""
    @State private var busy = false
    @State private var error: String?
    /// One key per sheet: a retried submit is the same report, not a second one.
    @State private var requestKey = UUID().uuidString.lowercased()

    private var left: Double { charge.reportable }
    private var amount: Double { Double(amountText.filter(\.isNumber)) ?? 0 }
    private var valid: Bool { amount >= 1 && amount <= left && !reference.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Хураамж", value: charge.period)
                    LabeledContent("Мэдэгдэх боломжтой", value: Formatters.money(left))
                }
                if DuesMath.partChoices(left).count > 1 {
                    Section("Хэдэн хэсэгт хувааж төлөх вэ?") {
                        Picker("Хэсэг", selection: $parts) {
                            ForEach(DuesMath.partChoices(left), id: \.self) { n in
                                Text(n == 1 ? "Бүтэн" : "\(n) хуваах").tag(n)
                            }
                        }
                        .pickerStyle(.segmented)
                        .onChange(of: parts) { _, n in amountText = String(Int(DuesMath.partAmount(left, parts: n))) }
                    }
                }
                Section {
                    HStack {
                        TextField("Дүн", text: $amountText)
                            .keyboardType(.numberPad)
                            .font(.title3.monospacedDigit())
                            .onChange(of: amountText) { _, v in
                                let digits = v.filter(\.isNumber)
                                if digits != v { amountText = digits }
                            }
                        Text("₮").foregroundStyle(.secondary)
                    }
                    TextField("Гүйлгээний утга", text: $reference)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .onChange(of: reference) { _, v in if v.count > 128 { reference = String(v.prefix(128)) } }
                } header: {
                    Text("Шилжүүлсэн мэдээлэл")
                } footer: {
                    VStack(alignment: .leading, spacing: 4) {
                        if amount > left { Text("Дүн нь мэдэгдэх боломжтой үлдэгдлээс их байна.").foregroundStyle(.red) }
                        Text("Энэ хэсэг: \(Formatters.money(min(amount, left))) · Дараа нь үлдэх: \(Formatters.money(max(0, left - amount)))")
                        Text("Банкны гүйлгээнд бичсэн утгаа яг адилхан оруулна уу. Санхүү баталсны дараа төлөгдсөнд тооцогдоно.")
                    }
                }
                if let error { Section { NoticeView(text: error, kind: .error) } }
            }
            .navigationTitle("Төлбөр мэдэгдэх")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Болих") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView() } else {
                        Button("Илгээх") { Task { await submit() } }.disabled(!valid)
                    }
                }
            }
            .onAppear { if amountText.isEmpty { amountText = String(Int(left)) } }
        }
        .interactiveDismissDisabled(busy)
    }

    private func submit() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            _ = try await APIClient.shared.reportPayment(chargeID: charge.id, requestKey: requestKey, amount: amount,
                                                        reference: reference.trimmingCharacters(in: .whitespacesAndNewlines))
            Haptics.success()
            onSent()
            dismiss()
        } catch {
            Haptics.error()
            self.error = APIError.wrap(error).message
        }
    }
}
