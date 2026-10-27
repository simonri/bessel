import XCTest
@testable import Bessel

@MainActor
final class TaskQueueTests: XCTestCase {
    private var queueFile: URL!

    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
        queueFile = temporaryURL("task-queue.json")
    }

    private func makeStore() -> TasksStore {
        let client = makeTestClient(retryPolicy: RetryPolicy(maxAttempts: 1, baseDelay: 0, maxRetryAfter: 0))
        let services = AppServices(
            client: client,
            account: "alice",
            outbox: DeleteOutbox(client: client, account: "alice", fileURL: temporaryURL("deletes.json")),
            cache: ResponseCache(account: "alice", root: temporaryURL("cache"))
        )
        return TasksStore(services: services, queue: TaskQueue(account: "alice", fileURL: queueFile))
    }

    private func created(_ title: String) -> Data {
        Data(#"{"id":"\#(UUID())","title":"\#(title)","status":"todo","priority":0,"position":1000,"is_recurring":false,"created_at":"2026-10-27T08:00:00Z","attachments":[]}"#.utf8)
    }

    private func draft(_ title: String) -> TaskCreate {
        TaskCreate(title: title, description: nil, status: .todo, priority: 0, dueDate: nil, project: nil)
    }

    func testOfflineATaskWaitsInTodayAndSurvivesARelaunch() async throws {
        let store = makeStore()
        MockURLProtocol.responder = { _ in throw URLError(.notConnectedToInternet) }

        let sent = try await store.create(draft("Call the dentist"))

        XCTAssertFalse(sent)
        XCTAssertEqual(store.queued.map(\.title), ["Call the dentist"])
        XCTAssertEqual(store.whenGroups().flatMap(\.tasks).map(\.title), ["Call the dentist"])
        XCTAssertEqual(TaskQueue(account: "alice", fileURL: queueFile).tasks.map(\.draft.title), ["Call the dentist"])
        XCTAssertTrue(TaskQueue(account: "bob", fileURL: queueFile).tasks.isEmpty, "Another account doesn't see it")
    }

    func testBackOnlineItGoesOnceWithTheSameKeyEveryTime() async throws {
        let store = makeStore()
        MockURLProtocol.responder = { _ in throw URLError(.notConnectedToInternet) }
        try await store.create(draft("Call the dentist"))
        let firstKey = MockURLProtocol.requests.last?.value(forHTTPHeaderField: "Idempotency-Key")

        MockURLProtocol.responder = { _ in (201, [:], self.created("Call the dentist")) }
        try await store.sendQueued()

        let keys = MockURLProtocol.requests.compactMap { $0.value(forHTTPHeaderField: "Idempotency-Key") }
        XCTAssertEqual(Set(keys).count, 1, "Every attempt for one task carries one key")
        XCTAssertEqual(keys.first, firstKey)
        XCTAssertTrue(store.queued.isEmpty)
        XCTAssertEqual(store.open.map(\.title), ["Call the dentist"])
    }

    func testOneTheServerTurnsDownIsDroppedAndSaid() async throws {
        let store = makeStore()
        MockURLProtocol.responder = { _ in throw URLError(.notConnectedToInternet) }
        try await store.create(draft("First"))
        try await store.create(draft("Second"))

        MockURLProtocol.respond(with: [
            (422, [:], #"{"detail":"A task needs a title."}"#),
            (201, [:], String(decoding: created("Second"), as: UTF8.self)),
        ])
        try await store.sendQueued()

        XCTAssertTrue(store.queued.isEmpty)
        XCTAssertEqual(store.open.map(\.title), ["Second"], "A refused one doesn't hold up the rest")
        XCTAssertEqual(store.errorMessage, "\u{201C}First\u{201D} couldn't be added. A task needs a title.")
    }

    func testDeletingAWaitingTaskJustDropsIt() async throws {
        let store = makeStore()
        MockURLProtocol.responder = { _ in throw URLError(.notConnectedToInternet) }
        try await store.create(draft("Call the dentist"))

        store.discardQueued(store.queued[0])

        XCTAssertTrue(store.queued.isEmpty)
        XCTAssertTrue(TaskQueue(account: "alice", fileURL: queueFile).tasks.isEmpty)
    }
}
