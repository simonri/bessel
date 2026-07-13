import Foundation

/// JSON-safe value for HealthKit's heterogeneous metadata/statistics dictionaries.
enum JSONValue: Encodable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .null: try container.encodeNil()
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }
}

/// One HKWorkout, mirrored field-by-field for POST /v1/healthkit/workouts/sync.
/// Dates are pre-formatted ISO 8601 strings because the shared `JSONEncoder.api`
/// encodes `Date` as plain YYYY-MM-DD (a due-date convention we must not inherit).
struct HealthKitWorkoutUpload: Encodable {
    let healthkitUuid: UUID
    let workoutActivityType: Int
    let workoutActivityTypeName: String
    let startDate: String
    let endDate: String
    let duration: Double
    let totalEnergyBurned: Double?
    let totalDistance: Double?
    let sourceName: String
    let sourceBundleId: String
    let sourceVersion: String?
    let deviceName: String?
    let workoutMetadata: [String: JSONValue]?
    let statistics: [String: JSONValue]?

    enum CodingKeys: String, CodingKey {
        case healthkitUuid = "healthkit_uuid"
        case workoutActivityType = "workout_activity_type"
        case workoutActivityTypeName = "workout_activity_type_name"
        case startDate = "start_date"
        case endDate = "end_date"
        case duration
        case totalEnergyBurned = "total_energy_burned"
        case totalDistance = "total_distance"
        case sourceName = "source_name"
        case sourceBundleId = "source_bundle_id"
        case sourceVersion = "source_version"
        case deviceName = "device_name"
        case workoutMetadata = "workout_metadata"
        case statistics
    }
}

struct WorkoutSyncRequest: Encodable {
    let workouts: [HealthKitWorkoutUpload]
    let deletedUuids: [UUID]

    enum CodingKeys: String, CodingKey {
        case workouts
        case deletedUuids = "deleted_uuids"
    }
}

struct WorkoutSyncResponse: Decodable {
    let synced: Int
    let deleted: Int
}

struct HealthKitWorkoutItem: Decodable, Identifiable, Hashable {
    let id: UUID
    let healthkitUuid: UUID
    let workoutActivityType: Int
    let workoutActivityTypeName: String
    let startDate: Date
    let endDate: Date
    let duration: Double
    let totalEnergyBurned: Double?
    let totalDistance: Double?
    let sourceName: String
}

struct WorkoutListResponse: Decodable {
    let items: [HealthKitWorkoutItem]
    let pagination: Pagination

    struct Pagination: Decodable {
        let totalCount: Int
        let maxPage: Int
    }
}
