import SwiftUI

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

struct SleepDailyResponse: Decodable {
    @Lossy var nights: [SleepDailyEntry]
}

/// One night from /v1/healthkit/sleep/daily, bucketed to the date you woke up.
struct SleepDailyEntry: Codable {
    let date: String
    let asleepSecs: Int
    let sleepOnset: String?
    let wakeTime: String?
}

struct SleepNight: Identifiable, Equatable {
    let wakeDate: Date
    let asleep: TimeInterval
    let onset: Date?
    let wake: Date?

    var id: Date { wakeDate }

    init?(_ entry: SleepDailyEntry) {
        guard let wakeDate = DateParsing.dateOnly.date(from: entry.date) else { return nil }
        self.wakeDate = wakeDate
        asleep = TimeInterval(entry.asleepSecs)
        onset = entry.sleepOnset.flatMap(DateParsing.parse)
        wake = entry.wakeTime.flatMap(DateParsing.parse)
    }
}

struct HealthKitSleepSampleItem: Codable {
    let sleepValueName: String
    let startDate: Date
    let endDate: Date
}

struct SleepSampleListResponse: Decodable {
    @Lossy var items: [HealthKitSleepSampleItem]
}

/// Sleep stages with the same calm night-time pastels as the web Sleep page
/// (apps/web/src/routes/_app/-sleep-utils.ts): lilac REM, sky Core, indigo
/// Deep, and a warm peach Awake that reads as "not asleep" without alarm.
enum SleepStage: String, CaseIterable {
    case awake
    case asleepREM
    case asleepCore
    case asleepUnspecified
    case asleepDeep

    var label: String {
        switch self {
        case .awake: "Awake"
        case .asleepREM: "REM"
        case .asleepCore: "Core"
        case .asleepUnspecified: "Asleep"
        case .asleepDeep: "Deep"
        }
    }

    var hint: String {
        switch self {
        case .awake: "Little wake-ups"
        case .asleepREM: "Dreams and memory"
        case .asleepCore: "Light, steady sleep"
        case .asleepUnspecified: "Asleep"
        case .asleepDeep: "Rest and repair"
        }
    }

    var color: Color {
        switch self {
        case .awake: Color(UIColor.oklch(0.82, 0.09, 55))
        case .asleepREM: Color(UIColor.oklch(0.8, 0.1, 315))
        case .asleepCore, .asleepUnspecified: Color(UIColor.oklch(0.78, 0.09, 235))
        case .asleepDeep: Color(UIColor.oklch(0.66, 0.12, 280))
        }
    }

    /// Row in the night chart: awake on top, deep at the bottom.
    var level: Int {
        switch self {
        case .awake: 0
        case .asleepREM: 1
        case .asleepCore, .asleepUnspecified: 2
        case .asleepDeep: 3
        }
    }
}

struct SleepSegment: Identifiable {
    let stage: SleepStage
    let start: Date
    let end: Date

    var id: Date { start }
    var duration: TimeInterval { end.timeIntervalSince(start) }
}
