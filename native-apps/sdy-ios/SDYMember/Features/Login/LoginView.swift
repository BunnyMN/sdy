import SwiftUI

struct LoginView: View {
    @EnvironmentObject var app: AppModel
    @StateObject private var model = EIDLoginModel()
    @State private var showPassword = false
    @FocusState private var regFocused: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                header
                if let reason = app.signOutReason {
                    NoticeView(text: reason, kind: .info)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Theme.cardBackground, in: RoundedRectangle(cornerRadius: 12))
                }
                card
                footer
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.groupedBackground.ignoresSafeArea())
        .sheet(isPresented: $showPassword) {
            PasswordLoginSheet { await app.signedIn() }
        }
        .onAppear {
            let appRef = app
            model.onSignedIn = { [weak appRef] in await appRef?.signedIn() }
            // A cold launch from eID's link can bump resumeTick before this view exists.
            model.resume(sessionFromLink: app.takeEIDReturnSession())
        }
        .onChange(of: app.resumeTick) { _, _ in model.resume(sessionFromLink: app.takeEIDReturnSession()) }
    }

    private var header: some View {
        VStack(spacing: 12) {
            Image("Logo")
                .resizable()
                .scaledToFill()
                .frame(width: 112, height: 112)
                .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
                .shadow(color: .black.opacity(0.15), radius: 8, y: 4)
                .accessibilityLabel("SDY лого")
            Text("esdy")
                .font(.largeTitle.bold())
            Text("Ирц, арга хэмжээ, хураамжаа нэг дороос.\neID Mongolia-аар аюулгүй нэвтэрнэ үү.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 8)
    }

    @ViewBuilder
    private var card: some View {
        VStack(alignment: .leading, spacing: 16) {
            switch model.phase {
            case .waiting(let started):
                waiting(started)
            case .success:
                HStack { ProgressView(); Text("Нэвтэрч байна…") }
                    .frame(maxWidth: .infinity, minHeight: 120)
            default:
                chooser
            }
        }
        .padding(20)
        .background(Theme.cardBackground, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    @ViewBuilder
    private var chooser: some View {
        Picker("Нэвтрэх арга", selection: $model.method) {
            ForEach(EIDLoginModel.Method.allCases) { Text($0.title).tag($0) }
        }
        .pickerStyle(.segmented)
        .disabled(model.isBusy)

        switch model.phase {
        case .expired:
            NoticeView(text: "eID хүсэлтийн хугацаа дууслаа. Дахин эхлүүлнэ үү.", kind: .error)
        case .refused:
            NoticeView(text: "Та eID Mongolia апп дээр хүсэлтээс татгалзсан байна. Дахин оролдох бол доорх товчийг дарна уу.", kind: .error)
        case .failed(let message):
            NoticeView(text: message, kind: .error)
        default:
            EmptyView()
        }

        if model.method == .registerNumber {
            VStack(alignment: .leading, spacing: 8) {
                Text("Регистрийн дугаар").font(.subheadline.weight(.semibold))
                TextField("УБ90010112", text: $model.registerNumber)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .keyboardType(.default)
                    .textContentType(.none)
                    .font(.title3.monospaced())
                    .padding(.horizontal, 14)
                    .frame(minHeight: 50)
                    .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 12))
                    .focused($regFocused)
                    .submitLabel(.go)
                    .onSubmit { if model.canStart { model.start() } }
                    .accessibilityHint("2 кирилл үсэг, 8 тоо")
                if let hint = model.registerHint {
                    Label(hint, systemImage: "exclamationmark.circle")
                        .font(.footnote).foregroundStyle(.red)
                } else {
                    Text("Латин үсгээр бичсэн ч кирилл рүү автоматаар хөрвүүлнэ. Хүсэлт таны утсан дээрх eID Mongolia апп руу очно.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
        } else {
            Text("Энэ утсан дээрх eID Mongolia апп нээгдэнэ. Баталгаажуулсны дараа энэ апп руу автоматаар буцаж ирнэ.")
                .font(.footnote).foregroundStyle(.secondary)
            if model.eidAppMissing { missingApp }
        }

        Button {
            regFocused = false
            model.start()
        } label: {
            HStack {
                if model.phase == .starting { ProgressView().tint(.white) }
                Image(systemName: "person.badge.key.fill")
                Text(model.method == .registerNumber ? "eID-ээр нэвтрэх" : "eID апп нээх")
            }
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: 50)
        }
        .buttonStyle(.borderedProminent)
        .disabled(!model.canStart)
    }

    private var missingApp: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("eID Mongolia апп энэ утсанд суугаагүй байна", systemImage: "exclamationmark.triangle.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.orange)
            Text("App Store-оос «eID Mongolia» аппыг суулгаж идэвхжүүлнэ үү. Эсвэл регистрийн дугаараараа нэвтэрч, өөр утсан дээрх eID аппаар баталгаажуулж болно.")
                .font(.footnote)
            HStack {
                Link(destination: AppConfig.eidAppStoreURL) {
                    Label("App Store", systemImage: "arrow.down.app")
                        .frame(minHeight: Theme.minTap)
                }
                Spacer()
                Button("Регистрийн дугаараар") { model.method = .registerNumber; model.eidAppMissing = false }
                    .frame(minHeight: Theme.minTap)
            }
            .font(.subheadline.weight(.semibold))
        }
        .padding(12)
        .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private func waiting(_ started: EIDStart) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "iphone.radiowaves.left.and.right")
                .font(.system(size: 40))
                .foregroundStyle(Theme.accent)
                .accessibilityHidden(true)
            Text("eID Mongolia апп дээр баталгаажуулна уу")
                .font(.headline)
                .multilineTextAlignment(.center)
            if !started.verificationCode.isEmpty {
                VStack(spacing: 4) {
                    Text("Баталгаажуулах код").font(.caption).foregroundStyle(.secondary)
                    Text(started.verificationCode)
                        .font(.system(size: 52, weight: .bold, design: .rounded).monospacedDigit())
                        .tracking(6)
                        .accessibilityLabel("Баталгаажуулах код \(started.verificationCode.map(String.init).joined(separator: " "))")
                }
            }
            Text(model.method == .registerNumber
                 ? "Утсан дээрх eID Mongolia аппад ирсэн хүсэлтийг нээж, код таарч байгааг шалгаад PIN1-ээ оруулна уу."
                 : "eID Mongolia аппад код таарч байгааг шалгаад PIN1-ээ оруулна уу. Баталгаажсаны дараа энд буцаж ирнэ.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            HStack(spacing: 8) {
                ProgressView()
                if let left = model.secondsLeft {
                    Text("Хүлээж байна · \(Formatters.clock(left))").monospacedDigit()
                } else {
                    Text("Хүлээж байна…")
                }
            }
            .font(.subheadline)
            .accessibilityElement(children: .combine)
            if model.method == .samePhone, let link = started.appLink, let url = URL(string: link) {
                Button {
                    UIApplication.shared.open(url)
                } label: {
                    Label("eID апп дахин нээх", systemImage: "arrow.up.forward.app").frame(maxWidth: .infinity, minHeight: Theme.minTap)
                }
                .buttonStyle(.bordered)
            }
            Button("Цуцлах", role: .cancel) { model.cancel() }
                .frame(minHeight: Theme.minTap)
        }
        .frame(maxWidth: .infinity)
    }

    private var footer: some View {
        VStack(spacing: 12) {
            Button("Нууц үгээр нэвтрэх") { showPassword = true }
                .font(.footnote)
                .frame(minHeight: Theme.minTap)
                .disabled(model.isBusy)
            HStack(spacing: 20) {
                Link("Нууцлалын бодлого", destination: AppConfig.privacyURL)
                Link("Тусламж", destination: AppConfig.supportURL)
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
    }
}

struct PasswordLoginSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onSignedIn: () async -> Void
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Имэйл", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Нууц үг", text: $password)
                        .textContentType(.password)
                } footer: {
                    Text("Зөвхөн салбараас нууц үг олгосон бүртгэлд зориулагдсан. Бусад тохиолдолд eID Mongolia-аар нэвтэрнэ үү.")
                }
                if let error {
                    Section { NoticeView(text: error, kind: .error) }
                }
                Section {
                    Button {
                        Task { await submit() }
                    } label: {
                        HStack {
                            Spacer()
                            if busy { ProgressView() } else { Text("Нэвтрэх").bold() }
                            Spacer()
                        }
                        .frame(minHeight: Theme.minTap)
                    }
                    .disabled(busy || email.isEmpty || password.isEmpty)
                }
            }
            .navigationTitle("Нууц үгээр нэвтрэх")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Болих") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func submit() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            _ = try await APIClient.shared.login(email: email.trimmingCharacters(in: .whitespaces), password: password)
            guard APIClient.shared.tokens.hasToken else {
                error = "Нэвтрэх эрх олгогдсонгүй. Дахин оролдоно уу."
                return
            }
            dismiss()
            await onSignedIn()
        } catch {
            let api = APIError.wrap(error)
            self.error = api.status == 401 || api.status == 400 ? "Имэйл эсвэл нууц үг буруу байна." : api.message
        }
    }
}
