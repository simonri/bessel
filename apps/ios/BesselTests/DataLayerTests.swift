import XCTest
@testable import Bessel

final class LenientDecodingTests: XCTestCase {
    func testSkipsItemsItCannotRead() throws {
        let json = #"{"items":[{"id":"3F2504E0-4F89-11D3-9A0C-0305E82C3301","name":"Ok"},{"id":"not-a-uuid","name":"Broken"},{"name":"No id"}]}"#
        struct Item: Decodable { let id: UUID; let name: String }
        struct Response: Decodable { @Lossy var items: [Item] }

        let response = try JSONDecoder.api.decode(Response.self, from: Data(json.utf8))

        XCTAssertEqual(response.items.map(\.name), ["Ok"])
    }

    func testUnknownEnumValuesDecodeAsUnknown() throws {
        let statuses = try JSONDecoder.api.decode([TaskStatus].self, from: Data(#"["todo","in_review","archived"]"#.utf8))

        XCTAssertEqual(statuses, [.todo, .inReview, .unknown])
        XCTAssertFalse(TaskStatus.allCases.contains(.unknown))
        XCTAssertEqual(try JSONDecoder.api.decode(RecipeType.self, from: Data(#""side""#.utf8)), .other)
    }
}

final class CalendarEventOrderTests: XCTestCase {
    private func allDay(_ title: String, from start: String, to end: String, id: String = UUID().uuidString) throws -> CalendarEvent {
        let json = """
        {"id":"\(id)","calendar_id":"\(UUID().uuidString)","title":"\(title)","all_day":true,
         "start_date":"\(start)","end_date":"\(end)","attendees":[],"busy":false,"recurring":false,"editable":true}
        """
        return try JSONDecoder.api.decode(CalendarEvent.self, from: Data(json.utf8))
    }

    func testTheSameEventsAlwaysComeOutInTheSameOrder() throws {
        let trip = try allDay("Trip", from: "2026-10-08", to: "2026-10-11")
        let birthday = try allDay("Birthday", from: "2026-10-08", to: "2026-10-09")
        let anniversary = try allDay("Anniversary", from: "2026-10-08", to: "2026-10-09")
        let expected = [trip.id, anniversary.id, birthday.id]

        for events in [[birthday, anniversary, trip], [trip, birthday, anniversary], [anniversary, trip, birthday]] {
            XCTAssertEqual(events.sorted(by: CalendarEvent.displayOrder).map(\.id), expected)
        }
    }

    func testSameTitlesFallBackToID() throws {
        let first = try allDay("Holiday", from: "2026-10-08", to: "2026-10-09", id: "00000000-0000-0000-0000-000000000001")
        let second = try allDay("Holiday", from: "2026-10-08", to: "2026-10-09", id: "00000000-0000-0000-0000-000000000002")

        XCTAssertEqual([second, first].sorted(by: CalendarEvent.displayOrder).map(\.id), [first.id, second.id])
    }
}

final class HealthSyncTests: XCTestCase {
    override func tearDown() {
        DailyMetricsSyncState.clear()
        super.tearDown()
    }

    func testFirstSyncReachesBackAMonthAndLaterOnesResendRecentDays() {
        let calendar = Calendar.current
        let now = calendar.date(from: DateComponents(year: 2026, month: 10, day: 8, hour: 14))!
        let today = calendar.startOfDay(for: now)

        DailyMetricsSyncState.clear()
        XCTAssertEqual(DailyMetricsSyncState.nextWindow(now: now).start, calendar.date(byAdding: .day, value: -35, to: today))

        DailyMetricsSyncState.lastDay = calendar.date(byAdding: .day, value: -1, to: today)
        let window = DailyMetricsSyncState.nextWindow(now: now)
        XCTAssertEqual(window.start, calendar.date(byAdding: .day, value: -3, to: today))
        XCTAssertEqual(window.end, calendar.date(byAdding: .day, value: 1, to: today))
    }

    func testSummaryDecodesWithoutAWatch() throws {
        let json = #"{"date":"2026-10-08","is_today":true,"sleep":null,"move":{"score":null,"label":"Getting to know you","is_partial_day":true,"steps":4000,"usual_steps":null,"active_energy_kcal":null,"usual_active_energy_kcal":null,"exercise_minutes":null,"workout_count":0,"workout_minutes":0},"energy":null,"insight":"Hi","bedtime_streak":0,"week":[]}"#
        let summary = try JSONDecoder.api.decode(HealthSummary.self, from: Data(json.utf8))

        XCTAssertNil(summary.energy)
        XCTAssertEqual(summary.move?.steps, 4000)
        XCTAssertFalse(summary.isEmpty)
    }
}

final class UserFacingErrorTests: XCTestCase {
    func testUsesTheServersSentence() {
        let error = APIError(statusCode: 400, detail: #"{"detail":"This calendar is read-only."}"#)
        XCTAssertEqual(error.userMessage, "This calendar is read-only.")
    }

    func testHidesValidationDetails() {
        let error = APIError(statusCode: 422, detail: #"{"detail":[{"loc":["body","title"],"msg":"Field required"}]}"#)
        XCTAssertEqual(error.userMessage, "Some of that didn't look right. Check it and try again.")
    }

    func testHidesServerInternals() {
        let error = APIError(statusCode: 500, detail: #"{"detail":"CREDENTIALS_ENCRYPTION_KEY is not configured"}"#)
        XCTAssertEqual(error.userMessage, "Something went wrong on our end. Try again in a moment.")
    }

    func testOffline() {
        XCTAssertEqual(URLError(.notConnectedToInternet).userMessage, "You're offline. Check your connection and try again.")
        XCTAssertTrue(URLError(.timedOut).isTransient)
        XCTAssertFalse(URLError(.cancelled).isTransient)
    }

    func testTellsAMissingEndpointFromAMissingItem() {
        XCTAssertTrue(APIError(statusCode: 404, detail: #"{"detail":"Not Found"}"#).isMissingRoute)
        XCTAssertFalse(APIError(statusCode: 404, detail: #"{"error":"ResourceNotFound","detail":"Task not found"}"#).isMissingRoute)
    }
}

final class AuthRejectionTests: XCTestCase {
    func testOnlyARefusedGrantEndsTheSession() {
        XCTAssertEqual(AuthSession.rejection(status: 403, body: Data(#"{"error":"invalid_grant"}"#.utf8)), "invalid_grant")
        XCTAssertNil(AuthSession.rejection(status: 429, body: Data(#"{"error":"too_many_requests"}"#.utf8)))
        XCTAssertNil(AuthSession.rejection(status: 503, body: Data("upstream down".utf8)))
        XCTAssertNil(AuthSession.rejection(status: 400, body: Data("<html>".utf8)))
    }
}

@MainActor
final class LoadGenerationTests: XCTestCase {
    func testOnlyTheNewestLoadLands() {
        var loads = LoadGeneration()
        let first = loads.begin()
        let second = loads.begin()

        XCTAssertFalse(loads.isCurrent(first))
        XCTAssertTrue(loads.isCurrent(second))
    }

    func testALocalChangeVoidsLoadsAlreadyOnTheWay() {
        var loads = LoadGeneration()
        let ticket = loads.begin()
        loads.finish(ticket)
        XCTAssertFalse(loads.isStale(maxAge: 60))

        let inFlight = loads.begin()
        loads.invalidate()

        XCTAssertFalse(loads.isCurrent(inFlight))
        XCTAssertTrue(loads.isStale(maxAge: 60))
    }
}

@MainActor
final class SerialQueuesTests: XCTestCase {
    func testChangesToOneItemRunInOrder() async {
        let queues = SerialQueues<Int>()
        var log: [String] = []

        async let slow: Void = queues.run(1) {
            try? await Task.sleep(for: .milliseconds(50))
            log.append("edit")
        }
        try? await Task.sleep(for: .milliseconds(5))
        async let fast: Void = queues.run(1) { log.append("delete") }
        _ = await (slow, fast)

        XCTAssertEqual(log, ["edit", "delete"])
    }

    func testPassesResultsAndErrorsThrough() async throws {
        let queues = SerialQueues<Int>()
        let value = try await queues.run(1) { 42 }
        XCTAssertEqual(value, 42)

        do {
            _ = try await queues.run(1) { () async throws -> Int in throw URLError(.timedOut) }
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual((error as? URLError)?.code, .timedOut)
        }
    }
}

@MainActor
final class ResponseCacheTests: XCTestCase {
    func testRoundTripsWhatTheApiSends() throws {
        let json = #"""
        {"id":"3F2504E0-4F89-11D3-9A0C-0305E82C3301","created_at":"2026-10-01T08:30:00.123456","modified_at":null,
         "title":"Water plants","description":null,"status":"todo","priority":2,"due_date":"2026-10-07","completed_at":null,
         "project":"Home","tags":null,"position":1000,"is_recurring":true,"rrule_frequency":"weekly",
         "rrule_interval":1,"rrule_day_of_week":null,"rrule_day_of_month":null,"parent_task_id":null}
        """#
        let task = try JSONDecoder.api.decode(TaskItem.self, from: Data(json.utf8))
        let cache = ResponseCache(account: "auth0|test", root: temporaryURL("cache"))

        cache.save([task], as: "tasks")
        let restored = try XCTUnwrap(cache.load([TaskItem].self, key: "tasks"))

        XCTAssertEqual(restored.first?.title, task.title)
        XCTAssertEqual(restored.first?.dueDate, task.dueDate)
        XCTAssertEqual(restored.first?.isRecurring, true)
    }

    func testAccountsDoNotShare() {
        let root = temporaryURL("cache")
        ResponseCache(account: "alice", root: root).save(["secret"], as: "notes")

        XCTAssertNil(ResponseCache(account: "bob", root: root).load([String].self, key: "notes"))
    }
}

@MainActor
final class DeleteOutboxTests: XCTestCase {
    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
    }

    func testAQueuedDeleteSurvivesARelaunch() {
        let file = temporaryURL("outbox.json")
        let id = UUID()
        DeleteOutbox(client: makeTestClient(), account: "alice", fileURL: file).schedule(id, path: "/v1/tasks/\(id)")

        let relaunched = DeleteOutbox(client: makeTestClient(), account: "alice", fileURL: file)

        XCTAssertEqual(relaunched.pendingIDs, [id])
    }

    func testAnotherAccountDoesNotInheritDeletes() {
        let file = temporaryURL("outbox.json")
        DeleteOutbox(client: makeTestClient(), account: "alice", fileURL: file).schedule(UUID(), path: "/v1/tasks/x")

        XCTAssertTrue(DeleteOutbox(client: makeTestClient(), account: "bob", fileURL: file).pendingIDs.isEmpty)
    }

    func testUndoForgetsTheDelete() {
        let file = temporaryURL("outbox.json")
        let id = UUID()
        let outbox = DeleteOutbox(client: makeTestClient(), account: "alice", fileURL: file)
        outbox.schedule(id, path: "/v1/tasks/\(id)")

        XCTAssertTrue(outbox.cancel(id))

        XCTAssertTrue(DeleteOutbox(client: makeTestClient(), account: "alice", fileURL: file).pendingIDs.isEmpty)
    }

    func testRetrySendsLeftoverDeletesAndCountsGoneAsDone() async {
        let file = temporaryURL("outbox.json")
        let id = UUID()
        DeleteOutbox(client: makeTestClient(), account: "alice", fileURL: file).schedule(id, path: "/v1/tasks/\(id)")
        MockURLProtocol.respond(with: [(404, [:], #"{"detail":"Task not found"}"#)])
        let relaunched = DeleteOutbox(client: makeTestClient(), account: "alice", fileURL: file)

        await relaunched.retry()

        XCTAssertEqual(MockURLProtocol.requests.map(\.httpMethod), ["DELETE"])
        XCTAssertTrue(relaunched.pendingIDs.isEmpty)
    }

    func testKeepsADeleteThatCouldNotGetThrough() async {
        let file = temporaryURL("outbox.json")
        let id = UUID()
        DeleteOutbox(client: makeTestClient(), account: "alice", fileURL: file).schedule(id, path: "/v1/tasks/\(id)")
        MockURLProtocol.responder = { _ in throw URLError(.notConnectedToInternet) }
        let relaunched = DeleteOutbox(client: makeTestClient(), account: "alice", fileURL: file)

        await relaunched.retry()

        XCTAssertEqual(relaunched.pendingIDs, [id])
    }
}
