import SwiftUI

// MARK: - Reading

// The API's calendar types, generated from its spec (Bessel/API/Generated).
typealias CalendarAccountListResponse = API.CalendarAccountListResponse
typealias CalendarAccount = API.CalendarAccountSchema
typealias CalendarInfo = API.CalendarSchema
typealias CalendarEventListResponse = API.CalendarEventListResponse
typealias EventWriteResponse = API.EventWriteResponse
typealias CalendarAttendee = API.CalendarEventAttendee
typealias EventRecurrence = API.RecurrenceSchema
/// One event from /v1/calendars/events. All-day events carry calendar days
/// (`startDate`, `endDate`) read at local midnight, so they never shift with time zones.
typealias CalendarEvent = API.CalendarEventSchema

extension CalendarAccount: Identifiable {
    var isGoogle: Bool { provider == .google }
}

extension CalendarInfo: Identifiable {
    var swiftColor: Color { Color(hexString: color) ?? .gray }
}

extension CalendarEvent: Identifiable {
    /// Start and (exclusive) end as instants; all-day events at local midnight.
    var start: Date {
        allDay ? (startDate ?? .distantPast) : (startAt ?? .distantPast)
    }

    var end: Date {
        allDay ? (endDate ?? start) : (endAt ?? start)
    }

    var displayTitle: String { title.isEmpty ? "(No title)" : title }
    var hasGuests: Bool { !attendees.isEmpty }
    var isUnansweredInvite: Bool { myResponse == "needs_action" }

    /// How events sharing a day are listed: all-day first, then by start, longer
    /// ones (multi-day trips) above shorter, then by title. The id settles the
    /// rest, so the order never depends on how the server happened to send them;
    /// otherwise events starting together could swap places between loads.
    static func displayOrder(_ lhs: CalendarEvent, _ rhs: CalendarEvent) -> Bool {
        if lhs.allDay != rhs.allDay { return lhs.allDay }
        if lhs.start != rhs.start { return lhs.start < rhs.start }
        if lhs.end != rhs.end { return lhs.end > rhs.end }
        switch lhs.displayTitle.localizedStandardCompare(rhs.displayTitle) {
        case .orderedAscending: return true
        case .orderedDescending: return false
        case .orderedSame: return lhs.id.uuidString < rhs.id.uuidString
        }
    }

    /// You're a guest (not the organizer), so you can answer the invitation.
    var canReply: Bool {
        guard let me = attendees.first(where: \.isSelf) else { return myResponse != nil }
        return !me.isOrganizer
    }
}

// MARK: - Colours

/// Google event colours by id, same values as the web (event-colors.ts).
enum EventColors {
    static let palette: [String: String] = [
        "1": "#7986cb", "2": "#33b679", "3": "#9b6bf2", "4": "#e67c73", "5": "#f2c14e",
        "6": "#f08c4a", "7": "#4a9ee0", "8": "#b4b4b4", "9": "#3f51b5", "10": "#5bbd84", "11": "#e5534b",
    ]

    /// The choices offered when recolouring, in the web's order.
    static let menu: [(id: String, name: String)] = [
        ("11", "Red"), ("6", "Orange"), ("5", "Yellow"), ("10", "Green"), ("7", "Blue"), ("3", "Purple"), ("8", "Gray"),
    ]

    static func color(for id: String) -> Color {
        palette[id].flatMap(Color.init(hexString:)) ?? .gray
    }
}

extension Color {
    /// `#rrggbb`.
    init?(hexString: String) {
        let hex = hexString.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard hex.count == 6, let value = UInt32(hex, radix: 16) else { return nil }
        self.init(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

// MARK: - Writing

/// Which occurrences of a repeating event a change applies to.
typealias EditScope = API.EditScope

extension EditScope: Identifiable {
    var id: String { rawValue }

    var label: String {
        switch self {
        case .this: "This event"
        case .following: "This and following events"
        case .all, .unknown: "All events"
        }
    }
}

/// Start and end of an event as the API takes them: wall-clock times without
/// an offset plus the zone, or plain dates for all-day events (end exclusive).
struct EventTiming: Equatable {
    var allDay: Bool
    var start: Date
    var end: Date

    func input(timeZone: String) -> API.EventTimingInput {
        func moment(_ date: Date) -> API.EventTimeInput {
            allDay
                ? API.EventTimeInput(date: DateParsing.dateOnly.string(from: date))
                : API.EventTimeInput(dateTime: Self.wallClock.string(from: date))
        }
        return API.EventTimingInput(start: moment(start), end: moment(end), timeZone: timeZone)
    }

    private static let wallClock: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return formatter
    }()
}

/// The repeat presets the editor offers, as on the web (event-payload.ts).
enum RepeatPreset: String, CaseIterable, Identifiable {
    case none, daily, weekdays, weekly, monthly, yearly

    var id: String { rawValue }

    var label: String {
        switch self {
        case .none: "Does not repeat"
        case .daily: "Every day"
        case .weekdays: "Every weekday"
        case .weekly: "Every week"
        case .monthly: "Every month"
        case .yearly: "Every year"
        }
    }

    func recurrence(start: Date) -> EventRecurrence? {
        switch self {
        case .none: nil
        case .daily: EventRecurrence(frequency: "daily")
        case .weekdays: EventRecurrence(frequency: "weekly", byWeekday: ["MO", "TU", "WE", "TH", "FR"])
        case .weekly: EventRecurrence(frequency: "weekly", byWeekday: [Self.weekday(start)])
        case .monthly: EventRecurrence(frequency: "monthly")
        case .yearly: EventRecurrence(frequency: "yearly")
        }
    }

    /// The preset matching an existing rule, or nil when it's custom.
    static func matching(_ recurrence: EventRecurrence?, start: Date) -> RepeatPreset? {
        guard let recurrence else { return RepeatPreset.none }
        guard recurrence.interval == 1, recurrence.count == nil, recurrence.until == nil else { return nil }
        return allCases.first { preset in
            guard let candidate = preset.recurrence(start: start) else { return false }
            let days = recurrence.byWeekday.isEmpty && candidate.frequency == "weekly" ? [weekday(start)] : recurrence.byWeekday
            return candidate.frequency == recurrence.frequency && Set(candidate.byWeekday) == Set(days)
        }
    }

    static func weekday(_ date: Date) -> String {
        ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][Calendar.current.component(.weekday, from: date) - 1]
    }
}

extension String {
    /// nil for an empty string, which the API reads as "no value".
    var nonEmpty: String? { isEmpty ? nil : self }
}
