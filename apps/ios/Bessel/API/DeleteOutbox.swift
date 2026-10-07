import Foundation
import os
import UIKit

/// Deletes that wait out an Undo window before reaching the server. They are
/// written to disk the moment they're queued, so closing the app during the
/// window still deletes, and a delete that couldn't get through (offline) is
/// sent again later instead of the item quietly coming back.
@MainActor
final class DeleteOutbox {
    struct Entry: Codable, Equatable {
        let id: UUID
        let path: String
    }

    private struct Saved: Codable {
        let account: String
        var entries: [Entry]
    }

    static let undoWindow: Duration = .seconds(4.5)

    private let client: APIClient
    private let account: String
    private let fileURL: URL
    private var entries: [Entry] = []
    private var timers: [UUID: Task<Void, Never>] = [:]
    private var inFlight: Set<UUID> = []
    private var backgroundTask = UIBackgroundTaskIdentifier.invalid
    private static let log = Logger(subsystem: "app.bessel", category: "outbox")

    init(client: APIClient, account: String, fileURL: URL = DeleteOutbox.defaultFileURL) {
        self.client = client
        self.account = account
        self.fileURL = fileURL
        if let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONDecoder().decode(Saved.self, from: data),
           saved.account == account {
            entries = saved.entries
        }
    }

    nonisolated static let defaultFileURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appending(path: "pending-deletes.json")

    /// IDs still waiting to be deleted; lists leave these out.
    var pendingIDs: Set<UUID> { Set(entries.map(\.id)) }

    func contains(_ id: UUID) -> Bool {
        entries.contains { $0.id == id }
    }

    /// Queues a delete and sends it once the Undo window has passed.
    func schedule(_ id: UUID, path: String) {
        guard !contains(id) else { return }
        entries.append(Entry(id: id, path: path))
        save()
        timers[id] = Task { [weak self] in
            try? await Task.sleep(for: Self.undoWindow)
            guard !Task.isCancelled else { return }
            await self?.send(id)
        }
    }

    /// Undo: forgets the delete if it hasn't gone out yet. Returns whether it was stopped.
    @discardableResult
    func cancel(_ id: UUID) -> Bool {
        guard contains(id), !inFlight.contains(id) else { return false }
        timers.removeValue(forKey: id)?.cancel()
        entries.removeAll { $0.id == id }
        save()
        return true
    }

    /// Sends what's past its Undo window but hasn't gone through: left over
    /// from last time the app ran, or queued while offline.
    func retry() async {
        await send(entries.filter { timers[$0.id] == nil })
    }

    /// Sends everything now, Undo window or not, with time to finish after the
    /// app goes to the background, where it may be closed at any moment.
    func flushInBackground() {
        guard !entries.isEmpty else { return }
        for entry in entries {
            timers.removeValue(forKey: entry.id)?.cancel()
        }
        endBackgroundTask()
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "pending-deletes") { [weak self] in
            MainActor.assumeIsolated { self?.endBackgroundTask() }
        }
        Task {
            await send(entries)
            endBackgroundTask()
        }
    }

    private func endBackgroundTask() {
        guard backgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTask)
        backgroundTask = .invalid
    }

    private func send(_ batch: [Entry]) async {
        await withTaskGroup(of: Void.self) { group in
            for entry in batch {
                group.addTask { await self.send(entry.id) }
            }
        }
    }

    private func send(_ id: UUID) async {
        guard let entry = entries.first(where: { $0.id == id }), !inFlight.contains(id) else { return }
        inFlight.insert(id)
        defer { inFlight.remove(id) }
        timers[id] = nil
        do {
            try await client.deleteNoContent(entry.path)
            finish(id)
        } catch let error as APIError where error.statusCode == 404 {
            finish(id)
        } catch where error.isTransient || error.isCancellation {
            // Kept on disk; the next flush tries again.
        } catch {
            // The server refused for good; the item shows up again on the next load.
            Self.log.error("Delete of \(entry.path, privacy: .public) refused: \(error.userMessage, privacy: .public)")
            finish(id)
        }
    }

    private func finish(_ id: UUID) {
        entries.removeAll { $0.id == id }
        save()
    }

    private func save() {
        let saved = Saved(account: account, entries: entries)
        guard let data = try? JSONEncoder().encode(saved) else { return }
        try? FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    /// Called on sign-out: queued deletes belong to the account that queued them.
    static func clear(fileURL: URL = DeleteOutbox.defaultFileURL) {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
