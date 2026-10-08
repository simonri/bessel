import Foundation
import Observation

@MainActor
@Observable
final class HealthStore {
    /// The day shown, at local midnight. Its sleep is the night that ended that morning.
    private(set) var day = Calendar.current.startOfDay(for: .now)
    private(set) var summary: HealthSummary?
    private(set) var recentWorkouts: [HealthKitWorkoutItem] = []
    private(set) var allWorkouts: [HealthKitWorkoutItem] = []
    private(set) var hasLoadedAllWorkouts = false
    /// The shown night's stages, for the sleep detail.
    private(set) var nightSegments: [SleepSegment] = []
    /// Up to two weeks of nights ending on the shown day, oldest first.
    private(set) var recentNights: [SleepNight] = []
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
    @ObservationIgnored private var detailLoads = LoadGeneration()

    private struct Snapshot: Codable {
        let summary: HealthSummary
        let recentWorkouts: [HealthKitWorkoutItem]
    }

    private static let cacheKey = "health.v2"

    init(client: APIClient, cache: ResponseCache?) {
        self.client = client
        self.cache = cache
        lastSyncedAt = WorkoutSyncAnchor.lastSyncedAt
        // Last time's page only helps if it was today's.
        if let snapshot = cache?.load(Snapshot.self, key: Self.cacheKey), snapshot.summary.date == Self.dateString(day) {
            summary = snapshot.summary
            recentWorkouts = snapshot.recentWorkouts
            hasLoaded = true
        }
    }

    /// Health was connected once on this device; from then on sync runs quietly.
    var isConnected: Bool { lastSyncedAt != nil }

    var isToday: Bool { Calendar.current.isDateInToday(day) }

    var latestWorkout: HealthKitWorkoutItem? { recentWorkouts.first }

    // MARK: - Days

    func step(_ days: Int) async {
        let target = Calendar.current.date(byAdding: .day, value: days, to: day)!
        await show(target)
    }

    func show(_ date: Date) async {
        let target = Calendar.current.startOfDay(for: date)
        guard target <= Calendar.current.startOfDay(for: .now), target != day else { return }
        day = target
        summary = nil
        nightSegments = []
        recentNights = []
        await load()
    }

    // MARK: - Loading

    func loadIfStale() async {
        // Opened on a new day while still showing the old "today": move along.
        if summary?.isToday == true, !isToday {
            await show(.now)
            return
        }
        guard loads.isStale(maxAge: AppServices.freshFor) else { return }
        await load()
    }

    func load() async {
        let ticket = loads.begin()
        let shownDay = day
        defer { hasLoaded = true }
        do {
            async let summaryTask: HealthSummary = client.get("/v1/healthkit/summary", query: [
                URLQueryItem(name: "date", value: Self.dateString(shownDay)),
                URLQueryItem(name: "tz_name", value: TimeZone.current.identifier),
            ])
            async let workoutsTask: WorkoutListResponse = client.get(
                "/v1/healthkit/workouts",
                query: [URLQueryItem(name: "limit", value: "20")]
            )
            let (summary, workouts) = try await (summaryTask, workoutsTask)
            guard loads.isCurrent(ticket) else { return }
            self.summary = summary
            recentWorkouts = workouts.items
            loadError = nil
            loads.finish(ticket)
            if summary.isToday {
                cache?.save(Snapshot(summary: summary, recentWorkouts: workouts.items), as: Self.cacheKey)
            }
        } catch {
            guard loads.isCurrent(ticket), !error.isCancellation else { return }
            loadError = error.userMessage
        }
    }

    /// The shown night's stages and the nights before it.
    func loadSleepDetail() async {
        let ticket = detailLoads.begin()
        let calendar = Calendar.current
        let noon = calendar.date(bySettingHour: 12, minute: 0, second: 0, of: day)!
        let nightStart = calendar.date(byAdding: .day, value: -1, to: noon)!
        let twoWeeksBefore = calendar.date(byAdding: .day, value: -14, to: nightStart)!
        do {
            async let samplesTask: SleepSampleListResponse = client.get("/v1/healthkit/sleep", query: [
                URLQueryItem(name: "start_ts", value: String(Int(nightStart.timeIntervalSince1970))),
                URLQueryItem(name: "end_ts", value: String(Int(noon.timeIntervalSince1970))),
                URLQueryItem(name: "limit", value: String(APIClient.pageSize)),
            ])
            async let nightsTask: SleepDailyResponse = client.get("/v1/healthkit/sleep/daily", query: [
                URLQueryItem(name: "start_ts", value: String(Int(twoWeeksBefore.timeIntervalSince1970))),
                URLQueryItem(name: "end_ts", value: String(Int(noon.timeIntervalSince1970))),
                URLQueryItem(name: "tz_name", value: TimeZone.current.identifier),
            ])
            let (samples, nights) = try await (samplesTask, nightsTask)
            guard detailLoads.isCurrent(ticket) else { return }
            recentNights = nights.nights.compactMap(SleepNight.init)
            nightSegments = Self.segments(samples.items, from: summary?.sleep?.onset, to: summary?.sleep?.wake)
        } catch {
            guard detailLoads.isCurrent(ticket), !error.isCancellation else { return }
            loadError = error.userMessage
        }
    }

    func loadAllWorkouts() async {
        do {
            allWorkouts = try await client.getAllPages("/v1/healthkit/workouts", maxPages: 10)
            hasLoadedAllWorkouts = true
        } catch {
            guard !error.isCancellation else { return }
            loadError = error.userMessage
        }
    }

    private static func segments(_ samples: [HealthKitSleepSampleItem], from onset: Date?, to wake: Date?) -> [SleepSegment] {
        guard let onset, let wake else { return [] }
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

    private static func dateString(_ day: Date) -> String {
        DateParsing.dateOnly.string(from: day)
    }

    // MARK: - Syncing

    /// Asks for Health access (iOS shows the prompt once per new kind of data) and uploads what changed.
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
            await syncDailyMetrics()
            markSynced()
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
            await syncDailyMetrics()
            markSynced()
            await load()
        } catch {
            if showErrors { report(error) }
        }
    }

    private func markSynced() {
        WorkoutSyncAnchor.lastSyncedAt = .now
        SleepSyncAnchor.lastSyncedAt = .now
        lastSyncedAt = WorkoutSyncAnchor.lastSyncedAt
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

    /// Steps, energy and heart totals for the days since the last sync. Kept
    /// apart from the rest: if it fails, workouts and sleep still count as synced
    /// and these days are simply sent again next time.
    private func syncDailyMetrics() async {
        let window = DailyMetricsSyncState.nextWindow()
        do {
            let days = try await healthKit.dailyMetrics(in: window)
            // Nothing back usually means access wasn't granted yet. Keep the
            // window where it is, so the month's history goes up once it is.
            guard !days.isEmpty else { return }
            let _: DailyMetricsSyncResponse = try await client.post("/v1/healthkit/daily-metrics/sync", body: DailyMetricsSyncRequest(days: days))
            DailyMetricsSyncState.markSynced(through: .now)
        } catch {
            // Sent again from the same starting day next time.
        }
    }

    private func report(_ error: Error) {
        if error.isCancellation { return }
        errorMessage = error.userMessage
    }
}
