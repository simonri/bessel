import Foundation
import Observation

@MainActor
@Observable
final class WorkoutsStore {
    private(set) var workouts: [HealthKitWorkoutItem] = []
    private(set) var hasLoaded = false
    private(set) var isSyncing = false
    private(set) var lastSyncedAt: Date?
    var errorMessage: String?

    private let client: APIClient
    private let healthKit = HealthKitService()

    init(client: APIClient) {
        self.client = client
        lastSyncedAt = WorkoutSyncAnchor.lastSyncedAt
    }

    func load() async {
        defer { hasLoaded = true }
        do {
            let response: WorkoutListResponse = try await client.get(
                "/v1/healthkit/workouts",
                query: [URLQueryItem(name: "limit", value: "100")]
            )
            workouts = response.items
        } catch {
            report(error)
        }
    }

    /// Uploads everything HealthKit reports as changed since the persisted anchor,
    /// one page at a time. The anchor only advances after the server acknowledges a
    /// page, so an interrupted sync resumes where it left off; the server upsert
    /// absorbs any replayed page.
    func sync() async {
        guard !isSyncing else { return }
        guard HealthKitService.isAvailable else {
            errorMessage = "Health data isn't available on this device."
            return
        }
        isSyncing = true
        defer { isSyncing = false }
        do {
            try await healthKit.requestAuthorization()
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
            WorkoutSyncAnchor.lastSyncedAt = .now
            lastSyncedAt = WorkoutSyncAnchor.lastSyncedAt
            await load()
        } catch {
            report(error)
        }
    }

    private func report(_ error: Error) {
        if error is CancellationError { return }
        errorMessage = error.localizedDescription
    }
}
