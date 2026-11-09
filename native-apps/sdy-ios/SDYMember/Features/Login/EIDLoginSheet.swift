import SwiftUI

/// eID Mongolia's sign-in dialog, after Gerege Nexus's native widget
/// (`EIDLoginWidget.swift`): it opens already under way — the session is
/// started and handed to the eID app on this phone — and shows the code to
/// match, a draining timer and the steps. No eID app here: the registration
/// number instead, and the request goes to the eID app wherever it is.
struct EIDLoginSheet: View {
    @ObservedObject var model: EIDLoginModel
    let onClose: () -> Void
    @FocusState private var regFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            head
            Divider().overlay(Night.line.opacity(0.12))
            ScrollView {
                content
                    .padding(20)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
            foot
        }
        .background(Color(hex: 0x141012).ignoresSafeArea())
        .foregroundStyle(.white)
        .presentationDetents([.large])
        .presentationBackground(Color(hex: 0x141012))
        .interactiveDismissDisabled(model.phase == .success)
    }

    // MARK: Head — the wordmark, «Нэвтрэх» and the host, close

    private var head: some View {
        HStack(spacing: 12) {
            Image("EIDWordmark").renderingMode(.template).resizable().scaledToFit()
                .frame(height: 16)
                .foregroundStyle(Color(hex: 0x0F2A3D))
                .padding(.horizontal, 14).padding(.vertical, 12)
                .background(Capsule().fill(.white))
                .accessibilityLabel("e-ID")
            VStack(alignment: .leading, spacing: 2) {
                Text("Нэвтрэх").font(.system(size: 18, weight: .heavy))
                Text(AppConfig.host)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Night.muted)
            }
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark").font(.system(size: 13, weight: .semibold))
                    .frame(width: 38, height: 38)
                    .background(Circle().fill(Color.white.opacity(0.06)))
                    .overlay(Circle().strokeBorder(Night.line.opacity(0.18)))
                    .frame(width: Theme.minTap, height: Theme.minTap)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(model.phase == .success)
            .accessibilityLabel("Хаах")
        }
        .padding(.leading, 20).padding(.trailing, 14).padding(.top, 18).padding(.bottom, 14)
    }

    // MARK: Body

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .starting:
            HStack(spacing: 8) {
                ProgressView().tint(.white)
                Text("Хүсэлт үүсгэж байна…")
            }
            .foregroundStyle(Night.muted)
            .frame(maxWidth: .infinity).padding(.vertical, 48)
        case .waiting(let started):
            waiting(started)
        case .success:
            VStack(spacing: 8) {
                Image(systemName: "checkmark").font(.system(size: 30, weight: .bold))
                    .foregroundStyle(Color(hex: 0x4CD29A))
                    .frame(width: 72, height: 72)
                    .background(Circle().fill(Color(hex: 0x173A2F)))
                    .padding(10).background(Circle().fill(Color(hex: 0x173A2F).opacity(0.5)))
                    .padding(.bottom, 4)
                Text("Амжилттай нэвтэрлээ").font(.system(size: 18, weight: .heavy))
                Text("Түр хүлээнэ үү…").font(.system(size: 13.5)).foregroundStyle(Night.muted)
            }
            .frame(maxWidth: .infinity).padding(.top, 32).padding(.bottom, 12)
            .accessibilityElement(children: .combine)
        case .expired, .refused, .failed:
            VStack(alignment: .leading, spacing: 16) {
                alert(failure)
                Button(action: retry) {
                    Label("Дахин оролдох", systemImage: "arrow.clockwise").primaryNight()
                }
                .buttonStyle(PressableStyle())
                .disabled(!model.canStart)
            }
        case .idle:
            if model.method == .registerNumber {
                registration
            } else {
                // Only between a cancel and the next start.
                Button { model.startHere() } label: {
                    Label("eID Mongolia апп-аар нээх", systemImage: "iphone").primaryNight()
                }
                .buttonStyle(PressableStyle())
            }
        }
    }

    private var failure: String {
        switch model.phase {
        case .expired: return "eID хүсэлтийн хугацаа дууслаа. Дахин эхлүүлнэ үү."
        case .refused: return "Та eID Mongolia апп дээр хүсэлтээс татгалзсан байна."
        case .failed(let message): return message
        default: return ""
        }
    }

    private func retry() {
        model.method == .registerNumber ? model.start() : model.startHere()
    }

    @ViewBuilder
    private func waiting(_ started: EIDStart) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            if model.method == .samePhone {
                Button { Task { await EIDLoginModel.openApp(started) } } label: {
                    Label("eID Mongolia апп-аар нээх", systemImage: "iphone").primaryNight()
                }
                .buttonStyle(PressableStyle())
                .disabled(started.appLink == nil)
                steps(["eID Mongolia апп-аа нээгээд хүсэлтийг зөвшөөрнө үү.",
                       "Код ижил эсэхийг шалгана.",
                       "PIN1 оруулж «Зөвшөөрөх» дарна. Дараа нь энд буцаж ирнэ."])
            } else {
                Label {
                    Text("Апп руу хүсэлт илгээлээ").font(.system(size: 16, weight: .heavy))
                } icon: {
                    Image(systemName: "iphone.radiowaves.left.and.right").foregroundStyle(Night.rose)
                        .frame(width: 40, height: 40)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Night.glow.opacity(0.18)))
                }
                Text("Утсан дээрх eID Mongolia аппад ирсэн хүсэлтийг нээж, код таарч байгааг шалгаад PIN1-ээ оруулна уу.")
                    .font(.system(size: 13.5)).foregroundStyle(Night.muted).lineSpacing(3)
            }
            if !started.verificationCode.isEmpty { code(started.verificationCode) }
            timer
        }
    }

    /// «Хүчинтэй 2:58» over a bar that drains, amber for the last half minute.
    @ViewBuilder
    private var timer: some View {
        if let left = model.secondsLeft {
            let low = left <= 30
            VStack(spacing: 6) {
                HStack {
                    Text("Хүчинтэй")
                    Spacer()
                    Text(Formatters.clock(left)).font(.system(size: 12.5, weight: .bold, design: .monospaced))
                }
                .font(.system(size: 12.5, weight: .bold)).foregroundStyle(Night.muted)
                GeometryReader { g in
                    Capsule().fill(Color.white.opacity(0.08))
                        .overlay(alignment: .leading) {
                            Capsule().fill(low ? Color.orange : Night.accent)
                                .frame(width: g.size.width * min(1, max(0, Double(left) / Double(model.totalSeconds))))
                                .animation(.linear(duration: 1), value: left)
                        }
                }
                .frame(height: 6)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Хүчинтэй хугацаа \(Formatters.clock(left))")
        } else {
            HStack(spacing: 8) { ProgressView().tint(.white); Text("Хүлээж байна…") }
                .font(.subheadline).foregroundStyle(Night.muted)
        }
    }

    /// The code as the eID app shows it, a box per digit.
    private func code(_ vc: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("БАТАЛГААЖУУЛАХ КОД").font(.system(size: 11.5, weight: .heavy)).kerning(0.9)
                Spacer()
                Image(systemName: "checkmark.shield")
            }
            .foregroundStyle(Night.rose)
            HStack(spacing: 8) {
                ForEach(Array(vc.enumerated()), id: \.offset) { _, c in
                    Text(String(c)).font(.system(size: 28, weight: .bold, design: .monospaced))
                        .frame(maxWidth: 56, minHeight: 58)
                        .frame(maxWidth: .infinity)
                        .background(RoundedRectangle(cornerRadius: 14).fill(Color.black.opacity(0.35)))
                        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Night.glow.opacity(0.45)))
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Баталгаажуулах код \(vc.map(String.init).joined(separator: " "))")
            (Text("Апп дээрх код ижил биш бол ") + Text("татгалзана").bold().foregroundColor(.white) + Text(" уу."))
                .font(.system(size: 12.5)).foregroundStyle(Night.muted)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 20).fill(LinearGradient(
            colors: [Night.glow.opacity(0.16), Night.glow.opacity(0.06)], startPoint: .topLeading, endPoint: .bottomTrailing)))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(Night.glow.opacity(0.3)))
    }

    private func steps(_ list: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(list.enumerated()), id: \.offset) { i, s in
                HStack(spacing: 12) {
                    Text("\(i + 1)").font(.system(size: 12, weight: .bold, design: .monospaced)).foregroundStyle(Night.rose)
                        .frame(width: 26, height: 26).background(Circle().fill(Night.glow.opacity(0.18)))
                    Text(s).font(.system(size: 13.5, weight: .semibold)).foregroundStyle(Night.silver)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var registration: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let notice = model.notice { alert(notice) }
            VStack(alignment: .leading, spacing: 4) {
                Text("Регистрийн дугаараар нэвтрэх").font(.system(size: 18, weight: .bold))
                Text("Таны eID Mongolia апп руу баталгаажуулах хүсэлт очно.")
                    .font(.system(size: 13.5)).foregroundStyle(Night.muted)
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("Регистрийн дугаар").font(.system(size: 13, weight: .bold))
                HStack(spacing: 12) {
                    Image(systemName: "person.text.rectangle").foregroundStyle(Night.muted)
                    TextField("", text: $model.registerNumber, prompt: Text("УБ90010112").foregroundColor(Night.muted.opacity(0.7)))
                        .textFieldStyle(.plain)
                        .font(.system(size: 17, weight: .medium, design: .monospaced))
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .textContentType(.none)
                        .submitLabel(.send)
                        .focused($regFocused)
                        .onSubmit { if model.canStart { model.start() } }
                        .accessibilityLabel("Регистрийн дугаар")
                        .accessibilityHint("2 кирилл үсэг, 8 тоо")
                }
                .padding(.horizontal, 16).frame(height: 52)
                .background(Capsule().fill(Color.white.opacity(0.06)))
                .overlay(Capsule().strokeBorder(Night.line.opacity(0.18)))
                if let hint = model.registerHint {
                    Label(hint, systemImage: "exclamationmark.circle")
                        .font(.footnote).foregroundStyle(Color(hex: 0xFDA29B))
                } else {
                    Text("2 үсэг, 8 тоо. Латинаар бичсэн ч кирилл рүү хөрвүүлнэ.")
                        .font(.footnote).foregroundStyle(Night.muted)
                }
            }
            Button {
                regFocused = false
                model.start()
            } label: {
                Text("Апп руу хүсэлт илгээх").primaryNight().opacity(model.canStart ? 1 : 0.45)
            }
            .buttonStyle(PressableStyle())
            .disabled(!model.canStart)
        }
        .onAppear { if model.notice == nil { regFocused = true } }
    }

    private func alert(_ message: String) -> some View {
        Text(message).font(.system(size: 13.5)).foregroundStyle(Color(hex: 0xFDA29B))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14).fill(Color(hex: 0x3B1210)))
    }

    // MARK: Foot — the other way in; the PIN line and the app

    private var foot: some View {
        VStack(alignment: .leading, spacing: 12) {
            if model.phase != .success {
                if model.method == .samePhone {
                    other("Регистрийн дугаараар", icon: "person.text.rectangle") { model.showRegistration() }
                } else {
                    other("Энэ утсан дээрх eID апп-аар", icon: "iphone") { model.startHere() }
                }
            }
            HStack(spacing: 6) {
                Image(systemName: "lock.shield").foregroundStyle(Color(hex: 0x4CD29A))
                Text("PIN зөвхөн eID апп дотор ·")
                Link("Апп татах", destination: AppConfig.eidAppStoreURL)
                    .fontWeight(.bold).foregroundStyle(Night.silver)
            }
            .font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Night.muted)
        }
        .padding(.horizontal, 20).padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.black.opacity(0.25).ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Divider().overlay(Night.line.opacity(0.12)) }
    }

    private func other(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.system(size: 13.5, weight: .bold))
                .foregroundStyle(Night.silver)
                .padding(.horizontal, 16).frame(minHeight: Theme.minTap)
                .background(Capsule().fill(Color.white.opacity(0.05)))
                .overlay(Capsule().strokeBorder(Night.line.opacity(0.2)))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
