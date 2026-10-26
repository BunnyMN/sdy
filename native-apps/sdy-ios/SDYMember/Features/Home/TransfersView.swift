import SwiftUI

/// Moving one's membership to another branch (components/MembershipTransfers.tsx).
struct TransfersView: View {
    @EnvironmentObject var app: AppModel
    @State private var transfers: [MembershipTransfer] = []
    @State private var branches: [Branch] = []
    @State private var loaded = false
    @State private var loadError: APIError?
    @State private var destination = ""
    @State private var message = ""
    @State private var busy = false
    @State private var notice: NoticeView?
    @State private var cancelTarget: MembershipTransfer?

    private var source: Affiliation? { app.record?.approvedBranch }
    private var pending: Bool { transfers.contains { $0.status == "PENDING" } }
    private var destinations: [Branch] { branches.filter { $0.slug != source?.slug } }

    var body: some View {
        Group {
            if !loaded, let loadError {
                ErrorStateView(error: loadError) { Task { await load() } }
            } else if !loaded {
                SkeletonList(rows: 3)
            } else {
                form
            }
        }
        .navigationTitle("Харьяалал шилжүүлэх")
        .navigationBarTitleDisplayMode(.inline)
        .task { if !loaded { await load() } }
        .refreshable { await load() }
        .offlineBanner()
        .confirmationDialog("Шилжих хүсэлтээ цуцлах уу?", isPresented: Binding(get: { cancelTarget != nil }, set: { if !$0 { cancelTarget = nil } }), titleVisibility: .visible) {
            Button("Хүсэлтээ цуцлах", role: .destructive) {
                if let target = cancelTarget { Task { await cancel(target) } }
            }
            Button("Буцах", role: .cancel) {}
        }
    }

    private var form: some View {
        Form {
            Section {
                Text("Очих салбарын админ батлах хүртэл одоогийн харьяалал хэвээр байна. Батлагдвал дахин нэвтэрнэ. Өмнөх ирц, оноо, төлөлтийн түүх хуучин салбарын бүртгэлд хадгалагдана.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if let notice { Section { notice } }
            if !transfers.isEmpty {
                Section("Миний хүсэлтүүд") {
                    ForEach(transfers) { t in
                        VStack(alignment: .leading, spacing: 6) {
                            Text("\(t.fromName) → \(t.toName)").font(.headline)
                            StatusChip(text: Labels.transfer(t.status),
                                       systemImage: t.status == "PENDING" ? "hourglass" : t.status == "ACCEPTED" ? "checkmark.circle" : "xmark.circle",
                                       tone: t.status == "PENDING" ? .warning : t.status == "ACCEPTED" ? .success : .neutral)
                            if !t.message.isEmpty { Text(t.message).font(.subheadline).foregroundStyle(.secondary) }
                            Text(Formatters.dateTime(t.createdAt)).font(.caption).foregroundStyle(.secondary)
                            if t.status == "PENDING" {
                                Button("Хүсэлтээ цуцлах", role: .destructive) { cancelTarget = t }
                                    .frame(minHeight: Theme.minTap)
                                    .disabled(busy || app.isOffline)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            if source != nil && !pending && !destinations.isEmpty {
                Section("Шинэ хүсэлт") {
                    LabeledContent("Одоогийн харьяалал", value: source?.name ?? "")
                    Picker("Шилжиж очих салбар", selection: $destination) {
                        Text("Сонгох").tag("")
                        ForEach(destinations) { Text($0.name).tag($0.slug) }
                    }
                    TextField("Шилжих шалтгаан", text: $message, axis: .vertical)
                        .lineLimit(3...6)
                        .onChange(of: message) { _, v in if v.count > 500 { message = String(v.prefix(500)) } }
                    Button {
                        Task { await submit() }
                    } label: {
                        HStack { Spacer(); if busy { ProgressView() } else { Text("Шилжих хүсэлт илгээх").bold() }; Spacer() }
                            .frame(minHeight: Theme.minTap)
                    }
                    .disabled(busy || destination.isEmpty || message.trimmingCharacters(in: .whitespaces).isEmpty || app.isOffline)
                }
            } else if source == nil {
                Section { Text("Үндсэн харьяалал баталгаажсаны дараа шилжих хүсэлт гаргах боломжтой.").foregroundStyle(.secondary) }
            }
        }
    }

    private func load() async {
        do {
            async let t = app.api.transfers()
            async let b = app.api.branches()
            transfers = try await t.requests
            branches = (try? await b.branches) ?? []
            loaded = true
            loadError = nil
        } catch { loadError = APIError.wrap(error) }
    }

    private func submit() async {
        guard let source else { return }
        busy = true; notice = nil
        defer { busy = false }
        do {
            try await app.api.requestTransfer(from: source.tenantId, slug: destination, message: message.trimmingCharacters(in: .whitespacesAndNewlines))
            message = ""; destination = ""
            notice = NoticeView(text: "Шилжих хүсэлт илгээгдлээ.", kind: .success)
            Haptics.success()
            await load()
        } catch {
            notice = NoticeView(text: APIError.wrap(error).message, kind: .error)
        }
    }

    private func cancel(_ t: MembershipTransfer) async {
        busy = true; notice = nil
        defer { busy = false }
        do {
            try await app.api.cancelTransfer(t.id)
            notice = NoticeView(text: "Хүсэлт цуцлагдлаа.", kind: .success)
            await load()
        } catch {
            notice = NoticeView(text: APIError.wrap(error).message, kind: .error)
        }
    }
}

/// Asking a branch to admit you (app/member/page.tsx).
struct JoinRequestView: View {
    @EnvironmentObject var app: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var branches: [Branch] = []
    @State private var loaded = false
    @State private var loadError: APIError?
    @State private var slug = ""
    @State private var message = ""
    @State private var busy = false
    @State private var error: String?

    /// Parents first, each followed by its own branches.
    private var ordered: [(branch: Branch, indent: Bool)] {
        let parents = branches.filter { branch in branch.parentSlug == nil || !branches.contains(where: { $0.slug == branch.parentSlug }) }
        var out: [(Branch, Bool)] = []
        for parent in parents {
            out.append((parent, false))
            for child in branches where child.parentSlug == parent.slug { out.append((child, true)) }
        }
        return out
    }

    var body: some View {
        Group {
            if !loaded, let loadError {
                ErrorStateView(error: loadError) { Task { await load() } }
            } else if !loaded {
                SkeletonList(rows: 3)
            } else if branches.isEmpty {
                EmptyStateView(title: "Салбар олдсонгүй", systemImage: "building.2",
                               message: "Салбарын жагсаалтыг одоогоор авах боломжгүй байна. Дахин шинэчилнэ үү.",
                               actionTitle: "Шинэчлэх") { Task { await load() } }
            } else {
                Form {
                    Section {
                        Picker("Салбар", selection: $slug) {
                            Text("Салбараа сонгоно уу").tag("")
                            ForEach(ordered, id: \.branch.slug) { item in
                                Text((item.indent ? "   " : "") + item.branch.name).tag(item.branch.slug)
                            }
                        }
                        .pickerStyle(.navigationLink)
                        TextField("Нэмэлт тайлбар (заавал биш)", text: $message, axis: .vertical)
                            .lineLimit(3...6)
                            .onChange(of: message) { _, v in if v.count > 500 { message = String(v.prefix(500)) } }
                    } footer: {
                        Text("Харьяалагдах салбараа сонгож элсэх хүсэлт илгээнэ. Менежер эсвэл админ баталсны дараа гишүүн болно.")
                    }
                    if let error { Section { NoticeView(text: error, kind: .error) } }
                    Section {
                        Button {
                            Task { await submit() }
                        } label: {
                            HStack { Spacer(); if busy { ProgressView() } else { Text("Элсэх хүсэлт илгээх").bold() }; Spacer() }
                                .frame(minHeight: Theme.minTap)
                        }
                        .disabled(busy || slug.isEmpty || app.isOffline)
                    }
                }
            }
        }
        .navigationTitle("Салбарт элсэх")
        .navigationBarTitleDisplayMode(.inline)
        .task { if !loaded { await load() } }
        .offlineBanner()
    }

    private func load() async {
        do {
            branches = try await app.api.branches().branches
            loaded = true; loadError = nil
        } catch { loadError = APIError.wrap(error) }
    }

    private func submit() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            let result = try await app.api.askToJoin(slug: slug, message: message.trimmingCharacters(in: .whitespacesAndNewlines))
            Haptics.success()
            if result.joined {
                await app.signedIn()
            } else {
                dismiss()
            }
        } catch {
            self.error = APIError.wrap(error).message
        }
    }
}
