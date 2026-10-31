import PhotosUI
import SwiftUI

/// The signed-in person's photo, or their initials on SDY red when they have none.
struct AvatarView: View {
    @EnvironmentObject var app: AppModel
    var size: CGFloat = 128

    var body: some View {
        ZStack {
            if let photo = app.photo {
                Image(uiImage: photo)
                    .resizable()
                    .scaledToFill()
                    .transition(.opacity.combined(with: .scale(scale: 0.92)))
            } else {
                Circle()
                    .fill(LinearGradient(colors: [Theme.brandRed, Color(white: 0.12)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                Text(initials)
                    .font(.system(size: size * 0.34, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(.white.opacity(0.18), lineWidth: max(1, size / 64)))
        .animation(.spring(response: 0.45, dampingFraction: 0.8), value: app.photo)
        .accessibilityHidden(true)
    }

    private var initials: String {
        let parts = (app.me?.name ?? "").split(separator: " ")
        return parts.prefix(2).compactMap { $0.first.map(String.init) }.joined()
    }
}

/// The Profile header's avatar: tap to choose a photo from the library,
/// replace it or remove it. Uses the system photo picker, which needs no
/// photo-library permission — the app only ever sees the one picture chosen.
struct EditableAvatar: View {
    @EnvironmentObject var app: AppModel
    @State private var showOptions = false
    @State private var showPicker = false
    @State private var item: PhotosPickerItem?
    @State private var busy = false
    @State private var failure: String?

    var body: some View {
        Button {
            if app.photo == nil { showPicker = true } else { showOptions = true }
        } label: {
            AvatarView(size: 128)
                .overlay {
                    if busy {
                        Circle().fill(.black.opacity(0.45))
                        ProgressView().tint(.white).controlSize(.large)
                    }
                }
                .overlay(alignment: .bottomTrailing) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.black)
                        .frame(width: 38, height: 38)
                        .background(.white, in: Circle())
                        .overlay(Circle().strokeBorder(.black.opacity(0.08), lineWidth: 1))
                        .shadow(color: .black.opacity(0.35), radius: 6, y: 3)
                        .offset(x: -2, y: -2)
                }
                .shadow(color: .black.opacity(0.5), radius: 18, y: 10)
        }
        .buttonStyle(PressableStyle(scale: 0.94))
        .disabled(busy || app.isOffline)
        .accessibilityLabel(app.photo == nil ? "Профайлын зураг оруулах" : "Профайлын зураг солих")
        .confirmationDialog("Профайлын зураг", isPresented: $showOptions, titleVisibility: .visible) {
            Button("Шинэ зураг сонгох") { showPicker = true }
            Button("Зургийг устгах", role: .destructive) { Task { await remove() } }
            Button("Болих", role: .cancel) {}
        }
        .photosPicker(isPresented: $showPicker, selection: $item, matching: .images, preferredItemEncoding: .compatible)
        .onChange(of: item) { _, picked in
            guard let picked else { return }
            Task { await upload(picked) }
        }
        .alert("Зураг хадгалагдсангүй", isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })) {
            Button("За", role: .cancel) {}
        } message: {
            Text(failure ?? "")
        }
    }

    private func upload(_ picked: PhotosPickerItem) async {
        busy = true
        defer { busy = false; item = nil }
        do {
            guard let data = try await picked.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
                failure = "Энэ зургийг уншиж чадсангүй. Өөр зураг сонгоно уу."
                return
            }
            try await app.setPhoto(image)
        } catch {
            failure = APIError.wrap(error).message
        }
    }

    private func remove() async {
        busy = true
        defer { busy = false }
        do { try await app.removePhoto() } catch { failure = APIError.wrap(error).message }
    }
}
