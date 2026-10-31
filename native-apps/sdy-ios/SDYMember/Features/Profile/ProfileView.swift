import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var app: AppModel
    @State private var path: [HomeRoute] = []
    @State private var confirmLogout = false

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    HStack(spacing: 14) {
                        Text(initials)
                            .font(.title2.bold())
                            .foregroundStyle(.white)
                            .frame(width: 56, height: 56)
                            .background(Theme.accent, in: Circle())
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(app.me?.name ?? "—").font(.title3.bold())
                            if let email = app.me?.email, !email.isEmpty {
                                Text(email).font(.subheadline).foregroundStyle(.secondary)
                            }
                            if let branch = app.record?.approvedBranch {
                                Label(branch.name, systemImage: "building.2").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 6)
                    .accessibilityElement(children: .combine)
                }

                Section("Гишүүнчлэл") {
                    link(.record, "Миний гишүүнчлэл", "person.text.rectangle")
                    link(.transfers, "Харьяалал шилжүүлэх", "arrow.left.arrow.right")
                    link(.notifications, "Мэдэгдэл", "bell", badge: app.unreadCount)
                }

                if app.hasApprovedBranch {
                    Section("Оролцоо") {
                        link(.participation, "Ирц ба оноо", "star.circle")
                        link(.leaderboard, "Тэргүүлэгчид", "trophy")
                        link(.history, "Миний оролцоо, төлөлтийн түүх", "clock.arrow.circlepath")
                    }
                }

                Section("Тусламж ба нууцлал") {
                    Link(destination: AppConfig.privacyURL) {
                        Label("Нууцлалын бодлого", systemImage: "hand.raised")
                    }
                    .frame(minHeight: Theme.minTap)
                    Link(destination: AppConfig.supportURL) {
                        Label("Тусламж, холбоо барих", systemImage: "questionmark.circle")
                    }
                    .frame(minHeight: Theme.minTap)
                    link(.about, "Апп-ын тухай", "info.circle")
                }

                Section {
                    Button { confirmLogout = true } label: {
                        Label("Гарах", systemImage: "rectangle.portrait.and.arrow.right")
                            .frame(minHeight: Theme.minTap)
                    }
                    NavigationLink(value: HomeRoute.deleteAccount) {
                        Label("Бүртгэл устгах", systemImage: "trash")
                            .foregroundStyle(.red)
                            .frame(minHeight: Theme.minTap)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Профайл")
            .navigationDestination(for: HomeRoute.self) { $0.destination }
            .offlineBanner()
            .confirmationDialog("Гарах уу?", isPresented: $confirmLogout, titleVisibility: .visible) {
                Button("Гарах", role: .destructive) { Task { await app.signOut() } }
                Button("Болих", role: .cancel) {}
            } message: {
                Text("Дараа нь eID Mongolia-аар дахин нэвтэрнэ.")
            }
            .onAppear {
                #if DEBUG
                if let route = AppConfig.launchArgument("-SDYProfileRoute"), let r = HomeRoute(rawValue: route), path.isEmpty { path = [r] }
                #endif
            }
        }
    }

    private var initials: String {
        let parts = (app.me?.name ?? "").split(separator: " ")
        return parts.prefix(2).compactMap { $0.first.map(String.init) }.joined()
    }

    private func link(_ route: HomeRoute, _ title: String, _ icon: String, badge: Int = 0) -> some View {
        NavigationLink(value: route) {
            Label(title, systemImage: icon).frame(minHeight: Theme.minTap)
        }
        .badge(badge)
    }
}

struct MemberRecordView: View {
    @EnvironmentObject var app: AppModel
    @State private var record: MemberRecord?
    @State private var error: APIError?
    @State private var phone = ""
    @State private var residence = ""
    @State private var notifications = true
    @State private var saving = false
    @State private var notice: NoticeView?

    var body: some View {
        Group {
            if let record {
                form(record)
            } else if let error {
                ErrorStateView(error: error) { Task { await load() } }
            } else {
                SkeletonList(rows: 4)
            }
        }
        .navigationTitle("Миний гишүүнчлэл")
        .navigationBarTitleDisplayMode(.inline)
        .task { if record == nil { await load() } }
        .offlineBanner()
    }

    private func form(_ record: MemberRecord) -> some View {
        Form {
            Section {
                if !record.hasPrimary {
                    Text("Үндсэн харьяалал баталгаажаагүй байна. Элсэх хүсэлт өгөх эсвэл салбарын хариуцсан ажилтанд хандана уу.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                ForEach(record.memberships) { m in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(m.name).font(.headline)
                        Text("\(m.isPrimary ? "Үндсэн харьяалал" : "Бусад харьяалал / ажиллах эрх") · \(Labels.membershipStatus(m.status))")
                            .font(.subheadline)
                        if let since = m.memberSince {
                            Text("Гишүүнчлэл эхэлсэн: \(Formatters.day(since))").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 2)
                }
            } header: { Text("Харьяалал ба ажиллах эрх") }

            Section {
                LabeledContent("Утас") {
                    TextField("99112233", text: $phone)
                        .multilineTextAlignment(.trailing)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .onChange(of: phone) { _, v in if v.count > 32 { phone = String(v.prefix(32)) } }
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Оршин суугаа аймаг, сум").font(.caption).foregroundStyle(.secondary)
                    TextField("Жишээ: Дархан-Уул, Дархан", text: $residence)
                    .textContentType(.addressCity)
                    .onChange(of: residence) { _, v in if v.count > 200 { residence = String(v.prefix(200)) } }
                }
                Toggle("Апп дотор шинэ мэдэгдэл хүлээн авах", isOn: $notifications)
                if let notice { notice }
                Button {
                    Task { await save() }
                } label: {
                    HStack { Spacer(); if saving { ProgressView() } else { Text("Хадгалах").bold() }; Spacer() }
                        .frame(minHeight: Theme.minTap)
                }
                .disabled(saving || app.isOffline)
            } header: {
                Text("Холбоо барих мэдээлэл")
            } footer: {
                Text("Энэ мэдээллийг та өөрөө засна. Утасны дугаарын баталгаажуулалт хийгдээгүй.")
            }

            Section("Гишүүнчлэлийн түүх") {
                if record.history.isEmpty {
                    Text("Гишүүнчлэлийн өөрчлөлт бүртгэгдээгүй байна.").foregroundStyle(.secondary)
                }
                ForEach(record.history) { h in
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(h.branch) · \(Labels.membershipStatus(h.status))").font(.subheadline.weight(.medium))
                        Text(Formatters.dateTime(h.createdAt)).font(.caption).foregroundStyle(.secondary)
                        if !h.reason.isEmpty { Text(h.reason).font(.footnote) }
                    }
                }
            }
        }
    }

    private func load() async {
        do {
            let r = try await app.api.memberRecord()
            record = r
            phone = r.profile.phone
            residence = r.profile.residence
            notifications = r.profile.notificationsEnabled
            error = nil
        } catch { self.error = APIError.wrap(error) }
    }

    private func save() async {
        saving = true; notice = nil
        defer { saving = false }
        do {
            let saved = try await app.api.saveMemberProfile(MemberProfile(phone: phone.trimmingCharacters(in: .whitespaces),
                                                                         residence: residence.trimmingCharacters(in: .whitespaces),
                                                                         notificationsEnabled: notifications))
            phone = saved.phone; residence = saved.residence; notifications = saved.notificationsEnabled
            Haptics.success()
            notice = NoticeView(text: "Хадгалагдлаа.", kind: .success)
        } catch {
            notice = NoticeView(text: APIError.wrap(error).message, kind: .error)
        }
    }
}
