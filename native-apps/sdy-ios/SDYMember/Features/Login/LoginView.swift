import SwiftUI

/// The sign-in screen: a night sky in SDY's red and silver, the logo, the
/// wordmark, one «e-ID | Нэвтрэх» button. The layout follows Gerege Nexus's
/// mobile sign-in (native-apps/mobile/ios in gerege-systems/nexus); the
/// colours are SDY's.
///
/// eID Mongolia is the way in. The button opens `EIDLoginSheet`, which starts
/// a session at once and hands it to the eID app on this phone. The password
/// sheet stays behind a small link in the fine print: accounts a branch gave a
/// password to, and App Review's demo account, which has no eID.
struct LoginView: View {
    @EnvironmentObject var app: AppModel
    @StateObject private var model = EIDLoginModel()
    @State private var showEID = false
    @State private var showPassword = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack(alignment: .top) {
            Night.sky.ignoresSafeArea()
            scene
            VStack(spacing: 12) {
                header
                    .padding(.top, 4)
                Spacer(minLength: 0)
                VStack(spacing: 16) {
                    Spacer(minLength: 0)
                    if let reason = app.signOutReason {
                        NoticeView(text: reason, kind: .info)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(Theme.cardRaised.opacity(0.8), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    eidButton
                        .padding(.bottom, 96)
                    fineprint
                        .padding(.bottom, 8)
                }
                .frame(minHeight: 300)
                .fixedSize(horizontal: false, vertical: true)
                // The button and its fine print sit over the picture: the floor fades out behind them.
                .background(alignment: .top) {
                    VStack(spacing: 0) {
                        LinearGradient(colors: [Night.sky.opacity(0), Night.sky], startPoint: .top, endPoint: .bottom)
                            .frame(height: 60)
                        Night.sky
                    }
                    .padding(.horizontal, -24)
                    .padding(.top, -60)
                    .ignoresSafeArea(edges: .bottom)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 8)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .foregroundStyle(.white)
        // The fine print's «Нууц үгээр» is a link to this screen, not a web page.
        .environment(\.openURL, OpenURLAction { url in
            guard url == Self.passwordLink else { return .systemAction }
            showPassword = true
            return .handled
        })
        .sheet(isPresented: $showEID, onDismiss: dismissedEID) {
            EIDLoginSheet(model: model) { showEID = false }
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showPassword) {
            PasswordLoginSheet { await app.signedIn() }
        }
        .onAppear {
            let appRef = app
            model.onSignedIn = { [weak appRef] in await appRef?.signedIn() }
            // A cold launch from eID's link can bump resumeTick before this view exists.
            model.resume(sessionFromLink: app.takeEIDReturnSession())
            #if DEBUG
            if AppConfig.launchArgument("-SDYLoginSheet") == "register" {
                model.showRegistration()
                showEID = true
            }
            #endif
        }
        .onChange(of: app.resumeTick) { _, _ in model.resume(sessionFromLink: app.takeEIDReturnSession()) }
        // eID's link reopened the app on a session this phone started: show where it stands.
        .onChange(of: model.phase) { _, phase in
            if case .waiting = phase, !showEID { showEID = true }
        }
    }

    /// Swiped away mid-way: nothing keeps waiting on eID behind the screen.
    private func dismissedEID() {
        if model.phase != .success { model.cancel() }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("СДМЗХ · ГИШҮҮНИЙ АПП")
                .font(.system(size: 12.5))
                .kerning(0.75)
                .foregroundStyle(Night.muted)
            Spacer()
            Link(destination: AppConfig.supportURL) {
                Image(systemName: "questionmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Night.silver)
                    .frame(width: 34, height: 34)
                    .background(Color.white.opacity(0.05), in: Circle())
                    .overlay(Circle().strokeBorder(Night.line.opacity(0.22), lineWidth: 1))
                    .frame(width: Theme.minTap, height: Theme.minTap)
                    .contentShape(Circle())
            }
            .accessibilityLabel("Тусламж")
        }
        .frame(minHeight: 36)
    }

    // MARK: - The scene

    /// The artwork and what sits in it — the sun and the motto —
    /// all placed in the artwork's 390×560 space scaled to the screen's width,
    /// so the logo stays at the orbits' centre on every iPhone. The orbits are
    /// drawn in two halves: the far half under the sun, the near half over it.
    private var scene: some View {
        GeometryReader { proxy in
            let w = proxy.size.width, s = w / 390
            ZStack(alignment: .topLeading) {
                // The orbits turn slowly, like a small solar system; still under Reduce Motion.
                TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { context in
                    let t = reduceMotion ? Self.stillTime : context.date.timeIntervalSinceReferenceDate
                    ZStack(alignment: .topLeading) {
                        Canvas { ctx, size in Self.draw(&ctx, size, t: t, layer: .back) }
                        SunLogo(diameter: 88 * s, t: t)
                            .position(x: Self.center.x * s, y: Self.center.y * s)
                        Canvas { ctx, size in Self.draw(&ctx, size, t: t, layer: .front) }
                    }
                }
                .accessibilityHidden(true)

                (Text("Монголын залуучуудын\n").foregroundColor(Night.silver)
                 + Text("тэргүүлэгч дэвшилтэт дуу хоолой.").foregroundColor(Night.rose))
                    .font(.system(size: 17, weight: .semibold))
                    .lineSpacing(5)
                    .multilineTextAlignment(.center)
                    .shadow(color: Night.sky, radius: 6)
                    .frame(width: w - 48)
                    .position(x: w / 2, y: 384 * s)
            }
            .frame(width: w, height: w * 560 / 390)
        }
        .ignoresSafeArea()
    }

    // MARK: - The way in

    private var eidButton: some View {
        Button {
            showEID = true
            model.startHere()
        } label: {
            HStack(spacing: 10) {
                Image("EIDWordmark")
                    .renderingMode(.template)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(height: 17)
                    .accessibilityLabel("e-ID")
                Rectangle().fill(.white.opacity(0.32)).frame(width: 1, height: 20)
                Text("Нэвтрэх")
            }
            .primaryNight()
        }
        .buttonStyle(PressableStyle())
        .disabled(model.isBusy)
        .accessibilityHint("eID Mongolia аппаар баталгаажуулна")
    }

    static let passwordLink = URL(string: "sdy-login:password")!

    private var fineprint: some View {
        let links = "[Нууцлал](\(AppConfig.privacyURL.absoluteString)) · [Тусламж](\(AppConfig.supportURL.absoluteString)) · [Нууц үгээр нэвтрэх](\(Self.passwordLink.absoluteString))"
        return VStack(spacing: 6) {
            Text("eID Mongolia-аар баталгаажсан иргэн нэвтэрнэ.")
            Text((try? AttributedString(markdown: links)) ?? AttributedString(links))
        }
        .font(.system(size: 12))
        .foregroundStyle(Night.muted)
        .tint(Night.silver)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
    }

    // MARK: - The sky

    /// A 390×560 artwork, scaled to the screen's width: twinkling stars, a red
    /// glow that breathes, three tilted orbits with a silver body going round
    /// each (brighter and larger in front, dim behind, a fading trail), and a
    /// floor grid to the horizon. `t` is seconds; the picture repeats smoothly.
    enum Layer { case back, front }

    /// The orbits' centre in the artwork, where the sun stands.
    static let center = CGPoint(x: 195, y: 250)

    private static func draw(_ ctx: inout GraphicsContext, _ size: CGSize, t: Double, layer: Layer) {
        let w: CGFloat = 390, h: CGFloat = 560
        let s = size.width / w
        ctx.scaleBy(x: s, y: s)
        let red = Color(hex: 0xE0464F)
        if layer == .front {
            drawOrbits(&ctx, t: t, near: true)
            return
        }

        for (i, (x, y, r, o)) in stars.enumerated() {
            // Each star its own pace and phase, between 45 % and 100 % of its light.
            let pace = 0.6 + Double(i % 7) * 0.17
            let twinkle = 0.725 + 0.275 * sin(t * pace + Double(x * 0.37 + y * 0.11))
            ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(.white.opacity(o * twinkle)))
        }

        let breath = 1 + 0.12 * sin(t * 2 * .pi / 7)
        var glow = ctx
        glow.scaleBy(x: w, y: h)
        glow.fill(Path(CGRect(x: 0, y: 0, width: 1, height: 1)), with: .radialGradient(
            Gradient(stops: [
                .init(color: Color(hex: 0xC3242E).opacity(0.55 * breath), location: 0),
                .init(color: Color(hex: 0x7A1219).opacity(0.2 * breath), location: 0.45),
                .init(color: Night.sky.opacity(0), location: 1),
            ]),
            center: CGPoint(x: 0.5, y: 0.45), startRadius: 0, endRadius: 0.55))

        var floor = Path()
        for i in 0...20 {
            floor.move(to: CGPoint(x: 145 + 5 * CGFloat(i), y: 430))
            floor.addLine(to: CGPoint(x: -355 + 55 * CGFloat(i), y: 560))
        }
        for y: CGFloat in [430, 437, 446.8, 460.5, 479.7, 506.6, 544.3] {
            floor.move(to: CGPoint(x: 0, y: y))
            floor.addLine(to: CGPoint(x: w, y: y))
        }
        ctx.stroke(floor, with: .linearGradient(
            Gradient(colors: [red.opacity(0), red.opacity(0.4)]),
            startPoint: CGPoint(x: 0, y: 430), endPoint: CGPoint(x: 0, y: 560)), lineWidth: 1)
        var horizon = Path()
        horizon.move(to: CGPoint(x: 0, y: 430))
        horizon.addLine(to: CGPoint(x: w, y: 430))
        ctx.stroke(horizon, with: .color(Color(hex: 0xF08A90).opacity(0.5)), lineWidth: 1)

        drawOrbits(&ctx, t: t, near: false)
    }

    /// One half of every ring and what is on it: the near half (lower on
    /// screen, in front of the sun) or the far half (behind it).
    private static func drawOrbits(_ ctx: inout GraphicsContext, t: Double, near: Bool) {
        let red = Color(hex: 0xE0464F)
        // The plane of the orbits rocks a little, so the system seems to turn in space.
        var plane = ctx
        plane.translateBy(x: center.x, y: center.y)
        plane.rotate(by: .degrees(-14 + 2.5 * sin(t * 2 * .pi / 24)))
        let node = Night.silver
        for orbit in orbits {
            let (rx, ry) = (orbit.rx, orbit.ry)
            func point(_ a: Double) -> CGPoint { CGPoint(x: rx * CGFloat(cos(a)), y: ry * CGFloat(sin(a))) }
            // 0…π is the near half (sin ≥ 0), π…2π the far one.
            var arc = Path()
            let from = near ? 0.0 : Double.pi
            for i in 0...64 {
                let p = point(from + Double.pi * Double(i) / 64)
                if i == 0 { arc.move(to: p) } else { arc.addLine(to: p) }
            }
            plane.stroke(arc, with: .color(red.opacity(orbit.opacity)), lineWidth: 1)

            let angle = orbit.start + t * 2 * .pi / orbit.period
            func onThisSide(_ a: Double) -> Bool { (sin(a) >= 0) == near }
            // sin > 0 is the near side of the ring (lower on screen): closer, larger, brighter.
            func depth(_ a: Double) -> Double { 0.5 + 0.5 * sin(a) }

            for k in stride(from: 14, through: 1, by: -1) {
                let a = angle - Double(k) * 0.045
                guard onThisSide(a) else { continue }
                let p = point(a), fade = 1 - Double(k) / 15
                let r = 1.6 * fade * (0.7 + 0.5 * depth(a))
                plane.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)),
                           with: .color(Color(hex: 0xF08A90).opacity(0.5 * fade * (0.35 + 0.65 * depth(a)))))
            }
            guard onThisSide(angle) else { continue }
            let p = point(angle), d = depth(angle)
            let core = 2.4 + 1.4 * d, ring = 6 + 4 * d
            plane.fill(Path(ellipseIn: CGRect(x: p.x - ring * 1.6, y: p.y - ring * 1.6, width: ring * 3.2, height: ring * 3.2)),
                       with: .radialGradient(Gradient(colors: [Night.glow.opacity(0.45 * d + 0.1), .clear]),
                                             center: p, startRadius: 0, endRadius: ring * 1.6))
            plane.fill(Path(ellipseIn: CGRect(x: p.x - core, y: p.y - core, width: core * 2, height: core * 2)),
                       with: .color(node.opacity(0.45 + 0.55 * d)))
            plane.stroke(Path(ellipseIn: CGRect(x: p.x - ring, y: p.y - ring, width: ring * 2, height: ring * 2)),
                         with: .color(node.opacity(0.15 + 0.25 * d)), lineWidth: 1)
        }
    }

    /// Where the bodies stand under Reduce Motion: spread around their rings.
    private static let stillTime: Double = 3

    /// The three rings: radii, line opacity, one turn in seconds, starting angle.
    private static let orbits: [(rx: CGFloat, ry: CGFloat, opacity: Double, period: Double, start: Double)] = [
        (105, 39.9, 0.55, 16, 0.4),
        (150, 57.0, 0.38, 27, 2.6),
        (200, 76.0, 0.24, 41, 4.4),
    ]

    /// x, y, radius, opacity — in the artwork's 390×560 space.
    private static let stars: [(CGFloat, CGFloat, CGFloat, Double)] = [
        (92.8, 228.6, 1.0, 0.75), (184.9, 244.0, 0.6, 0.75), (183.0, 231.3, 0.8, 0.80), (183.4, 351.3, 1.2, 0.44), (335.8, 97.4, 0.8, 0.72), (204.0, 311.3, 0.6, 0.30),
        (373.4, 18.0, 0.6, 0.69), (105.1, 249.8, 1.2, 0.63), (359.2, 165.9, 1.2, 0.78), (52.3, 153.5, 0.6, 0.28), (84.6, 405.5, 1.2, 0.67), (333.5, 176.9, 1.2, 0.54),
        (208.3, 171.2, 0.8, 0.74), (266.0, 390.2, 1.0, 0.79), (261.8, 68.5, 1.0, 0.78), (352.8, 239.0, 0.8, 0.58), (385.3, 112.2, 0.6, 0.24), (333.0, 415.7, 0.6, 0.41),
        (26.0, 376.8, 0.6, 0.38), (299.8, 366.6, 0.6, 0.56), (297.0, 158.7, 1.0, 0.53), (359.5, 117.2, 0.8, 0.80), (120.8, 32.3, 0.6, 0.77), (378.9, 122.5, 1.0, 0.29),
        (16.5, 364.5, 1.0, 0.42), (53.9, 361.9, 1.2, 0.48), (202.8, 270.4, 0.6, 0.57), (366.8, 213.0, 1.2, 0.58), (279.1, 393.3, 1.2, 0.79), (203.2, 230.3, 0.6, 0.67),
        (385.1, 132.2, 1.2, 0.57), (246.6, 25.2, 1.0, 0.48), (264.9, 148.1, 1.0, 0.64), (8.7, 25.4, 0.6, 0.78), (97.9, 191.7, 1.0, 0.31), (72.2, 318.4, 1.0, 0.38),
        (147.1, 324.4, 0.6, 0.78), (266.7, 55.2, 0.8, 0.59), (105.1, 137.7, 1.2, 0.59), (37.8, 252.3, 1.0, 0.60), (87.5, 340.1, 0.8, 0.25), (289.4, 91.6, 1.2, 0.36),
        (306.9, 14.2, 0.8, 0.39), (326.1, 241.4, 1.0, 0.40), (322.9, 35.9, 1.0, 0.55), (164.3, 217.7, 1.0, 0.48), (247.3, 122.0, 1.2, 0.22), (161.2, 83.8, 1.2, 0.77),
        (343.2, 414.5, 1.2, 0.54), (384.4, 301.2, 0.6, 0.65), (326.3, 278.5, 1.0, 0.53), (347.0, 361.8, 1.0, 0.27), (95.4, 14.8, 0.8, 0.74), (350.9, 242.3, 0.6, 0.49),
        (47.1, 211.3, 0.8, 0.60), (204.7, 173.8, 0.6, 0.40), (98.5, 361.9, 1.2, 0.69), (23.9, 92.7, 0.6, 0.52), (318.6, 71.9, 1.0, 0.75), (314.4, 345.9, 0.6, 0.49),
    ]
}

/// The sign-in's palette: a warm black sky, SDY red, the logo's silver.
enum Night {
    static let sky = Color(hex: 0x0B0709)
    static let accent = Theme.brandRed
    static let glow = Color(hex: 0xC3242E)
    static let silver = Color(hex: 0xE4E7EC)
    static let rose = Color(hex: 0xF08A90)
    static let muted = Color(hex: 0x9C8F92)
    static let line = Color(hex: 0xE4E7EC)
}

extension Color {
    /// An sRGB colour from 0xRRGGBB.
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255)
    }
}

extension View {
    /// The sign-in's main button: 56pt, 16pt corners, a red glow.
    func primaryNight() -> some View {
        font(.system(size: 16, weight: .bold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(Night.accent, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: Night.glow.opacity(0.45), radius: 15, y: 10)
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    /// The outlined one: 50pt.
    func secondaryNight() -> some View {
        font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Night.silver)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Night.line.opacity(0.22), lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
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

/// The SDY Mongolia logo as a small sun at the orbits' centre: a sphere lit
/// from the upper left (a highlight, a shadowed limb, a warm rim), a corona
/// that breathes, and faint rays turning slowly behind it. `t` drives the
/// motion; a fixed `t` holds it still.
struct SunLogo: View {
    let diameter: CGFloat
    let t: Double

    var body: some View {
        let d = diameter
        let pulse = 1 + 0.06 * sin(t * 2 * .pi / 5)
        ZStack {
            // Corona: a soft red-orange halo, breathing.
            Circle()
                .fill(RadialGradient(colors: [Color(hex: 0xFF5A3C).opacity(0.55), Night.glow.opacity(0.28), .clear],
                                     center: .center, startRadius: d * 0.42, endRadius: d * 1.25))
                .frame(width: d * 2.5, height: d * 2.5)
                .scaleEffect(pulse)
            // Rays: twelve soft spokes, turning once in two minutes.
            Circle()
                .fill(AngularGradient(gradient: Gradient(colors: (0..<24).map { $0.isMultiple(of: 2) ? Color(hex: 0xFF7A5C).opacity(0.5) : .clear }),
                                      center: .center))
                .mask(Circle().fill(RadialGradient(colors: [.white, .white.opacity(0.4), .clear],
                                                   center: .center, startRadius: d * 0.45, endRadius: d * 1.05)))
                .frame(width: d * 2.1, height: d * 2.1)
                .blur(radius: d * 0.06)
                .rotationEffect(.degrees(t * 3))
                .opacity(0.55)
            // The sphere: it turns, and the face it shows changes with each half
            // turn — the union's SDY Mongolia, then SDY Darkhan-Uul.
            globe(d)
                .clipShape(Circle())
                // Light from the upper left…
                .overlay(Circle().fill(RadialGradient(colors: [.white.opacity(0.42), .white.opacity(0.08), .clear],
                                                      center: UnitPoint(x: 0.32, y: 0.26), startRadius: 0, endRadius: d * 0.5)))
                // …and the limb turning away from it.
                .overlay(Circle().fill(RadialGradient(colors: [.clear, .clear, .black.opacity(0.6)],
                                                      center: UnitPoint(x: 0.4, y: 0.36), startRadius: 0, endRadius: d * 0.72)))
                // A warm rim where the corona meets the edge.
                .overlay(Circle().strokeBorder(LinearGradient(colors: [Color(hex: 0xFFB199).opacity(0.85), Color(hex: 0xFF5A3C).opacity(0.25), Color(hex: 0xFF5A3C).opacity(0.6)],
                                                              startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1.2))
                .shadow(color: Color(hex: 0xFF4A3A).opacity(0.75), radius: d * 0.16 * pulse)
                .shadow(color: Night.glow.opacity(0.5), radius: d * 0.38)
        }
        .frame(width: d * 2.5, height: d * 2.5)
    }

    /// How far the globe has turned (0…1 a turn). One turn takes `period`
    /// seconds; it slows as each face comes round to the front (phase 0 for
    /// SDY Mongolia, ½ for SDY Darkhan-Uul) so the faces can be read, and
    /// never stops — a globe, not a card.
    static let period = 16.0
    static func phase(_ t: Double) -> Double {
        let x = t / period
        let slowing = 0.62
        let p = x - slowing / (4 * .pi) * sin(4 * .pi * x)
        return p - floor(p)
    }

    /// The red ball with both faces printed on it, half a turn apart, turned
    /// about its vertical axis: a face slides towards one edge, narrows with
    /// the curve and goes round the back while the other comes up from the
    /// far edge. Drawn as 64 thin columns of the flat skin, each squeezed to
    /// where that slice of longitude lands on an orthographic globe
    /// (x = sin λ). The light, drawn over this, stays put.
    private func globe(_ d: CGFloat) -> some View {
        let phase = Self.phase(t)
        return Canvas { ctx, _ in
            guard let skin = ctx.resolveSymbol(id: 0) else { return }
            let r = d / 2, width = d * 2
            let columns = 64
            for k in 0..<columns {
                let x0 = -1 + 2 * Double(k) / Double(columns)
                let x1 = -1 + 2 * Double(k + 1) / Double(columns)
                let l0 = asin(x0), l1 = asin(x1)
                var u0 = l0 / (2 * .pi) + 0.25 + phase
                u0 -= floor(u0)
                let du = (l1 - l0) / (2 * .pi)
                var c = ctx
                // A hair of overlap so no seam shows between columns.
                c.clip(to: Path(CGRect(x: r + x0 * r - 0.25, y: 0, width: (x1 - x0) * r + 0.5, height: d)))
                c.translateBy(x: r + x0 * r, y: 0)
                c.scaleBy(x: (x1 - x0) * r / (du * width), y: 1)
                c.translateBy(x: -u0 * width, y: 0)
                // Twice, a turn apart, for a column that runs past the skin's end.
                c.draw(skin, at: CGPoint(x: width / 2, y: d / 2))
                c.draw(skin, at: CGPoint(x: width * 1.5, y: d / 2))
            }
        } symbols: {
            strip(d).tag(0)
        }
        .frame(width: d, height: d)
        .accessibilityHidden(true)
    }

    /// The globe's skin, flat: 360° across (2d), 180° down (d) — SDY Mongolia
    /// on the first half, SDY Darkhan-Uul on the second, on the logo's red.
    private func strip(_ d: CGFloat) -> some View {
        let fade = RadialGradient(colors: [.white, .white, .clear], center: .center, startRadius: 0, endRadius: d * 0.42)
        return HStack(spacing: 0) {
            Image("Logo")
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: d * 0.74)
                .mask(Circle().fill(fade))
                .frame(width: d, height: d)
            Image("Wordmark")
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: d * 0.6)
                .shadow(color: .black.opacity(0.45), radius: 1.5, y: 1)
                .frame(width: d, height: d)
        }
        .frame(width: d * 2, height: d)
        .background(Color(hex: 0xC51E28))
    }
}
