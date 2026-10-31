import SwiftUI

struct AboutView: View {
    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    Image("Logo").resizable().scaledToFill()
                        .frame(width: 64, height: 64)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading) {
                        Text("E-sdy").font(.title3.bold())
                        Text("Хувилбар \(AppConfig.appVersion)").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
                Text("SDY-ийн гишүүдэд зориулсан апп: арга хэмжээнд бүртгүүлэх, QR-ээр ирцээ батлах, хурлын асуудалд eID-ээр санал өгөх, гишүүнчлэлийн хураамжаа хянах.")
                    .font(.subheadline)
                Text("SDY-ийн зөвшөөрөлтэйгээр хөгжүүлсэн.")
                    .font(.subheadline.weight(.medium))
            }
            Section("Нээлттэй эх") {
                Text("Энэ апп нь Gerege Systems-ийн open-gerege-nexus (Apache License 2.0) платформ дээр суурилсан. Copyright © 2026 Gerege Systems Development Team, Gerege Nomadica Foundation.")
                    .font(.footnote)
                Link("Apache License 2.0", destination: URL(string: "https://www.apache.org/licenses/LICENSE-2.0")!)
                    .frame(minHeight: Theme.minTap)
            }
            Section {
                Link("Нууцлалын бодлого", destination: AppConfig.privacyURL).frame(minHeight: Theme.minTap)
                Link("Тусламж", destination: AppConfig.supportURL).frame(minHeight: Theme.minTap)
            }
        }
        .navigationTitle("Апп-ын тухай")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// App Store guideline 5.1.1(v): an in-app way to delete the account.
struct DeleteAccountView: View {
    @EnvironmentObject var app: AppModel
    @State private var status: DeletionStatus?
    @State private var reason = ""
    @State private var confirm = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Бүртгэл устгах", systemImage: "exclamationmark.triangle.fill")
                        .font(.headline).foregroundStyle(.red)
                    Text("Хүсэлт илгээсний дараа таны бүх төхөөрөмж дээрх нэвтрэлт хаагдана. 30 хоногийн дотор дахин нэвтэрвэл устгах хүсэлт автоматаар цуцлагдаж, гишүүнчлэл тань сэргээгдэнэ.")
                    Text("30 хоногийн дараа таны нэвтрэх бүртгэл, холбоо барих мэдээлэл, мэдэгдлүүд устгагдана. Хуулиар хадгалах шаардлагатай санхүүгийн гүйлгээ, хурлын зурсан саналын бүртгэл нэргүйжүүлэгдэн хадгалагдаж болно.")
                    Text("Салбарын гишүүнчлэлээс гарах нь тусдаа асуудал тул салбартаа мэдэгдэнэ үү.")
                }
                .font(.subheadline)
                .padding(.vertical, 4)
            }
            if let status, status.isPending {
                Section {
                    Label("Устгах хүсэлт илгээгдсэн\(status.deadline.map { " · \(Formatters.day($0))-нд устгагдана" } ?? "").", systemImage: "hourglass")
                        .foregroundStyle(.orange)
                }
            }
            Section {
                TextField("Шалтгаан (заавал биш)", text: $reason, axis: .vertical)
                    .lineLimit(2...5)
                    .onChange(of: reason) { _, v in if v.count > 500 { reason = String(v.prefix(500)) } }
            } footer: {
                Text("Шалтгаан нь үйлчилгээгээ сайжруулахад тусална.")
            }
            if let error { Section { NoticeView(text: error, kind: .error) } }
            Section {
                Button(role: .destructive) { confirm = true } label: {
                    HStack { Spacer(); if busy { ProgressView() } else { Text("Бүртгэлээ устгах").bold() }; Spacer() }
                        .frame(minHeight: Theme.minTap)
                }
                .disabled(busy || app.isOffline)
            }
        }
        .navigationTitle("Бүртгэл устгах")
        .navigationBarTitleDisplayMode(.inline)
        .task { status = try? await app.api.deletionStatus() }
        .confirmationDialog("Бүртгэлээ устгах уу?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Устгах хүсэлт илгээх", role: .destructive) { Task { await submit() } }
            Button("Болих", role: .cancel) {}
        } message: {
            Text("Бүх төхөөрөмж дээрх нэвтрэлт хаагдана. 30 хоногийн дотор дахин нэвтэрвэл хүсэлт цуцлагдаж, гишүүнчлэл тань сэргээгдэнэ.")
        }
        .offlineBanner()
    }

    private func submit() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            try await app.api.requestDeletion(reason: reason.trimmingCharacters(in: .whitespacesAndNewlines))
            // The server revoked every session already; nothing to log out of.
            app.clearLocal()
            app.signOutReason = "Бүртгэл устгах хүсэлт хүлээн авлаа. 30 хоногийн дотор дахин нэвтэрвэл хүсэлт цуцлагдаж, гишүүнчлэл тань сэргээгдэнэ."
        } catch {
            self.error = APIError.wrap(error).message
        }
    }
}
