import SwiftUI

/// Loads one screen's data and remembers how it went.
@MainActor
final class Loader<T>: ObservableObject {
    @Published var value: T?
    @Published var error: APIError?
    @Published var isLoading = false
    private var fetch: () async throws -> T

    init(_ fetch: @escaping () async throws -> T) { self.fetch = fetch }

    /// Replaces the fetch, for views whose fetch needs environment values
    /// that are not available when the StateObject is created.
    func setFetch(_ fetch: @escaping () async throws -> T) { self.fetch = fetch }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            value = try await fetch()
            error = nil
        } catch {
            let wrapped = APIError.wrap(error)
            if wrapped.kind != .cancelled { self.error = wrapped }
        }
    }

    func loadIfNeeded() async { if value == nil { await load() } }
}

/// Skeleton → content, or an explained error with retry.
struct LoadingView<T, Content: View>: View {
    @ObservedObject var loader: Loader<T>
    var skeletonRows = 6
    @ViewBuilder let content: (T) -> Content

    var body: some View {
        if let value = loader.value {
            content(value)
        } else if let error = loader.error {
            ErrorStateView(error: error) { Task { await loader.load() } }
        } else {
            SkeletonList(rows: skeletonRows)
        }
    }
}

struct SkeletonList: View {
    var rows = 6
    var body: some View {
        List {
            Section {
                ForEach(0..<rows, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Арга хэмжээний нэр энд").font(.headline)
                        Text("2026-10-26 18:30 · Байршил").font(.subheadline)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .redacted(reason: .placeholder)
        .accessibilityLabel("Ачаалж байна")
        .allowsHitTesting(false)
    }
}

struct ErrorStateView: View {
    let error: APIError
    let retry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label(error.isNetwork ? "Холболт тасарсан" : "Мэдээллийг авч чадсангүй",
                  systemImage: error.isNetwork ? "wifi.slash" : "exclamationmark.triangle")
        } description: {
            Text(error.message)
        } actions: {
            Button("Дахин оролдох", action: retry)
                .buttonStyle(.borderedProminent)
                .frame(minHeight: Theme.minTap)
        }
    }
}

struct EmptyStateView: View {
    let title: String
    let systemImage: String
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            Text(message)
        } actions: {
            if let actionTitle, let action {
                Button(actionTitle, action: action).buttonStyle(.bordered).frame(minHeight: Theme.minTap)
            }
        }
    }
}

/// Shown on every signed-in screen while the last request could not reach the server.
struct OfflineBanner: View {
    @EnvironmentObject var app: AppModel
    var body: some View {
        if app.isOffline {
            HStack(spacing: 8) {
                Image(systemName: "wifi.slash")
                Text("Офлайн — сүүлд хадгалсан мэдээллийг харуулж байна. Өөрчлөлт хийх боломжгүй.")
                    .font(.footnote)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .foregroundStyle(.white)
            .background(Color.orange.gradient)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Офлайн. Сүүлд хадгалсан мэдээлэл.")
        }
    }
}

/// An inline result message for actions (success / error).
struct NoticeView: View {
    enum Kind { case success, error, info }
    let text: String
    var kind: Kind = .info

    var body: some View {
        Label {
            Text(text).fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: kind == .success ? "checkmark.circle.fill" : kind == .error ? "exclamationmark.triangle.fill" : "info.circle.fill")
        }
        .font(.subheadline)
        .foregroundStyle(kind == .success ? Color.green : kind == .error ? Color.red : Color.secondary)
        .accessibilityElement(children: .combine)
    }
}

/// A copy-to-clipboard row with haptic and a short "Хуулагдлаа" confirmation.
struct CopyRow: View {
    let label: String
    let value: String
    @State private var copied = false

    var body: some View {
        Button {
            UIPasteboard.general.string = value
            Haptics.success()
            withAnimation { copied = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { withAnimation { copied = false } }
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(.caption).foregroundStyle(.secondary)
                    Text(value.isEmpty ? "—" : value).font(.body.weight(.medium)).foregroundStyle(.primary)
                        .textSelection(.enabled)
                }
                Spacer()
                if copied {
                    Label("Хуулагдлаа", systemImage: "checkmark").font(.caption.weight(.semibold)).foregroundStyle(.green)
                } else {
                    Image(systemName: "doc.on.doc").foregroundStyle(Theme.accent)
                }
            }
            .frame(minHeight: Theme.minTap)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(value.isEmpty)
        .accessibilityLabel("\(label): \(value). Хуулах")
        .accessibilityHint(copied ? "Хуулагдлаа" : "Товшвол санах ойд хуулна")
    }
}

/// A two-part progress bar: verified (solid) and awaiting review (light).
struct DuesProgressBar: View {
    let paidPercent: Int
    let pendingPercent: Int

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                Rectangle().fill(Theme.accent).frame(width: geo.size.width * CGFloat(paidPercent) / 100)
                Rectangle().fill(Theme.accent.opacity(0.35)).frame(width: geo.size.width * CGFloat(pendingPercent) / 100)
                Spacer(minLength: 0)
            }
        }
        .frame(height: 8)
        .background(Color(.tertiarySystemFill))
        .clipShape(Capsule())
        .accessibilityElement()
        .accessibilityLabel("\(paidPercent) хувь төлөгдсөн")
    }
}

extension View {
    /// Places the offline banner above a screen's content.
    func offlineBanner() -> some View {
        safeAreaInset(edge: .top, spacing: 0) { OfflineBanner() }
    }
}
