import Foundation
import Observation

@MainActor
@Observable
final class HealthStore {
    private(set) var workouts: [HealthKitWorkoutItem] = []
    private(set) var nights: [SleepNight] = []
    private(set) var lastNightSegments: [SleepSegment] = []
    private(set) var hasLoaded = false
    private(set) var isSyncing = false
    private(set) var lastSyncedAt: Date?
    /// Connecting to Health didn't work; shown as an alert.
    var errorMessage: String?
    /// A refresh that didn't go through; shown quietly over what's already there.
    var loadError: String?

    private let client: APIClient
    private let cache: ResponseCache?
    private let healthKit = HealthKitService()
    @ObservationIgnored private var loads = LoadGeneration()

    private struct Snapshot: Codable {
        let workouts: [HealthKitWorkoutItem]
        let nights: [SleepDailyEntry]
        let samples: [HealthKitSleepSampleItem]
    }

    private static let cacheKey = "health.v1"

    init(client: APIClient, cache: ResponseCache?) {
        self.client = client
        self.cache = cache
        lastSyncedAt = WorkoutSyncAnchor.lastSyncedAt
        if let snapshot = cache?.load(Snapshot.self, key: Self.cacheKey) {
            apply(snapshot)
            hasLoaded = true
        }
    }

    /// Health was connected once on this device; from then on sync runs quietly.
    var isConnected: Bool { lastSyncedAt != nil }

    var lastNight: SleepNight? { nights.last }

    /// Average time asleep over the nights before last night.
    var usualAsleep: TimeInterval? {
        let earlier = nights.dropLast().suffix(13)
        guard earlier.count >= 3 else { return nil }
        return earlier.map(\.asleep).reduce(0, +) / Double(earlier.count)
    }

    var workoutsThisWeek: [HealthKitWorkoutItem] {
        let weekAgo = Date.now.addingTimeInterval(-7 * 86_400)
        return workouts.filter { $0.startDate >= weekAgo }
    }

    func loadIfStale() async {
        guard loads.isStale(maxAge: AppServices.freshFor) else { return }
        await load()
    }

    func load() async {
        let ticket = loads.begin()
        defer { hasLoaded = true }
        let now = Int(Date.now.timeIntervalSince1970)
        do {
            async let workoutsTask: WorkoutListResponse = client.get(
                "/v1/healthkit/workouts",
                query: [URLQueryItem(name: "limit", value: "50")]
            )
            async let sleepTask: SleepDailyResponse = client.get(
                "/v1/healthkit/sleep/daily",
                query: [
                    URLQueryItem(name: "start_ts", value: String(now - 15 * 86_400)),
                    URLQueryItem(name: "end_ts", value: String(now)),
                    URLQueryItem(name: "tz_name", value: TimeZone.current.identifier),
                ]
            )
            async let samplesTask: SleepSampleListResponse = client.get(
                "/v1/healthkit/sleep",
                query: [URLQueryItem(name: "limit", value: "150")]
            )
            let snapshot = try await Snapshot(workouts: workoutsTask.items, nights: sleepTask.nights, samples: samplesTask.items)
            guard loads.isCurrent(ticket) else { return }
            apply(snapshot)
            loadError = nil
            loads.finish(ticket)
            cache?.save(snapshot, as: Self.cacheKey)
        } catch {
            guard loads.isCurrent(ticket), !error.isCancellation else { return }
            loadError = error.userMessage
        }
    }

    private func apply(_ snapshot: Snapshot) {
        workouts = snapshot.workouts
        nights = snapshot.nights.compactMap(SleepNight.init)
        lastNightSegments = segments(for: nights.last, from: snapshot.samples)
    }

    /// Asks for Health access (iOS shows the prompt once) and uploads what changed.
    func connect() async {
        await sync(showErrors: true)
    }

    /// Quiet sync on open and on returning to the app; at most every few minutes.
    func syncIfNeeded() async {
        guard isConnected else { return }
        if let lastSyncedAt, Date.now.timeIntervalSince(lastSyncedAt) < 5 * 60 { return }
        await sync(showErrors: false)
    }

    /// Uploads what changed while the app was in the background. Returns
    /// whether it finished; Health can't be read while the phone is locked.
    func syncInBackground() async -> Bool {
        guard isConnected, HealthKitService.isAvailable else { return true }
        do {
            try await syncWorkouts()
            try await syncSleep()
            WorkoutSyncAnchor.lastSyncedAt = .now
            SleepSyncAnchor.lastSyncedAt = .now
            lastSyncedAt = WorkoutSyncAnchor.lastSyncedAt
            return true
        } catch {
            return false
        }
    }

    /// Uploads everything HealthKit reports as changed since the persisted anchors
    /// (workouts and sleep each have their own), one page at a time. Anchors only
    /// advance after the server acknowledges a page, so an interrupted sync resumes
    /// where it left off; the server upsert absorbs any replayed page.
    private func sync(showErrors: Bool) async {
        guard !isSyncing else { return }
        guard HealthKitService.isAvailable else {
            if showErrors { errorMessage = "Health data isn't available on this device." }
            return
        }
        isSyncing = true
        defer { isSyncing = false }
        do {
            try await healthKit.requestAuthorization()
            try await syncWorkouts()
            try await syncSleep()
            WorkoutSyncAnchor.lastSyncedAt = .now
            SleepSyncAnchor.lastSyncedAt = .now
            lastSyncedAt = WorkoutSyncAnchor.lastSyncedAt
            await load()
        } catch {
            if showErrors { report(error) }
        }
    }

    private func syncWorkouts() async throws {
        var anchor = WorkoutSyncAnchor.load()
        while true {
            let batch = try await healthKit.fetchNextBatch(anchor: anchor, limit: 200)
            if batch.added.isEmpty && batch.deletedUUIDs.isEmpty { break }
            let _: WorkoutSyncResponse = try await client.post(
                "/v1/healthkit/workouts/sync",
                body: WorkoutSyncRequest(workouts: batch.added, deletedUuids: batch.deletedUUIDs)
            )
            WorkoutSyncAnchor.save(batch.newAnchor)
            anchor = batch.newAnchor
        }
    }

    private func syncSleep() async throws {
        var anchor = SleepSyncAnchor.load()
        while true {
            let batch = try await healthKit.fetchNextSleepBatch(anchor: anchor, limit: 200)
            if batch.added.isEmpty && batch.deletedUUIDs.isEmpty { break }
            let _: SleepSyncResponse = try await client.post(
                "/v1/healthkit/sleep/sync",
                body: SleepSyncRequest(samples: batch.added, deletedUuids: batch.deletedUUIDs)
            )
            SleepSyncAnchor.save(batch.newAnchor)
            anchor = batch.newAnchor
        }
    }

    /// Stage segments inside last night's main sleep episode, in time order.
    private func segments(for night: SleepNight?, from samples: [HealthKitSleepSampleItem]) -> [SleepSegment] {
        guard let night, let onset = night.onset, let wake = night.wake else { return [] }
        return samples
            .compactMap { sample -> SleepSegment? in
                guard let stage = SleepStage(rawValue: sample.sleepValueName) else { return nil }
                let start = max(sample.startDate, onset)
                let end = min(sample.endDate, wake)
                guard end > start else { return nil }
                return SleepSegment(stage: stage, start: start, end: end)
            }
            .sorted { $0.start < $1.start }
    }

    private func report(_ error: Error) {
        if error.isCancellation { return }
        errorMessage = error.userMessage
    }
}
