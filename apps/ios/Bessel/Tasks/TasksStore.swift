import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class TasksStore {
    enum Mode: String, CaseIterable, Identifiable {
        case today = "Today"
        case board = "Board"
        case done = "Done"

        var id: String { rawValue }
    }

    /// Open tasks grouped by when they matter, mirroring the web Today view.
    struct WhenGroup: Identifiable {
        enum Key: String {
            case doing, overdue, today, week, later, someday
        }

        let key: Key
        let tasks: [TaskItem]
        var id: Key { key }

        var title: String {
            switch key {
            case .doing: "Doing"
            case .overdue: "Overdue"
            case .today: "Today"
            case .week: "This week"
            case .later: "Later"
            case .someday: "Someday"
            }
        }
    }

    var mode: Mode = .today
    /// Projects to show; empty shows everything.
    var projectFilter: Set<String> = []
    private(set) var open: [TaskItem] = []
    private(set) var done: [TaskItem] = []
    private(set) var projects: [String] = []
    private(set) var areas: [String] = []
    private(set) var hasLoaded = false
    /// A change that didn't go through; shown as an alert.
    var errorMessage: String?
    /// A refresh that didn't go through; shown quietly over what's already there.
    var loadError: String?

    private let client: APIClient
    private let outbox: DeleteOutbox
    private let cache: ResponseCache
    @ObservationIgnored private var loads = LoadGeneration()
    @ObservationIgnored private let changes = SerialQueues<UUID>()
    private var donePage = 1
    private var doneMaxPage = 1
    /// Bumped by every full load, so a "load more" that started before it
    /// doesn't append a page from the old list.
    @ObservationIgnored private var doneEpoch = 0

    private struct Snapshot: Codable {
        let open: [TaskItem]
        let done: [TaskItem]
        let doneMaxPage: Int
        let projects: [String]
        let areas: [String]
    }

    private static let cacheKey = "tasks.v1"

    init(services: AppServices) {
        client = services.client
        outbox = services.outbox
        cache = services.cache
        if let snapshot = cache.load(Snapshot.self, key: Self.cacheKey) {
            let pending = outbox.pendingIDs
            open = snapshot.open.filter { !pending.contains($0.id) && $0.status != .unknown }
            done = snapshot.done.filter { !pending.contains($0.id) }
            doneMaxPage = snapshot.doneMaxPage
            projects = snapshot.projects
            areas = snapshot.areas
            hasLoaded = true
        }
    }

    var canLoadMoreDone: Bool { donePage < doneMaxPage }

    // MARK: - Derived lists

    private func matchesFilter(_ task: TaskItem) -> Bool {
        projectFilter.isEmpty || task.project.map(projectFilter.contains) == true
    }

    var routines: [TaskItem] {
        open.filter { $0.isRecurring && matchesFilter($0) }
    }

    var oneOffs: [TaskItem] {
        open.filter { !$0.isRecurring && matchesFilter($0) }
    }

    var boardTodo: [TaskItem] { oneOffs.filter { $0.status == .todo } }
    var boardDoing: [TaskItem] { oneOffs.filter { $0.status == .inProgress } }
    var visibleDone: [TaskItem] { done.filter(matchesFilter) }

    func whenGroups(now: Date = .now) -> [WhenGroup] {
        var buckets: [WhenGroup.Key: [TaskItem]] = [:]
        for task in oneOffs {
            buckets[when(task, now: now), default: []].append(task)
        }
        buckets[.overdue]?.sort { ($0.dueDate ?? .distantPast) < ($1.dueDate ?? .distantPast) }
        let order: [WhenGroup.Key] = [.doing, .overdue, .today, .week, .later, .someday]
        return order.compactMap { key in
            guard let tasks = buckets[key], !tasks.isEmpty else { return nil }
            return WhenGroup(key: key, tasks: tasks)
        }
    }

    private func when(_ task: TaskItem, now: Date) -> WhenGroup.Key {
        if task.status == .inProgress { return .doing }
        guard let due = task.dueDate else { return .someday }
        let days = TaskItem.daysUntil(due, now: now)
        if days < 0 { return .overdue }
        if days == 0 { return .today }
        if days < 7 { return .week }
        return .later
    }

    /// Done today vs. everything that was in play for today.
    var progress: (done: Int, total: Int, thisWeek: Int) {
        let now = Date.now
        let doneToday = done.filter { $0.completedAt.map(Calendar.current.isDateInToday) ?? false }.count
        let thisWeek = done.filter { ($0.completedAt.map { now.timeIntervalSince($0) } ?? .infinity) < 7 * 86_400 }.count
        let inPlay = open.filter { task in
            !task.isRecurring && (task.status == .inProgress
                || (task.dueDate.map { TaskItem.daysUntil($0, now: now) <= 0 } ?? false))
        }.count
        return (doneToday, doneToday + inPlay, thisWeek)
    }

    // MARK: - Loading

    func loadIfStale() async {
        guard loads.isStale(maxAge: AppServices.freshFor) else { return }
        await load()
    }

    func load() async {
        let ticket = loads.begin()
        defer { hasLoaded = true }
        do {
            async let openTask: [TaskItem] = client.getAllPages("/v1/tasks", query: [
                URLQueryItem(name: "status", value: "todo"),
                URLQueryItem(name: "status", value: "in_progress"),
                URLQueryItem(name: "sorting", value: "position"),
            ])
            async let doneTask: TaskListResponse = client.get("/v1/tasks", query: doneQuery(page: 1))
            async let projectsTask: [Project] = client.get("/v1/projects")
            async let areasTask: [String] = client.get("/v1/tasks/areas")
            let (openItems, doneResponse, projectList, areaList) = try await (openTask, doneTask, projectsTask, areasTask)
            guard loads.isCurrent(ticket) else { return }

            let pending = outbox.pendingIDs
            open = openItems.filter { !pending.contains($0.id) && $0.status != .unknown }
            done = doneResponse.items.filter { !pending.contains($0.id) }
            donePage = 1
            doneMaxPage = doneResponse.pagination.maxPage
            doneEpoch += 1
            projects = projectList.map(\.name).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
            areas = areaList
            loadError = nil
            loads.finish(ticket)
            cache.save(Snapshot(open: openItems, done: doneResponse.items, doneMaxPage: doneMaxPage, projects: projects, areas: areas), as: Self.cacheKey)
        } catch {
            guard loads.isCurrent(ticket), !error.isCancellation else { return }
            loadError = error.userMessage
        }
    }

    func loadMoreDone() async {
        guard canLoadMoreDone else { return }
        let epoch = doneEpoch
        do {
            let response: TaskListResponse = try await client.get("/v1/tasks", query: doneQuery(page: donePage + 1))
            guard epoch == doneEpoch else { return }
            donePage += 1
            doneMaxPage = response.pagination.maxPage
            let known = Set(done.map(\.id)).union(outbox.pendingIDs)
            done += response.items.filter { !known.contains($0.id) }
        } catch {
            guard !error.isCancellation else { return }
            loadError = error.userMessage
        }
    }

    private func doneQuery(page: Int) -> [URLQueryItem] {
        [
            URLQueryItem(name: "status", value: "done"),
            URLQueryItem(name: "sorting", value: "-completed_at"),
            URLQueryItem(name: "limit", value: "50"),
            URLQueryItem(name: "page", value: String(page)),
        ]
    }

    // MARK: - Mutations

    func create(_ draft: TaskCreate) async throws {
        loads.invalidate()
        let created: TaskItem = try await client.post("/v1/tasks", body: draft)
        withAnimation(.snappy) { place(created) }
        rememberProject(created.project)
    }

    func update(_ task: TaskItem, with update: TaskUpdate) async throws {
        loads.invalidate()
        let updated: TaskItem = try await changes.run(task.id) { [client] in
            try await client.patch("/v1/tasks/\(task.id)", body: update)
        }
        withAnimation(.snappy) { place(updated) }
        rememberProject(updated.project)
    }

    func complete(_ task: TaskItem, toasts: ToastCenter) async {
        loads.invalidate()
        withAnimation(.snappy) { open.removeAll { $0.id == task.id } }
        do {
            let response: TaskCompleteResponse = try await changes.run(task.id) { [client] in
                try await client.post("/v1/tasks/\(task.id)/complete")
            }
            withAnimation(.snappy) {
                place(response.completedTask)
                if let next = response.nextTask, next.status != .done {
                    place(next)
                }
            }
            toasts.show(completionMessage) { [weak self] in
                Task { await self?.undoComplete(response) }
            }
        } catch {
            report(error)
            await load()
        }
    }

    /// Puts the task back and removes the next occurrence it spawned, in one
    /// request where the server supports it so the two can't come apart.
    private func undoComplete(_ response: TaskCompleteResponse) async {
        loads.invalidate()
        let task = response.completedTask
        if let next = response.nextTask {
            withAnimation(.snappy) { open.removeAll { $0.id == next.id } }
        }
        do {
            let reopened: TaskItem = try await changes.run(task.id) { [client] in
                do {
                    return try await client.post("/v1/tasks/\(task.id)/undo-complete")
                } catch let error as APIError where error.isMissingRoute {
                    // An older server: the same thing in two steps.
                    if let next = response.nextTask {
                        try? await client.deleteNoContent("/v1/tasks/\(next.id)")
                    }
                    return try await client.post("/v1/tasks/\(task.id)/reopen")
                }
            }
            withAnimation(.snappy) { place(reopened) }
        } catch {
            report(error)
            await load()
        }
    }

    func reopen(_ task: TaskItem) async {
        loads.invalidate()
        do {
            let reopened: TaskItem = try await changes.run(task.id) { [client] in
                try await client.post("/v1/tasks/\(task.id)/reopen")
            }
            withAnimation(.snappy) { place(reopened) }
        } catch {
            report(error)
        }
    }

    /// Hides the task right away and deletes it for real after the undo
    /// window, so Undo never has to recreate it.
    func delete(_ task: TaskItem, toasts: ToastCenter) {
        loads.invalidate()
        let wasOpen = open.contains { $0.id == task.id }
        withAnimation(.snappy) {
            open.removeAll { $0.id == task.id }
            done.removeAll { $0.id == task.id }
        }
        outbox.schedule(task.id, path: "/v1/tasks/\(task.id)")
        toasts.show("Task deleted") { [weak self] in
            guard let self, outbox.cancel(task.id) else { return }
            withAnimation(.snappy) {
                if wasOpen {
                    self.open.append(task)
                    self.open.sort { $0.position < $1.position }
                } else {
                    self.done.insert(task, at: 0)
                }
            }
        }
    }

    /// Reorders within one board column and renormalizes that column's positions
    /// to (index + 1) * 1000, the same renormalization the web board uses.
    func move(in status: TaskStatus, from source: IndexSet, to destination: Int) async {
        var column = status == .todo ? boardTodo : boardDoing
        column.move(fromOffsets: source, toOffset: destination)
        let reordered = column.enumerated().map { index, task in
            var task = task
            task.position = Double(index + 1) * 1000
            return task
        }
        loads.invalidate()
        let positions = Dictionary(uniqueKeysWithValues: reordered.map { ($0.id, $0.position) })
        open = open.map { task in
            var task = task
            if let position = positions[task.id] { task.position = position }
            return task
        }.sorted { $0.position < $1.position }
        do {
            try await client.patchNoContent(
                "/v1/tasks/reorder",
                body: reordered.map { TaskReorderItem(id: $0.id, position: $0.position) }
            )
        } catch {
            report(error)
            await load()
        }
    }

    private func place(_ task: TaskItem) {
        open.removeAll { $0.id == task.id }
        done.removeAll { $0.id == task.id }
        switch task.status {
        case .todo, .inProgress:
            open.append(task)
            open.sort { $0.position < $1.position }
        case .done:
            done.insert(task, at: 0)
        case .cancelled, .unknown:
            break
        }
    }

    private func rememberProject(_ project: String?) {
        guard let project, !projects.contains(project) else { return }
        projects.append(project)
        projects.sort { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    private var completionMessage: String {
        let remaining = progress.total - progress.done
        if progress.total > 0, remaining == 0 { return "All done for today ✨" }
        return ["Nice one ✓", "Done ✓", "One less thing ✓"].randomElement()!
    }

    private func report(_ error: Error) {
        if error.isCancellation { return }
        errorMessage = error.userMessage
    }
}
