import Foundation
import Observation

@MainActor
@Observable
final class TasksStore {
    enum Tab: String, CaseIterable, Identifiable {
        case board = "Board"
        case done = "Done"
        case all = "All"

        var id: String { rawValue }
    }

    var tab: Tab = .board
    var projectFilter: String?
    private(set) var board: [TaskItem] = []
    private(set) var done: [TaskItem] = []
    private(set) var all: [TaskItem] = []
    private(set) var projects: [String] = []
    private(set) var areas: [String] = []
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    var errorMessage: String?

    private let client: APIClient
    private var donePage = 1
    private var doneMaxPage = 1

    var canLoadMoreDone: Bool { donePage < doneMaxPage }

    var boardTodo: [TaskItem] { board.filter { $0.status == .todo } }
    var boardInProgress: [TaskItem] { board.filter { $0.status == .inProgress } }

    init(client: APIClient) {
        self.client = client
    }

    func loadEverything() async {
        isLoading = true
        defer {
            isLoading = false
            hasLoaded = true
        }
        do {
            async let boardTask: TaskListResponse = client.get("/v1/tasks", query: boardQuery())
            async let doneTask: TaskListResponse = client.get("/v1/tasks", query: doneQuery(page: 1))
            async let allTask: TaskListResponse = client.get("/v1/tasks", query: allQuery())
            async let projectsTask: [Project] = client.get("/v1/projects")
            async let areasTask: [String] = client.get("/v1/tasks/areas")

            board = try await boardTask.items.sorted { $0.position < $1.position }
            let doneResponse = try await doneTask
            done = doneResponse.items
            donePage = 1
            doneMaxPage = doneResponse.pagination.maxPage
            all = try await allTask.items
            projects = try await projectsTask.map(\.name)
            areas = try await areasTask
        } catch {
            report(error)
        }
    }

    func loadMoreDone() async {
        guard canLoadMoreDone else { return }
        do {
            let response: TaskListResponse = try await client.get("/v1/tasks", query: doneQuery(page: donePage + 1))
            donePage += 1
            doneMaxPage = response.pagination.maxPage
            done += response.items
        } catch {
            report(error)
        }
    }

    func create(_ draft: TaskCreate) async {
        do {
            let created: TaskItem = try await client.post("/v1/tasks", body: draft)
            if created.status == .todo || created.status == .inProgress, !created.isRecurring {
                board.append(created)
            }
            all.insert(created, at: 0)
            if let project = created.project, !projects.contains(project) {
                projects.append(project)
            }
        } catch {
            report(error)
        }
    }

    func update(_ task: TaskItem, with update: TaskUpdate) async {
        do {
            let updated: TaskItem = try await client.patch("/v1/tasks/\(task.id)", body: update)
            replace(updated, previous: task)
        } catch {
            report(error)
        }
    }

    func complete(_ task: TaskItem) async {
        board.removeAll { $0.id == task.id }
        do {
            let response: TaskCompleteResponse = try await client.post("/v1/tasks/\(task.id)/complete")
            done.insert(response.completedTask, at: 0)
            replaceInAll(response.completedTask)
            if let next = response.nextTask {
                all.insert(next, at: 0)
            }
        } catch {
            report(error)
            await loadEverything()
        }
    }

    func reopen(_ task: TaskItem) async {
        do {
            let reopened: TaskItem = try await client.post("/v1/tasks/\(task.id)/reopen")
            done.removeAll { $0.id == task.id }
            replaceInAll(reopened)
            if !reopened.isRecurring {
                board.append(reopened)
                board.sort { $0.position < $1.position }
            }
        } catch {
            report(error)
        }
    }

    func delete(_ task: TaskItem) async {
        board.removeAll { $0.id == task.id }
        done.removeAll { $0.id == task.id }
        all.removeAll { $0.id == task.id }
        do {
            try await client.deleteNoContent("/v1/tasks/\(task.id)")
        } catch {
            report(error)
            await loadEverything()
        }
    }

    /// Reorders within one board column and renormalizes that column's positions
    /// to (index + 1) * 1000, the same renormalization the web board falls back to.
    func moveBoardTasks(in status: TaskStatus, from source: IndexSet, to destination: Int) async {
        var column = status == .todo ? boardTodo : boardInProgress
        column.move(fromOffsets: source, toOffset: destination)
        let reordered = column.enumerated().map { index, task in
            var task = task
            task.position = Double(index + 1) * 1000
            return task
        }
        board = (status == .todo ? reordered + boardInProgress : boardTodo + reordered)
            .sorted { $0.position < $1.position }
        do {
            try await client.patchNoContent(
                "/v1/tasks/reorder",
                body: reordered.map { TaskReorderItem(id: $0.id, position: $0.position) }
            )
        } catch {
            report(error)
            await loadEverything()
        }
    }

    func filtered(_ tasks: [TaskItem]) -> [TaskItem] {
        guard let projectFilter else { return tasks }
        return tasks.filter { $0.project == projectFilter }
    }

    private func replace(_ updated: TaskItem, previous: TaskItem) {
        board.removeAll { $0.id == updated.id }
        if updated.status == .todo || updated.status == .inProgress, !updated.isRecurring {
            board.append(updated)
            board.sort { $0.position < $1.position }
        }
        if updated.status == .done {
            if let index = done.firstIndex(where: { $0.id == updated.id }) {
                done[index] = updated
            } else if previous.status != .done {
                done.insert(updated, at: 0)
            }
        } else {
            done.removeAll { $0.id == updated.id }
        }
        replaceInAll(updated)
        if let project = updated.project, !projects.contains(project) {
            projects.append(project)
        }
    }

    private func replaceInAll(_ updated: TaskItem) {
        if let index = all.firstIndex(where: { $0.id == updated.id }) {
            all[index] = updated
        }
    }

    private func report(_ error: Error) {
        if error is CancellationError { return }
        errorMessage = error.localizedDescription
    }

    private func boardQuery() -> [URLQueryItem] {
        var query = [
            URLQueryItem(name: "status", value: "todo"),
            URLQueryItem(name: "status", value: "in_progress"),
            URLQueryItem(name: "is_recurring", value: "false"),
            URLQueryItem(name: "sorting", value: "position"),
            URLQueryItem(name: "limit", value: "200"),
        ]
        if let projectFilter {
            query.append(URLQueryItem(name: "project", value: projectFilter))
        }
        return query
    }

    private func doneQuery(page: Int) -> [URLQueryItem] {
        var query = [
            URLQueryItem(name: "status", value: "done"),
            URLQueryItem(name: "sorting", value: "-completed_at"),
            URLQueryItem(name: "limit", value: "50"),
            URLQueryItem(name: "page", value: String(page)),
        ]
        if let projectFilter {
            query.append(URLQueryItem(name: "project", value: projectFilter))
        }
        return query
    }

    private func allQuery() -> [URLQueryItem] {
        var query = [
            URLQueryItem(name: "sorting", value: "-created_at"),
            URLQueryItem(name: "limit", value: "200"),
        ]
        if let projectFilter {
            query.append(URLQueryItem(name: "project", value: projectFilter))
        }
        return query
    }
}
