import Foundation

/// One HKCategorySample for sleep analysis, mirrored field-by-field for POST
/// /v1/healthkit/sleep/sync. Dates are pre-formatted ISO 8601 strings for the
/// same reason as `HealthKitWorkoutUpload`.
struct HealthKitSleepSampleUpload: Encodable {
    let healthkitUuid: UUID
    let sleepValue: Int
    let sleepValueName: String
    let startDate: String
    let endDate: String
    let sourceName: String
    let sourceBundleId: String
    let sourceVersion: String?
    let deviceName: String?
    let sampleMetadata: [String: JSONValue]?

    enum CodingKeys: String, CodingKey {
        case healthkitUuid = "healthkit_uuid"
        case sleepValue = "sleep_value"
        case sleepValueName = "sleep_value_name"
        case startDate = "start_date"
        case endDate = "end_date"
        case sourceName = "source_name"
        case sourceBundleId = "source_bundle_id"
        case sourceVersion = "source_version"
        case deviceName = "device_name"
        case sampleMetadata = "sample_metadata"
    }
}

struct SleepSyncRequest: Encodable {
    let samples: [HealthKitSleepSampleUpload]
    let deletedUuids: [UUID]

    enum CodingKeys: String, CodingKey {
        case samples
        case deletedUuids = "deleted_uuids"
    }
}

struct SleepSyncResponse: Decodable {
    let synced: Int
    let deleted: Int
}
