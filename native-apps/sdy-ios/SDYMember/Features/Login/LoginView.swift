import CoreMotion
import SwiftUI

struct LoginView: View {
    @EnvironmentObject var app: AppModel
    @StateObject private var model = EIDLoginModel()
    @StateObject private var reel = PosterReel()
    @State private var showPassword = false
    @FocusState private var regFocused: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                header
                VStack(spacing: 16) {
                    if let reason = app.signOutReason {
                        NoticeView(text: reason, kind: .info)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(Theme.cardRaised, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    card
                    footer
                }
                .padding(.horizontal, 16)
                .padding(.top, 22)
                .padding(.bottom, 28)
                .frame(maxWidth: .infinity)
                .background(
                    UnevenRoundedRectangle(topLeadingRadius: 32, topTrailingRadius: 32, style: .continuous)
                        .fill(Color(red: 0.05, green: 0.055, blue: 0.075))
                        .ignoresSafeArea(edges: .bottom)
                )
            }
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .scrollIndicators(.hidden)
        .background(alignment: .top) {
            PosterBackdrop(reel: reel, height: 640).ignoresSafeArea()
        }
        .background(Color(red: 0.05, green: 0.055, blue: 0.075).ignoresSafeArea())
        .sheet(isPresented: $showPassword) {
            PasswordLoginSheet { await app.signedIn() }
        }
        .onAppear {
            reel.start()
            let appRef = app
            model.onSignedIn = { [weak appRef] in await appRef?.signedIn() }
            // A cold launch from eID's link can bump resumeTick before this view exists.
            model.resume(sessionFromLink: app.takeEIDReturnSession())
        }
        .onChange(of: app.resumeTick) { _, _ in model.resume(sessionFromLink: app.takeEIDReturnSession()) }
        .onDisappear { reel.stop() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image("Logo")
                    .resizable()
                    .scaledToFill()
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityLabel("SDY лого")
                Text("Монголын залуучуудын тэргүүлэгч дэвшилтэт дуу хоолой")
                    .font(.subheadline.weight(.medium).italic())
                    .foregroundStyle(.white.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, 24)

            WordmarkArt()
                .frame(height: 230)
                .frame(maxWidth: .infinity)
                .padding(.top, 34)

            PosterCaption(reel: reel)
                .padding(.top, 8)
                .padding(.bottom, 30)
        }
        .padding(.horizontal, 20)
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
        .padding(18)
        .background(Color(red: 0.11, green: 0.12, blue: 0.15), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(.white.opacity(0.06), lineWidth: 1))
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
                    .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
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
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 54)
            .background(Theme.brandRed.opacity(model.canStart ? 1 : 0.4), in: Capsule())
        }
        .buttonStyle(PressableStyle())
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
        VStack(spacing: 22) {
            Button { showPassword = true } label: {
                Text("Нууц үгээр нэвтрэх")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 54)
                    .background(Color(red: 0.11, green: 0.12, blue: 0.15), in: Capsule())
                    .overlay(Capsule().strokeBorder(.white.opacity(0.06), lineWidth: 1))
            }
            .buttonStyle(PressableStyle())
            .disabled(model.isBusy)

            HStack(spacing: 8) {
                QuickLink(title: "Вэбсайт", systemImage: "globe", url: AppConfig.websiteURL)
                QuickLink(title: "Нууцлал", systemImage: "hand.raised.fill", url: AppConfig.privacyURL)
                QuickLink(title: "Тусламж", systemImage: "questionmark", url: AppConfig.supportURL)
            }
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

/// A round-cornered square link with its label below, under the sign-in sheet.
private struct QuickLink: View {
    let title: String
    let systemImage: String
    let url: URL

    var body: some View {
        Link(destination: url) {
            VStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.75))
                    .frame(width: 64, height: 64)
                    .background(Color(red: 0.11, green: 0.12, blue: 0.15), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                Text(title).font(.subheadline).foregroundStyle(.white.opacity(0.6))
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(PressableStyle(scale: 0.9))
    }
}

/// The SDY Darkhan-Uul wordmark in silver on the silk: a sweep of light runs
/// across the letters every few seconds, and the mark tilts a little as the
/// phone does, so the metal seems to catch the room's light. Still when
/// Reduce Motion is on.
struct WordmarkArt: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var tilt = DeviceTilt()

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { context in
            let t = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
            // One sweep every 4 s: it crosses in the first 1.4 s, then rests.
            let cycle = t.truncatingRemainder(dividingBy: 4) / 1.4
            let sweep = min(cycle, 1.2)
            ZStack {
                Ellipse()
                    .fill(RadialGradient(colors: [Theme.brandRed.opacity(0.55), .clear],
                                         center: .center, startRadius: 10, endRadius: 190))
                    .frame(width: 380, height: 240)
                    .blur(radius: 10)

                mark
                    .overlay {
                        LinearGradient(stops: [
                            .init(color: .clear, location: 0),
                            .init(color: .white.opacity(0.85), location: 0.5),
                            .init(color: .clear, location: 1),
                        ], startPoint: .leading, endPoint: .trailing)
                        .frame(width: 110)
                        .rotationEffect(.degrees(18))
                        .offset(x: -260 + 520 * sweep)
                        .blendMode(.plusLighter)
                        .mask(mark)
                        .allowsHitTesting(false)
                    }
                    .shadow(color: .black.opacity(0.6), radius: 14, y: 12)
                    .shadow(color: Theme.brandRed.opacity(0.35), radius: 30, y: 6)
                    .rotation3DEffect(.degrees(tilt.pitch * 10), axis: (x: 1, y: 0, z: 0), perspective: 0.6)
                    .rotation3DEffect(.degrees(tilt.roll * 14), axis: (x: 0, y: 1, z: 0), perspective: 0.6)
            }
        }
        .onAppear { if !reduceMotion { tilt.start() } }
        .onDisappear { tilt.stop() }
        .accessibilityHidden(true)
    }

    private var mark: some View {
        Image("Wordmark")
            .resizable()
            .scaledToFit()
            .frame(width: 300)
    }
}

/// How far the phone leans from where it was when the screen opened, in
/// units of roughly a quarter turn, smoothed and clamped. Device motion needs
/// no permission.
@MainActor
final class DeviceTilt: ObservableObject {
    @Published var pitch: Double = 0
    @Published var roll: Double = 0
    private let manager = CMMotionManager()
    private var reference: CMAttitude?

    func start() {
        guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
        manager.deviceMotionUpdateInterval = 1 / 30
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let self, let attitude = motion?.attitude else { return }
            if self.reference == nil { self.reference = attitude.copy() as? CMAttitude }
            if let reference = self.reference { attitude.multiply(byInverseOf: reference) }
            let clamp: (Double) -> Double = { max(-1, min(1, $0 / (.pi / 4))) }
            self.pitch += (clamp(attitude.pitch) - self.pitch) * 0.15
            self.roll += (clamp(attitude.roll) - self.roll) * 0.15
        }
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
        reference = nil
    }
}
