import SwiftUI

/// One day from /v1/healthkit/summary: sleep, movement and energy, each scored
/// against the person's own usual, plus the week around it.
struct HealthSummary: Codable, Equatable {
    let date: String
    let isToday: Bool
    let sleep: Sleep?
    let move: Move?
    let energy: Energy?
    let insight: String
    let bedtimeStreak: Int
    @Lossy var week: [WeekDay]

    struct Sleep: Codable, Equatable {
        let score: Int
        let label: String
        let asleepSecs: Int
        let usualAsleepSecs: Int?
        let sleepOnset: String?
        let wakeTime: String?
        let deepSecs: Int
        let coreSecs: Int
        let remSecs: Int
        let awakeSecs: Int

        var onset: Date? { sleepOnset.flatMap(DateParsing.parse) }
        var wake: Date? { wakeTime.flatMap(DateParsing.parse) }
        /// Deep, core and REM recorded separately (a Watch); an iPhone alone only knows "asleep".
        var hasStages: Bool { deepSecs + coreSecs + remSecs > 0 }
    }

    struct Move: Codable, Equatable {
        let score: Int?
        let label: String
        let isPartialDay: Bool
        let steps: Int?
        let usualSteps: Int?
        let activeEnergyKcal: Double?
        let usualActiveEnergyKcal: Double?
        let exerciseMinutes: Double?
        let workoutCount: Int
        let workoutMinutes: Double
    }

    struct Energy: Codable, Equatable {
        let score: Int?
        let label: String
        let restingHeartRate: Double?
        let usualRestingHeartRate: Double?
        let hrvMs: Double?
        let usualHrvMs: Double?
    }

    struct WeekDay: Codable, Equatable, Identifiable {
        let date: String
        let asleepSecs: Int?
        let moveScore: Int?
        let workoutMinutes: Double

        var id: String { date }
        var day: Date? { DateParsing.dateOnly.date(from: date) }
    }

    var isEmpty: Bool { sleep == nil && move == nil && energy == nil }
}

/// The three rings, each with its own soft colour.
enum HealthRing: String, Identifiable, CaseIterable, Hashable {
    case sleep, move, energy

    var id: String { rawValue }

    var title: String {
        switch self {
        case .sleep: "Sleep"
        case .move: "Move"
        case .energy: "Energy"
        }
    }

    var icon: String {
        switch self {
        case .sleep: "moon.fill"
        case .move: "figure.walk"
        case .energy: "bolt.fill"
        }
    }

    var hue: Double {
        switch self {
        case .sleep: 285
        case .move: 25
        case .energy: 160
        }
    }
}

enum HealthFormat {
    /// "7h 05m" or "45m".
    static func duration(_ seconds: TimeInterval) -> String {
        let minutes = Int((seconds / 60).rounded())
        return minutes < 60 ? "\(minutes)m" : "\(minutes / 60)h \(String(format: "%02d", minutes % 60))m"
    }

    static func clock(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }

    /// "Today", "Yesterday" or "Mon, Oct 5".
    static func dayTitle(_ day: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(day) { return "Today" }
        if calendar.isDateInYesterday(day) { return "Yesterday" }
        return day.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
    }
}
