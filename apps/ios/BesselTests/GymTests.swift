import XCTest
@testable import Bessel

final class GymChangeTests: XCTestCase {
    private let bench = UUID()

    private func exercise(sets: [GymSet] = [], best: GymSet? = nil) -> GymExercise {
        GymExercise(id: bench, name: "Bench press", muscles: [], createdAt: .distantPast, lastSet: sets.last, bestSet: best ?? sets.max { $0.weightKg < $1.weightKg }, recentSets: sets)
    }

    func testLoggingADayReplacesThatDayAndMovesTheBest() {
        var list = [exercise(sets: [GymSet(performedOn: "2026-10-01", weightKg: 60)])]

        GymChange.saveSet(exerciseID: bench, day: "2026-10-08", weightKg: 62.5).apply(to: &list)
        GymChange.saveSet(exerciseID: bench, day: "2026-10-08", weightKg: 65).apply(to: &list)

        XCTAssertEqual(list[0].recentSets.map(\.weightKg), [60, 65])
        XCTAssertEqual(list[0].lastSet, GymSet(performedOn: "2026-10-08", weightKg: 65))
        XCTAssertEqual(list[0].bestSet?.weightKg, 65)
    }

    func testAnOlderBestOutsideTheRecentSetsStands() {
        let old = GymSet(performedOn: "2026-01-01", weightKg: 80)
        var list = [exercise(sets: [GymSet(performedOn: "2026-10-01", weightKg: 60)], best: old)]

        GymChange.saveSet(exerciseID: bench, day: "2026-10-08", weightKg: 70).apply(to: &list)

        XCTAssertEqual(list[0].bestSet, old)
    }

    func testRemovingTheBestDayFallsBackToTheNextHeaviest() {
        var list = [exercise(sets: [GymSet(performedOn: "2026-10-01", weightKg: 60), GymSet(performedOn: "2026-10-08", weightKg: 70)])]

        GymChange.deleteSet(exerciseID: bench, day: "2026-10-08").apply(to: &list)

        XCTAssertEqual(list[0].bestSet, GymSet(performedOn: "2026-10-01", weightKg: 60))
        XCTAssertEqual(list[0].lastSet, GymSet(performedOn: "2026-10-01", weightKg: 60))
    }

    func testAddingRenamingAndDeletingExercises() {
        var list: [GymExercise] = []
        let squat = UUID()

        GymChange.saveExercise(id: squat, name: "Squat", muscles: [.quads, .glutes]).apply(to: &list)
        GymChange.saveExercise(id: squat, name: "Back squat", muscles: nil).apply(to: &list)
        XCTAssertEqual(list.map(\.name), ["Back squat"])
        XCTAssertEqual(list.first?.muscles, [.quads, .glutes], "A rename keeps the muscles")

        GymChange.deleteExercise(id: squat).apply(to: &list)
        XCTAssertTrue(list.isEmpty)
    }

    func testReadsCommaDecimals() {
        XCTAssertEqual(GymFormat.parse("62,5"), 62.5)
        XCTAssertEqual(GymFormat.parse(" 60 "), 60)
        XCTAssertNil(GymFormat.parse("sixty"))
    }
}

@MainActor
final class GymStoreTests: XCTestCase {
    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
    }

    private func makeStore() -> GymStore {
        let client = makeTestClient()
        return GymStore(
            client: client,
            cache: ResponseCache(account: "alice", root: temporaryURL("cache")),
            outbox: GymOutbox(client: client, account: "alice", fileURL: temporaryURL("gym.json"))
        )
    }

    func testAQueuedSetSurvivesALoadThatDoesNotHaveItYet() async {
        let store = makeStore()
        MockURLProtocol.responder = { _ in throw URLError(.notConnectedToInternet) }
        let squat = store.addExercise(named: "Squat")!
        store.logTopSet(squat, weightKg: 80, on: "2026-10-08")
        await store.sendChanges()

        // Back online, but the list comes back without the offline changes:
        // they're still sent first, so this can only happen if sending fails.
        MockURLProtocol.responder = { request in
            if request.httpMethod == "GET" { return (200, [:], Data(#"{"exercises":[]}"#.utf8)) }
            throw URLError(.notConnectedToInternet)
        }
        await store.load()

        XCTAssertEqual(store.exercises.map(\.name), ["Squat"])
        XCTAssertEqual(store.exercises.first?.lastSet, GymSet(performedOn: "2026-10-08", weightKg: 80))
    }

    func testSentChangesStayShownAfterTheyLeaveTheQueue() async {
        let store = makeStore()
        MockURLProtocol.responder = { request in
            let body = request.url!.path.contains("/sets/") ? #"{"performed_on":"2026-10-08","weight_kg":80}"# : #"{"id":"\#(UUID())"}"#
            return (200, [:], Data(body.utf8))
        }
        let squat = store.addExercise(named: "Squat")!
        store.logTopSet(squat, weightKg: 80, on: "2026-10-08")

        await store.sendChanges()

        XCTAssertTrue(store.outbox.isEmpty)
        XCTAssertEqual(store.exercises.first?.lastSet?.weightKg, 80)
    }

    func testNewBestOnlyWhenBeatingAnEarlierDay() {
        let store = makeStore()
        MockURLProtocol.responder = { _ in throw URLError(.notConnectedToInternet) }
        let squat = store.addExercise(named: "Squat")!

        XCTAssertFalse(store.logTopSet(squat, weightKg: 60, on: "2026-10-01"), "The first set isn't a new best")
        XCTAssertTrue(store.logTopSet(squat, weightKg: 62.5, on: "2026-10-08"))
        XCTAssertFalse(store.logTopSet(squat, weightKg: 65, on: "2026-10-08"), "Correcting today's set isn't a second best")
    }

    func testMusclesToggleAndFilter() {
        let store = makeStore()
        MockURLProtocol.responder = { _ in throw URLError(.notConnectedToInternet) }
        let bench = store.addExercise(named: "Bench press", muscles: [.triceps, .chest])!
        store.addExercise(named: "Squat")

        XCTAssertEqual(bench.muscles, [.chest, .triceps])
        store.toggle(.shoulders, for: bench)
        store.toggle(.triceps, for: bench)

        XCTAssertEqual(store.exercise(bench.id)?.muscles, [.chest, .shoulders])
        XCTAssertEqual(store.musclesInUse, [.chest, .shoulders])
        XCTAssertEqual(store.exercise(bench.id)?.musclesLabel, "Chest · Shoulders")
    }

    func testSearchByNameOrMuscleWithinAFilter() {
        let store = makeStore()
        MockURLProtocol.responder = { _ in throw URLError(.notConnectedToInternet) }
        store.addExercise(named: "Bench press", muscles: [.chest, .triceps])
        store.addExercise(named: "Incline press", muscles: [.chest, .shoulders])
        store.addExercise(named: "Squat", muscles: [.quads])

        XCTAssertEqual(Set(store.exercises(matching: "press", muscle: nil).map(\.name)), ["Bench press", "Incline press"])
        XCTAssertEqual(Set(store.exercises(matching: "chest", muscle: nil).map(\.name)), ["Bench press", "Incline press"])
        XCTAssertEqual(store.exercises(matching: "", muscle: .triceps).map(\.name), ["Bench press"])
        XCTAssertEqual(store.exercises(matching: "incline ", muscle: .chest).map(\.name), ["Incline press"])
        XCTAssertTrue(store.exercises(matching: "squat", muscle: .chest).isEmpty)
    }

    func testNamesAreUniqueIgnoringCase() {
        let store = makeStore()
        MockURLProtocol.responder = { _ in throw URLError(.notConnectedToInternet) }

        XCTAssertNotNil(store.addExercise(named: "  Bench   press "))
        XCTAssertNil(store.addExercise(named: "bench press"))
        XCTAssertEqual(store.exercises.map(\.name), ["Bench press"])
        XCTAssertNotNil(store.errorMessage)
    }
}

@MainActor
final class GymOutboxTests: XCTestCase {
    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
    }

    func testSendsInOrderAndReportsWhatArrived() async {
        let outbox = GymOutbox(client: makeTestClient(), account: "alice", fileURL: temporaryURL("gym.json"))
        let id = UUID()
        outbox.enqueue(.saveExercise(id: id, name: "Squat", muscles: nil))
        outbox.enqueue(.saveSet(exerciseID: id, day: "2026-10-08", weightKg: 80))
        MockURLProtocol.responder = { request in
            let body = request.url!.path.hasSuffix("2026-10-08") ? #"{"performed_on":"2026-10-08","weight_kg":80}"# : #"{"id":"\#(id)"}"#
            return (200, [:], Data(body.utf8))
        }
        var reached: [GymChange] = []

        let finished = await outbox.send { reached.append($0) }

        XCTAssertTrue(finished)
        XCTAssertEqual(MockURLProtocol.requests.map { $0.url!.path }, ["/v1/gym/exercises/\(id)", "/v1/gym/exercises/\(id)/sets/2026-10-08"])
        XCTAssertEqual(reached.count, 2)
        XCTAssertTrue(outbox.isEmpty)
    }

    func testStopsAtTheFirstChangeThatCantGetThroughAndKeepsTheRest() async {
        let file = temporaryURL("gym.json")
        let outbox = GymOutbox(client: makeTestClient(), account: "alice", fileURL: file)
        let id = UUID()
        outbox.enqueue(.saveExercise(id: id, name: "Squat", muscles: nil))
        outbox.enqueue(.saveSet(exerciseID: id, day: "2026-10-08", weightKg: 80))
        MockURLProtocol.responder = { _ in throw URLError(.notConnectedToInternet) }

        let finished = await outbox.send()

        XCTAssertFalse(finished)
        XCTAssertEqual(MockURLProtocol.requests.count, 1, "Nothing after the first is tried, so order holds")
        let relaunched = GymOutbox(client: makeTestClient(), account: "alice", fileURL: file)
        XCTAssertEqual(relaunched.changes.count, 2)
        XCTAssertTrue(GymOutbox(client: makeTestClient(), account: "bob", fileURL: file).isEmpty)
    }

    func testAChangeToSomethingAlreadyGoneCountsAsDone() async {
        let outbox = GymOutbox(client: makeTestClient(), account: "alice", fileURL: temporaryURL("gym.json"))
        outbox.enqueue(.deleteExercise(id: UUID()))
        MockURLProtocol.respond(with: [(404, [:], #"{"detail":"Exercise not found"}"#)])

        let finished = await outbox.send()

        XCTAssertTrue(finished)
        XCTAssertTrue(outbox.isEmpty)
    }
}
