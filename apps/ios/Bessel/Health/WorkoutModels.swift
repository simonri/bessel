import Foundation

// The API's HealthKit types, generated from its spec (Bessel/API/Generated).
/// One HKWorkout, mirrored field-by-field for POST /v1/healthkit/workouts/sync.
typealias HealthKitWorkoutUpload = API.HealthKitWorkoutUpload
typealias HealthKitDailyMetricUpload = API.HealthKitDailyMetricUpload
typealias DailyMetricsSyncRequest = API.HealthKitDailyMetricsSyncRequest
typealias DailyMetricsSyncResponse = API.HealthKitDailyMetricsSyncResponse
typealias WorkoutSyncRequest = API.HealthKitWorkoutSyncRequest
typealias WorkoutSyncResponse = API.HealthKitWorkoutSyncResponse
typealias HealthKitWorkoutItem = API.HealthKitWorkoutSchema
typealias WorkoutListResponse = API.HealthKitWorkoutListResponse

extension HealthKitWorkoutItem: Identifiable {}
