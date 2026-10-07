import CryptoKit
import Foundation

/// The last thing each screen showed, on disk and per account, so the app opens
/// on it instead of a spinner and still has something to show offline.
/// Keyed by what the data is ("tasks"), not by URL, since some URLs carry the
/// current time. Wiped on sign-out.
final class ResponseCache: @unchecked Sendable {
    private let directory: URL
    private let queue = DispatchQueue(label: "app.bessel.response-cache")

    init(account: String, root: URL = ResponseCache.root) {
        let folder = SHA256.hash(data: Data(account.utf8)).prefix(8).map { String(format: "%02x", $0) }.joined()
        directory = root.appending(path: folder, directoryHint: .isDirectory)
    }

    static let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appending(path: "api-cache", directoryHint: .isDirectory)

    /// Written the way the API writes it, so the same decoder reads both.
    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    func save(_ value: some Encodable, as key: String) {
        guard let data = try? Self.encoder.encode(value) else { return }
        let url = fileURL(key)
        let directory = directory
        queue.async {
            try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            // Readable after first unlock so a background refresh can use it too.
            try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    /// The saved value, or nil when there's none or it no longer decodes.
    func load<T: Decodable>(_ type: T.Type, key: String) -> T? {
        let url = fileURL(key)
        guard let data = queue.sync(execute: { try? Data(contentsOf: url) }) else { return nil }
        return try? JSONDecoder.api.decode(T.self, from: data)
    }

    func remove(_ key: String) {
        let url = fileURL(key)
        queue.async { try? FileManager.default.removeItem(at: url) }
    }

    /// Every account's cache; called on sign-out.
    static func removeAll(root: URL = ResponseCache.root) {
        try? FileManager.default.removeItem(at: root)
    }

    private func fileURL(_ key: String) -> URL {
        let safe = key.map { $0.isLetter || $0.isNumber || $0 == "." || $0 == "-" ? $0 : "_" }
        return directory.appending(path: String(safe) + ".json")
    }
}
