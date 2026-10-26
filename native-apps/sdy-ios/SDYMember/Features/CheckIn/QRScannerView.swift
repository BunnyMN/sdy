import AVFoundation
import SwiftUI

/// Camera QR reader. Calls `onCode` once per distinct string.
struct QRScannerRepresentable: UIViewControllerRepresentable {
    @Binding var torchOn: Bool
    let onCode: (String) -> Void

    func makeUIViewController(context: Context) -> ScannerController {
        let controller = ScannerController()
        controller.onCode = onCode
        return controller
    }

    func updateUIViewController(_ controller: ScannerController, context: Context) {
        controller.setTorch(torchOn)
    }

    final class ScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
        var onCode: ((String) -> Void)?
        private let session = AVCaptureSession()
        private var preview: AVCaptureVideoPreviewLayer?
        private var device: AVCaptureDevice?
        private var lastCode: String?
        private var lastAt = Date.distantPast

        override func viewDidLoad() {
            super.viewDidLoad()
            view.backgroundColor = .black
            guard let device = AVCaptureDevice.default(for: .video),
                  let input = try? AVCaptureDeviceInput(device: device),
                  session.canAddInput(input) else { return }
            self.device = device
            session.addInput(input)
            let output = AVCaptureMetadataOutput()
            guard session.canAddOutput(output) else { return }
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = [.qr]
            let layer = AVCaptureVideoPreviewLayer(session: session)
            layer.videoGravity = .resizeAspectFill
            view.layer.addSublayer(layer)
            preview = layer
        }

        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            preview?.frame = view.bounds
        }

        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            let session = self.session
            DispatchQueue.global(qos: .userInitiated).async { if !session.isRunning { session.startRunning() } }
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            setTorch(false)
            let session = self.session
            DispatchQueue.global(qos: .userInitiated).async { if session.isRunning { session.stopRunning() } }
        }

        func setTorch(_ on: Bool) {
            guard let device, device.hasTorch, (device.torchMode == .on) != on else { return }
            try? device.lockForConfiguration()
            device.torchMode = on ? .on : .off
            device.unlockForConfiguration()
        }

        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
            guard let object = objects.first as? AVMetadataMachineReadableCodeObject,
                  let value = object.stringValue else { return }
            if value == lastCode && Date().timeIntervalSince(lastAt) < 3 { return }
            lastCode = value
            lastAt = Date()
            onCode?(value)
        }
    }
}

/// Full-screen scanner with permission handling, torch and a clear hint.
struct QRScannerScreen: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    let onCheckin: (CheckinCode) -> Void
    @State private var status = AVCaptureDevice.authorizationStatus(for: .video)
    @State private var torch = false
    @State private var invalid: String?

    private var hasCamera: Bool { AVCaptureDevice.default(for: .video) != nil }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                switch status {
                case .authorized where hasCamera:
                    QRScannerRepresentable(torchOn: $torch) { handle($0) }
                        .ignoresSafeArea()
                    overlay
                case .notDetermined:
                    ProgressView().tint(.white)
                        .task {
                            _ = await AVCaptureDevice.requestAccess(for: .video)
                            status = AVCaptureDevice.authorizationStatus(for: .video)
                        }
                case .denied, .restricted:
                    message(icon: "camera.fill",
                            title: "Камерын зөвшөөрөл алга",
                            text: "Ирцийн QR уншихын тулд Тохиргоо → SDY Гишүүн → Камер хэсгийг идэвхжүүлнэ үү.",
                            action: ("Тохиргоо нээх", { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } }))
                default:
                    message(icon: "camera.metering.unknown",
                            title: "Камер олдсонгүй",
                            text: "Энэ төхөөрөмж дээр камер ашиглах боломжгүй байна. Зохион байгуулагчийн QR-ийг утасны камераар уншуулна уу.",
                            action: nil)
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Хаах") { dismiss() }.tint(.white)
                }
                if status == .authorized && hasCamera {
                    ToolbarItem(placement: .primaryAction) {
                        Button { torch.toggle() } label: {
                            Image(systemName: torch ? "flashlight.on.fill" : "flashlight.off.fill")
                                .frame(minWidth: Theme.minTap, minHeight: Theme.minTap)
                        }
                        .tint(.white)
                        .accessibilityLabel(torch ? "Гэрэл унтраах" : "Гэрэл асаах")
                    }
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
        }
    }

    private var overlay: some View {
        VStack {
            Spacer()
            RoundedRectangle(cornerRadius: 24)
                .strokeBorder(.white, lineWidth: 3)
                .frame(width: 250, height: 250)
                .accessibilityHidden(true)
            Spacer()
            VStack(spacing: 8) {
                if let invalid {
                    Label(invalid, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.yellow)
                }
                Text("Зохион байгуулагчийн үзүүлсэн ирцийн QR-ийг хүрээн дотор байрлуулна уу.")
                    .foregroundStyle(.white)
            }
            .font(.subheadline)
            .multilineTextAlignment(.center)
            .padding()
            .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 14))
            .padding()
        }
    }

    private func message(icon: String, title: String, text: String, action: (String, () -> Void)?) -> some View {
        VStack(spacing: 14) {
            Image(systemName: icon).font(.system(size: 44)).foregroundStyle(.white.opacity(0.8))
            Text(title).font(.title3.bold()).foregroundStyle(.white)
            Text(text).multilineTextAlignment(.center).foregroundStyle(.white.opacity(0.8))
            if let action {
                Button(action.0, action: action.1)
                    .buttonStyle(.borderedProminent)
                    .frame(minHeight: Theme.minTap)
            }
        }
        .padding(32)
    }

    private func handle(_ value: String) {
        if let code = LinkParser.checkin(from: value) {
            Haptics.success()
            dismiss()
            onCheckin(code)
        } else {
            Haptics.error()
            invalid = "Энэ нь SDY-ийн ирцийн QR биш байна."
        }
    }
}
