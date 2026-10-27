import Foundation

/// Tasks added while the server can't be reached, kept on disk in the order
/// they were made until they get there. Each keeps its id across launches and
/// sends it as the idempotency key, so a create that landed but lost its
/// answer is never made twice.
@MainActor
final class TaskQueue {
    struct Pending: Codable, Identifiable, Equatable {
        let id: UUID
        let draft: TaskCreate
        let createdAt: Date
    }

    private struct Saved: Codable {
        let account: String
        var tasks: [Pending]
    }

    private let account: String
    private let fileURL: URL
    private(set) var tasks: [Pending] = []

    init(account: String, fileURL: URL = TaskQueue.defaultFileURL) {
        self.account = account
        self.fileURL = fileURL
        if let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONDecoder().decode(Saved.self, from: data),
           saved.account == account {
            tasks = saved.tasks
        }
    }

    nonisolated static let defaultFileURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appending(path: "task-queue.json")

    @discardableResult
    func add(_ draft: TaskCreate) -> Pending {
        let pending = Pending(id: UUID(), draft: draft, createdAt: .now)
        tasks.append(pending)
        save()
        return pending
    }

    func remove(_ id: UUID) {
        tasks.removeAll { $0.id == id }
        save()
    }

    func contains(_ id: UUID) -> Bool {
        tasks.contains { $0.id == id }
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(Saved(account: account, tasks: tasks)) else { return }
        try? FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    /// Called on sign-out: waiting tasks belong to the account that made them.
    static func clear(fileURL: URL = TaskQueue.defaultFileURL) {
        try? FileManager.default.removeItem(at: fileURL)
    }
}

extension TaskQueue.Pending {
    /// How it shows in the list while it waits.
    var placeholder: TaskItem {
        TaskItem(
            createdAt: createdAt,
            id: id,
            title: draft.title,
            description: draft.description,
            status: .todo,
            priority: draft.priority,
            dueDate: draft.dueDate,
            project: draft.project,
            position: .greatestFiniteMagnitude,
            attachments: []
        )
    }
}
