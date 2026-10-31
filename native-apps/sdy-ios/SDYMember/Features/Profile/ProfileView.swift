import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var app: AppModel
    @State private var path: [HomeRoute] = []
    @State private var confirmLogout = false

    var body: some View {
        NavigationStack(path: $path) {
            HeroScaffold(heroHeight: 420, compact: AnyView(
                HStack(spacing: 10) {
                    AvatarView(size: 32)
                    Text(cardName).font(.headline).foregroundStyle(.white).lineLimit(1)
                }
            ), pinned: AnyView(topRow), pullZoom: 1 / 450) {
                header
            } content: {
                if app.hasApprovedBranch {
                    HStack(spacing: 12) {
                        tile(.participation, "Ирц ба оноо", "star.fill")
                        tile(.leaderboard, "Тэргүүлэгчид", "trophy.fill")
                    }
                    .rise(0)
                }

                RowGroup {
                    row(.record, "Миний гишүүнчлэл", "person.text.rectangle.fill")
                    RowDivider()
                    row(.transfers, "Харьяалал шилжүүлэх", "arrow.left.arrow.right")
                    RowDivider()
                    row(.notifications, "Мэдэгдэл", "bell.fill", trailing: app.unreadCount > 0 ? "\(app.unreadCount)" : nil)
                    if app.hasApprovedBranch {
                        RowDivider()
                        row(.history, "Миний оролцоо, төлөлтийн түүх", "clock.arrow.circlepath")
                    }
                }
                .rise(1)

                RowGroup {
                    Link(destination: AppConfig.privacyURL) {
                        IconRow(title: "Нууцлалын бодлого", systemImage: "hand.raised.fill")
                    }
                    .buttonStyle(PressableStyle(scale: 0.98))
                    RowDivider()
                    Link(destination: AppConfig.supportURL) {
                        IconRow(title: "Тусламж, холбоо барих", systemImage: "questionmark")
                    }
                    .buttonStyle(PressableStyle(scale: 0.98))
                    RowDivider()
                    row(.appearance, "Өнгө төрх", "paintbrush.fill")
                    RowDivider()
                    row(.about, "Апп-ын тухай", "info")
                }
                .rise(2)

                RowGroup {
                    Button { confirmLogout = true } label: {
                        IconRow(title: "Гарах", systemImage: "rectangle.portrait.and.arrow.right", chevron: false)
                    }
                    .buttonStyle(PressableStyle(scale: 0.98))
                    RowDivider()
                    NavigationLink(value: HomeRoute.deleteAccount) {
                        IconRow(title: "Бүртгэл устгах", systemImage: "trash.fill", tint: .white, tile: .red)
                    }
                    .buttonStyle(PressableStyle(scale: 0.98))
                }
                .rise(3)
            }
            .toolbar(.hidden, for: .navigationBar)
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

    private var header: some View {
        VStack(spacing: 0) {
            // Room for the pinned round buttons (topRow), drawn by HeroScaffold.
            Color.clear.frame(height: 120)

            Spacer(minLength: 0)

            EditableAvatar()

            Text(cardName)
                .font(.title2.weight(.bold))
                .foregroundStyle(.white)
                .padding(.top, 18)
                .lineLimit(1).minimumScaleFactor(0.7)
            if let branch = app.record?.approvedBranch {
                if let position = Labels.position(branch.position) {
                    Label(position, systemImage: "star.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14).padding(.vertical, 7)
                        .background(.ultraThinMaterial, in: Capsule())
                        .overlay(Capsule().strokeBorder(.white.opacity(0.18), lineWidth: 1))
                        .padding(.top, 10)
                        .accessibilityLabel("Албан тушаал: \(position)")
                }
                Label(branch.name, systemImage: "building.2.fill")
                    .font(.subheadline).foregroundStyle(.white.opacity(0.7))
                    .padding(.top, 8)
            } else if let email = app.me?.email, !email.isEmpty {
                Text(email).font(.subheadline).foregroundStyle(.white.opacity(0.7)).padding(.top, 6)
            }
            Spacer(minLength: 0).frame(height: 56)
        }
        .padding(.horizontal, 20)
        .accessibilityElement(children: .contain)
    }

    /// The round buttons: held in place by HeroScaffold.
    private var topRow: some View {
        HStack {
            GlassCircleButton(systemImage: "bell.fill", label: "Мэдэгдэл", dot: app.unreadCount > 0) {
                path.append(.notifications)
            }
            Spacer()
            GlassCircleButton(systemImage: "power", label: "Гарах") { confirmLogout = true }
        }
    }

    /// "Батболд Ганзориг" → "Б. ГАНЗОРИГ".
    private var cardName: String {
        let parts = (app.me?.name ?? "").split(separator: " ").map(String.init)
        guard parts.count >= 2, let initial = parts[0].first else { return (app.me?.name ?? "—").uppercased() }
        return "\(initial). \(parts[1])".uppercased()
    }

    private func tile(_ route: HomeRoute, _ title: String, _ icon: String) -> some View {
        NavigationLink(value: route) {
            VStack(alignment: .leading, spacing: 18) {
                Image(systemName: icon)
                    .font(.system(size: 22, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(LinearGradient(colors: [Theme.brandRed, Theme.brandRed.opacity(0.7)],
                                               startPoint: .top, endPoint: .bottom),
                                in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                Text(title).font(.body.weight(.semibold)).foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(.white.opacity(0.06), lineWidth: 1))
        }
        .buttonStyle(PressableStyle())
    }

    private func row(_ route: HomeRoute, _ title: String, _ icon: String, trailing: String? = nil) -> some View {
        NavigationLink(value: route) {
            IconRow(title: title, systemImage: icon, trailing: trailing)
        }
        .buttonStyle(PressableStyle(scale: 0.98))
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
                        if let position = Labels.position(m.position) {
                            Text("Албан тушаал: \(position)").font(.subheadline.weight(.semibold))
                        }
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
