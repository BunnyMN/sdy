import Foundation

/// The last good answer for each screen, per branch (tenant), so a member
/// with no signal still sees what they saw last time — read-only, under an
/// "Офлайн" banner. Writes are never queued.
///
/// Files live in Application Support with complete-until-first-unlock
/// protection and are wiped on sign-out.
final class OfflineCache {
    static let shared = OfflineCache()

    private let directory: URL
    private let queue = DispatchQueue(label: "mn.esdy.member.cache")

    init(directory: URL? = nil) {
        let base = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("SDYCache", isDirectory: true)
        self.directory = base
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true,
                                                 attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        var url = base
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
    }

    func fileURL(scope: String, path: String) -> URL {
        let safe = (scope + "_" + path).map { $0.isLetter || $0.isNumber ? $0 : "_" }
        return directory.appendingPathComponent(String(safe) + ".json")
    }

    func save(_ data: Data, scope: String, path: String) {
        let url = fileURL(scope: scope, path: path)
        queue.async {
            try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    func load(scope: String, path: String) -> Data? {
        queue.sync { try? Data(contentsOf: fileURL(scope: scope, path: path)) }
    }

    func clearAll() {
        queue.sync {
            let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
            files.forEach { try? FileManager.default.removeItem(at: $0) }
        }
    }
}
