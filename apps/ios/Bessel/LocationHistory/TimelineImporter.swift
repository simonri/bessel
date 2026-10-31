import Foundation
import Observation

/// A Google Maps Timeline export shared to Bessel from the share sheet.
///
/// iOS copies a shared file into Documents/Inbox. It stays there until the
/// server has it, or has turned it down for good, so a file shared while
/// signed out, offline or just before the app was closed is offered again on
/// the next launch.
@MainActor
@Observable
final class TimelineImporter {
    enum Phase: Equatable {
        case ready
        case importing
        case imported(API.LocationImportSchema)
        case failed(String)
    }

    private(set) var file: URL?
    private(set) var phase: Phase = .ready

    private let inbox: URL

    init(inbox: URL = URL.documentsDirectory.appending(path: "Inbox")) {
        self.inbox = inbox
    }

    /// Takes a file iOS opened Bessel with. False for anything else, like a link.
    @discardableResult
    func receive(_ url: URL) -> Bool {
        guard url.isFileURL, url.pathExtension.lowercased() == "json" else { return false }
        file = url
        phase = .ready
        return true
    }

    /// Offers the newest file an earlier launch never got to import.
    func resumeLeftover() {
        guard file == nil else { return }
        let files = (try? FileManager.default.contentsOfDirectory(
            at: inbox,
            includingPropertiesForKeys: [.creationDateKey]
        )) ?? []
        let newest = files
            .filter { $0.pathExtension.lowercased() == "json" }
            .max { Self.created($0) < Self.created($1) }
        if let newest { receive(newest) }
    }

    func start(client: APIClient) async {
        guard let file, phase != .importing else { return }
        phase = .importing
        do {
            let result: API.LocationImportSchema = try await client.upload(
                "/v1/location-history/import",
                // Shared straight from Maps, so it's fresh. The server only
                // trusts this when the file ends close to it, so an old
                // backup shared from Files can't claim to be new.
                query: [URLQueryItem(name: "exported_at", value: ISO8601DateFormatter().string(from: .now))],
                file: file,
                contentType: "application/json"
            )
            try? FileManager.default.removeItem(at: file)
            phase = .imported(result)
        } catch {
            if Self.isFinal(error) { try? FileManager.default.removeItem(at: file) }
            phase = .failed(error.userMessage)
        }
    }

    /// Throws the file away without importing it.
    func discard() {
        guard phase != .importing else { return }
        if let file { try? FileManager.default.removeItem(at: file) }
        close()
    }

    /// Closes the sheet. A file that wasn't imported stays for next launch.
    func close() {
        guard phase != .importing else { return }
        file = nil
        phase = .ready
    }

    /// The server read the file and said no, so sending it again won't help:
    /// not a Timeline export, or too large.
    private static func isFinal(_ error: Error) -> Bool {
        guard let apiError = error as? APIError else { return false }
        return (400..<500).contains(apiError.statusCode) && ![401, 408, 429].contains(apiError.statusCode)
    }

    private static func created(_ url: URL) -> Date {
        (try? url.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast
    }
}
