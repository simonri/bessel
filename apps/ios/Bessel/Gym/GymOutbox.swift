import Foundation
import os

/// Gym changes waiting to reach the server, in the order they were made. Gyms
/// are often basements without signal, so every change is saved to disk the
/// moment it's made and sent when the connection allows. Order matters (an
/// exercise must exist before its sets), so sending stops at the first change
/// that can't get through and picks up from there next time.
@MainActor
final class GymOutbox {
    private struct Saved: Codable {
        let account: String
        var changes: [GymChange]
    }

    private let client: APIClient
    private let account: String
    private let fileURL: URL
    private(set) var changes: [GymChange] = []
    private var isSending = false
    private static let log = Logger(subsystem: "app.bessel", category: "gym-outbox")

    init(client: APIClient, account: String, fileURL: URL = GymOutbox.defaultFileURL) {
        self.client = client
        self.account = account
        self.fileURL = fileURL
        if let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONDecoder().decode(Saved.self, from: data),
           saved.account == account {
            changes = saved.changes
        }
    }

    nonisolated static let defaultFileURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appending(path: "gym-changes.json")

    var isEmpty: Bool { changes.isEmpty }

    func enqueue(_ change: GymChange) {
        changes.append(change)
        save()
    }

    /// Sends what's waiting, oldest first, telling `reached` about each change
    /// the server now has. Returns whether everything went through.
    @discardableResult
    func send(reached: (GymChange) -> Void = { _ in }) async -> Bool {
        guard !isSending else { return changes.isEmpty }
        isSending = true
        defer { isSending = false }
        while let change = changes.first {
            do {
                try await perform(change)
                reached(change)
            } catch let error as APIError where error.statusCode == 404 {
                // Already gone, or its exercise is: nothing left to change.
                reached(change)
            } catch where error.isTransient || error.isCancellation {
                return false
            } catch {
                // Refused for good (say, a name taken on another device); the next load shows what's true.
                Self.log.error("Gym change refused: \(error.userMessage, privacy: .public)")
            }
            changes.removeFirst()
            save()
        }
        return true
    }

    private func perform(_ change: GymChange) async throws {
        switch change {
        case let .saveExercise(id, name):
            let _: GymExerciseResponse = try await client.put("/v1/gym/exercises/\(id)", body: GymExerciseUpsert(name: name))
        case let .deleteExercise(id):
            try await client.deleteNoContent("/v1/gym/exercises/\(id)")
        case let .saveSet(exerciseID, day, weightKg):
            let _: GymSet = try await client.put("/v1/gym/exercises/\(exerciseID)/sets/\(day)", body: GymSetUpsert(weightKg: weightKg))
        case let .deleteSet(exerciseID, day):
            try await client.deleteNoContent("/v1/gym/exercises/\(exerciseID)/sets/\(day)")
        }
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(Saved(account: account, changes: changes)) else { return }
        try? FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    /// Called on sign-out: waiting changes belong to the account that made them.
    static func clear(fileURL: URL = GymOutbox.defaultFileURL) {
        try? FileManager.default.removeItem(at: fileURL)
    }
}

private struct GymExerciseResponse: Decodable {
    let id: UUID
}
