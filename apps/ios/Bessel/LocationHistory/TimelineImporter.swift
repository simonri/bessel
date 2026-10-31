import Foundation
import Observation

/// A Google Maps Timeline export shared to Bessel from the share sheet.
///
/// iOS copies a shared file into Documents/Inbox and opens the app with it.
/// The importer moves it into a folder of its own, where it stays until the
/// server has it or has turned it down for good, so a file shared while
/// signed out, offline or just before the app was closed is offered again
/// on the next launch.
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
    private let store: URL

    init(
        inbox: URL = URL.documentsDirectory.appending(path: "Inbox"),
        store: URL = URL.applicationSupportDirectory.appending(path: "TimelineImports")
    ) {
        self.inbox = inbox
        self.store = store
    }

    /// Takes a file iOS opened Bessel with. False for anything else, like a
    /// link, or a file already taken.
    @discardableResult
    func receive(_ url: URL) -> Bool {
        guard Self.isExport(url), url != file, let kept = keep(url) else { return false }
        // One import at a time; this one is offered once that's done.
        guard phase != .importing else { return true }
        file = kept
        phase = .ready
        return true
    }

    /// Offers the newest export an earlier launch never got to import.
    func resumeLeftover() {
        guard file == nil else { return }
        for url in Self.files(in: inbox) where Self.isExport(url) {
            keep(url)
        }
        let kept = Self.files(in: store).flatMap { Self.files(in: $0) }.filter(Self.isExport)
        if let newest = kept.max(by: { Self.created($0) < Self.created($1) }) {
            file = newest
            phase = .ready
        }
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
            remove(file)
            phase = .imported(result)
        } catch {
            if Self.isFinal(error) { remove(file) }
            phase = .failed(error.userMessage)
        }
    }

    /// Throws the file away without importing it.
    func discard() {
        guard phase != .importing else { return }
        if let file { remove(file) }
        close()
    }

    /// Closes the sheet. A file that wasn't imported stays for next launch.
    func close() {
        guard phase != .importing else { return }
        file = nil
        phase = .ready
    }

    /// Moves a shared file into a folder of its own in `store`, keeping its
    /// name for the server. Nil when it's gone, e.g. already moved.
    @discardableResult
    private func keep(_ url: URL) -> URL? {
        if isKept(url) { return url }
        let destination = store.appending(path: UUID().uuidString).appending(path: url.lastPathComponent)
        do {
            try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            try FileManager.default.moveItem(at: url, to: destination)
            return destination
        } catch {
            try? FileManager.default.removeItem(at: destination.deletingLastPathComponent())
            return nil
        }
    }

    private func remove(_ url: URL) {
        try? FileManager.default.removeItem(at: isKept(url) ? url.deletingLastPathComponent() : url)
    }

    /// In a folder of its own in `store`.
    private func isKept(_ url: URL) -> Bool {
        Self.canonical(url.deletingLastPathComponent().deletingLastPathComponent()) == Self.canonical(store)
    }

    private static func canonical(_ url: URL) -> String {
        url.resolvingSymlinksInPath().standardizedFileURL.path(percentEncoded: false).trimmingSuffix("/")
    }

    private static func isExport(_ url: URL) -> Bool {
        url.isFileURL && url.pathExtension.lowercased() == "json"
    }

    /// The server read the file and said no, so sending it again won't help:
    /// not a Timeline export, or too large.
    private static func isFinal(_ error: Error) -> Bool {
        guard let apiError = error as? APIError else { return false }
        return (400..<500).contains(apiError.statusCode) && ![401, 408, 429].contains(apiError.statusCode)
    }

    private static func files(in folder: URL) -> [URL] {
        (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.creationDateKey])) ?? []
    }

    private static func created(_ url: URL) -> Date {
        (try? url.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast
    }
}

private extension String {
    func trimmingSuffix(_ suffix: String) -> String {
        hasSuffix(suffix) ? String(dropLast(suffix.count)) : self
    }
}
