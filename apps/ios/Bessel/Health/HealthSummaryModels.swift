import SwiftUI

/// One day from /v1/healthkit/summary: sleep, movement and energy, each scored
/// against the person's own usual, plus the week around it.
typealias HealthSummary = API.HealthSummaryResponse

extension HealthSummary {
    typealias Sleep = API.SleepDaySummary
    typealias Move = API.MoveDaySummary
    typealias Energy = API.EnergyDaySummary
    typealias WeekDay = API.HealthWeekDay

    var isEmpty: Bool { sleep == nil && move == nil && energy == nil }
}

extension HealthSummary.Sleep {
    /// The night's stages in order, from the one source the night is counted from.
    typealias Segment = API.SleepStageSegment

    var onset: Date? { sleepOnset.flatMap(DateParsing.parse) }
    var wake: Date? { wakeTime.flatMap(DateParsing.parse) }
    /// Deep, core and REM recorded separately (a Watch); an iPhone alone only knows "asleep".
    var hasStages: Bool { deepSecs + coreSecs + remSecs > 0 }
}

extension HealthSummary.WeekDay: Identifiable {
    var id: Date { date }
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
