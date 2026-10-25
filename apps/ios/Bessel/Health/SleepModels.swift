import SwiftUI

/// One HKCategorySample for sleep analysis, mirrored field-by-field for POST /v1/healthkit/sleep/sync.
typealias HealthKitSleepSampleUpload = API.HealthKitSleepSampleUpload
typealias SleepSyncRequest = API.HealthKitSleepSyncRequest
typealias SleepSyncResponse = API.HealthKitSleepSyncResponse
typealias SleepDailyResponse = API.SleepDailyResponse
/// One night from /v1/healthkit/sleep/daily, bucketed to the date you woke up.
typealias SleepDailyEntry = API.SleepDailyEntry
typealias HealthKitSleepSampleItem = API.HealthKitSleepSampleSchema
typealias SleepSampleListResponse = API.HealthKitSleepListResponse

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
