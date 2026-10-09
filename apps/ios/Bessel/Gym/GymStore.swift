import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class GymStore {
    /// Most recently trained first, with changes still on their way already in.
    private(set) var exercises: [GymExercise] = []
    private(set) var hasLoaded = false
    /// A change that couldn't be made; shown as an alert.
    var errorMessage: String?
    /// A refresh that didn't go through; shown quietly over what's already there.
    var loadError: String?

    private let client: APIClient
    private let cache: ResponseCache
    @ObservationIgnored let outbox: GymOutbox
    @ObservationIgnored private var loads = LoadGeneration()
    /// What the server last said, before the waiting changes go on top.
    @ObservationIgnored private var server: [GymExercise] = []
    private static let cacheKey = "gym.v2"

    convenience init(services: AppServices) {
        self.init(client: services.client, cache: services.cache, outbox: GymOutbox(client: services.client, account: services.account))
    }

    init(client: APIClient, cache: ResponseCache, outbox: GymOutbox) {
        self.client = client
        self.cache = cache
        self.outbox = outbox
        if let saved = cache.load([GymExercise].self, key: Self.cacheKey) {
            server = saved
            hasLoaded = true
        }
        rebuild()
    }

    /// Today as the server stores it.
    nonisolated static func today(_ now: Date = .now) -> String {
        DateParsing.dateOnly.string(from: now)
    }

    func exercise(_ id: UUID) -> GymExercise? {
        exercises.first { $0.id == id }
    }

    func isNameTaken(_ name: String, except id: UUID? = nil) -> Bool {
        let wanted = Self.tidy(name).lowercased()
        return exercises.contains { $0.id != id && $0.name.lowercased() == wanted }
    }

    // MARK: - Loading

    func loadIfStale() async {
        await sendChanges()
        guard loads.isStale(maxAge: AppServices.freshFor) else { return }
        await load()
    }

    /// Sends waiting changes first, so the list that comes back already has them.
    func load() async {
        await sendChanges()
        let ticket = loads.begin()
        defer { hasLoaded = true }
        do {
            let response: GymExerciseListResponse = try await client.get("/v1/gym/exercises")
            guard loads.isCurrent(ticket) else { return }
            server = response.exercises
            rebuild()
            loadError = nil
            loads.finish(ticket)
            cache.save(server, as: Self.cacheKey)
        } catch {
            guard loads.isCurrent(ticket), !error.isCancellation else { return }
            loadError = error.userMessage
        }
    }

    /// Every top set of an exercise, oldest first. Offline, the recent ones.
    func history(of exercise: GymExercise) async -> [GymSet] {
        do {
            let response: GymSetListResponse = try await client.get("/v1/gym/exercises/\(exercise.id)/sets")
            var sets = response.sets
            for change in outbox.changes where change.exerciseID == exercise.id {
                switch change {
                case let .saveSet(_, day, weightKg):
                    sets.removeAll { $0.performedOn == day }
                    sets.append(GymSet(performedOn: day, weightKg: weightKg))
                case let .deleteSet(_, day):
                    sets.removeAll { $0.performedOn == day }
                default:
                    break
                }
            }
            return sets.sorted { $0.performedOn < $1.performedOn }
        } catch {
            return self.exercise(exercise.id)?.recentSets ?? exercise.recentSets
        }
    }

    // MARK: - Changes

    /// Narrowed to a muscle group, then to what's typed: part of a name, or a
    /// muscle like "chest".
    func exercises(matching search: String, muscle: GymMuscle?) -> [GymExercise] {
        let search = search.trimmingCharacters(in: .whitespaces)
        return exercises.filter { exercise in
            if let muscle, !exercise.muscles.contains(muscle) { return false }
            guard !search.isEmpty else { return true }
            return exercise.name.localizedCaseInsensitiveContains(search)
                || exercise.muscles.contains { $0.label.localizedCaseInsensitiveContains(search) }
        }
    }

    /// Muscles any exercise works, in the usual order: the filters worth showing.
    var musclesInUse: [GymMuscle] {
        GymMuscle.ordered(exercises.flatMap(\.muscles))
    }

    /// Adds an exercise and returns it, or nil if the name is empty or taken.
    @discardableResult
    func addExercise(named name: String, muscles: Set<GymMuscle> = []) -> GymExercise? {
        let name = Self.tidy(name)
        guard !name.isEmpty else { return nil }
        guard !isNameTaken(name) else {
            errorMessage = "You already have an exercise called \(name)."
            return nil
        }
        let id = UUID()
        make(.saveExercise(id: id, name: name, muscles: GymMuscle.ordered(muscles)))
        return exercise(id)
    }

    func rename(_ exercise: GymExercise, to name: String) {
        let name = Self.tidy(name)
        guard !name.isEmpty, name != exercise.name else { return }
        guard !isNameTaken(name, except: exercise.id) else {
            errorMessage = "You already have an exercise called \(name)."
            return
        }
        make(.saveExercise(id: exercise.id, name: name, muscles: nil))
    }

    /// Turns one muscle group on or off for an exercise.
    func toggle(_ muscle: GymMuscle, for exercise: GymExercise) {
        guard let current = self.exercise(exercise.id) else { return }
        var muscles = Set(current.muscles)
        if muscles.contains(muscle) { muscles.remove(muscle) } else { muscles.insert(muscle) }
        make(.saveExercise(id: current.id, name: current.name, muscles: GymMuscle.ordered(muscles)))
    }

    func delete(_ exercise: GymExercise) {
        make(.deleteExercise(id: exercise.id))
    }

    /// Logs the day's top set and says whether it beats the best so far.
    @discardableResult
    func logTopSet(_ exercise: GymExercise, weightKg: Double, on day: String = GymStore.today()) -> Bool {
        let previousBest = self.exercise(exercise.id)?.bestSet
        let isNewBest = previousBest.map { weightKg > $0.weightKg && $0.performedOn != day } ?? false
        make(.saveSet(exerciseID: exercise.id, day: day, weightKg: (weightKg * 100).rounded() / 100))
        return isNewBest
    }

    func deleteSet(of exercise: GymExercise, on day: String) {
        make(.deleteSet(exerciseID: exercise.id, day: day))
    }

    private func make(_ change: GymChange) {
        loads.invalidate()
        outbox.enqueue(change)
        withAnimation(.snappy) { rebuild() }
        cache.save(exercises, as: Self.cacheKey)
        Task { await sendChanges() }
    }

    /// Each change the server takes becomes part of its copy here, so it stays
    /// shown after it leaves the queue.
    func sendChanges() async {
        await outbox.send { change in
            change.apply(to: &server)
        }
        rebuild()
    }

    /// The server's list with every waiting change on top, latest trained first.
    private func rebuild() {
        var list = server
        for change in outbox.changes {
            change.apply(to: &list)
        }
        exercises = list.sorted { ($0.lastActive, $0.createdAt) > ($1.lastActive, $1.createdAt) }
    }

    private static func tidy(_ name: String) -> String {
        name.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }
}
