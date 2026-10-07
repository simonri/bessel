import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class CalendarStore {
    /// A week, Monday first like the desktop.
    static let dayCount = 7

    private(set) var firstDay = CalendarStore.weekStart(of: .now)
    private(set) var accounts: [CalendarAccount] = []
    private(set) var events: [CalendarEvent] = []
    private(set) var hasLoaded = false
    var errorMessage: String?

    private let client: APIClient
    private static let defaultCalendarKey = "calendar.defaultCalendar"

    init(client: APIClient) {
        self.client = client
    }

    // MARK: - Derived

    var days: [Date] {
        (0..<Self.dayCount).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: firstDay) }
    }

    var lastDayEnd: Date {
        Calendar.current.date(byAdding: .day, value: Self.dayCount, to: firstDay)!
    }

    var timeZone: String { TimeZone.current.identifier }

    var calendars: [CalendarInfo] { accounts.flatMap(\.calendars) }

    func calendar(_ id: UUID) -> CalendarInfo? {
        calendars.first { $0.id == id }
    }

    func account(for calendarID: UUID) -> CalendarAccount? {
        accounts.first { $0.calendars.contains { $0.id == calendarID } }
    }

    /// Events from calendars that aren't hidden.
    var visibleEvents: [CalendarEvent] {
        let hidden = Set(calendars.filter(\.hidden).map(\.id))
        return events.filter { !hidden.contains($0.calendarId) }
    }

    /// Calendars new events can go into.
    var writableCalendars: [CalendarInfo] {
        accounts.filter(\.canWrite).flatMap(\.calendars).filter { $0.writable && !$0.hidden }
    }

    var canCreate: Bool { !writableCalendars.isEmpty }

    /// The calendar used last, else the primary writable one, else any writable one.
    var defaultCalendarID: UUID? {
        let writable = writableCalendars
        if let saved = UserDefaults.standard.string(forKey: Self.defaultCalendarKey).flatMap(UUID.init(uuidString:)),
           writable.contains(where: { $0.id == saved }) {
            return saved
        }
        return (writable.first(where: \.primary) ?? writable.first)?.id
    }

    /// Why an event can't be edited, or nil when it can.
    func readOnlyReason(_ event: CalendarEvent) -> String? {
        guard let account = account(for: event.calendarId), account.canWrite else {
            return "This account is connected read-only. Reconnect it on the desktop to edit."
        }
        guard calendar(event.calendarId)?.writable == true else { return "This calendar is read-only." }
        guard event.editable else { return "Only the organizer can change this event." }
        return nil
    }

    func canEdit(_ event: CalendarEvent) -> Bool { readOnlyReason(event) == nil }

    /// Answering is allowed for invitations on writable calendars.
    func canReply(_ event: CalendarEvent) -> Bool {
        guard event.canReply, let account = account(for: event.calendarId), account.canWrite else { return false }
        return calendar(event.calendarId)?.writable == true
    }

    // MARK: - Navigation

    func step(weeks: Int) async {
        firstDay = Calendar.current.date(byAdding: .day, value: 7 * weeks, to: firstDay)!
        await loadEvents()
    }

    func goToToday() async {
        await show(.now)
    }

    /// Shows the week a date falls in.
    func show(_ date: Date) async {
        let start = Self.weekStart(of: date)
        guard start != firstDay else { return }
        firstDay = start
        await loadEvents()
    }

    static func weekStart(of date: Date) -> Date {
        var calendar = Calendar.current
        calendar.firstWeekday = 2
        return calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? calendar.startOfDay(for: date)
    }

    /// A day's events: all-day first, then by start time.
    func events(on day: Date) -> [CalendarEvent] {
        let dayStart = Calendar.current.startOfDay(for: day)
        let dayEnd = Calendar.current.date(byAdding: .day, value: 1, to: dayStart)!
        return visibleEvents
            .filter { $0.start < dayEnd && $0.end > dayStart }
            .sorted { lhs, rhs in
                if lhs.allDay != rhs.allDay { return lhs.allDay }
                return lhs.start < rhs.start
            }
    }

    var isShowingToday: Bool {
        days.contains { Calendar.current.isDateInToday($0) }
    }

    // MARK: - Loading

    func load() async {
        defer { hasLoaded = true }
        do {
            let response: CalendarAccountListResponse = try await client.get("/v1/calendars/accounts")
            accounts = response.accounts
        } catch {
            report(error)
        }
        await loadEvents()
    }

    /// One day either side of what's shown, so time-zone edges are covered.
    func loadEvents() async {
        let calendar = Calendar.current
        let start = calendar.date(byAdding: .day, value: -1, to: firstDay)!
        let end = calendar.date(byAdding: .day, value: 1, to: lastDayEnd)!
        do {
            let response: CalendarEventListResponse = try await client.get("/v1/calendars/events", query: [
                URLQueryItem(name: "start_ts", value: String(Int(start.timeIntervalSince1970))),
                URLQueryItem(name: "end_ts", value: String(Int(end.timeIntervalSince1970))),
            ])
            events = response.events
        } catch {
            report(error)
        }
    }

    // MARK: - Writing

    /// Creates an event. `fields` are the editor's values as API JSON.
    func create(in calendarID: UUID, fields: [String: JSONValue]) async throws {
        var body = fields
        body["time_zone"] = .string(timeZone)
        let response: EventWriteResponse = try await client.post("/v1/calendars/\(calendarID)/events", body: JSONValue.object(body))
        UserDefaults.standard.set(calendarID.uuidString, forKey: Self.defaultCalendarKey)
        if let event = response.event {
            events.append(event)
        }
        await loadEvents()
    }

    /// Sends only the changed `fields`. `moveTo` moves it to another calendar.
    func update(
        _ event: CalendarEvent,
        fields: [String: JSONValue],
        scope: EditScope,
        notifyGuests: Bool,
        moveTo calendarID: UUID? = nil
    ) async throws {
        var body = fields
        body["scope"] = .string(scope.rawValue)
        body["calendar_id"] = calendarID.map { .string($0.uuidString) } ?? .null
        body["time_zone"] = .string(timeZone)
        body["notify_guests"] = .bool(notifyGuests)
        let response: EventWriteResponse = try await client.patch("/v1/calendars/events/\(event.id)", body: JSONValue.object(body))
        if let updated = response.event, let index = events.firstIndex(where: { $0.id == event.id }) {
            events[index] = updated
        }
        await loadEvents()
    }

    func setColor(_ event: CalendarEvent, colorID: String?) async {
        if let index = events.firstIndex(where: { $0.id == event.id }) {
            events[index].colorId = colorID
        }
        do {
            try await update(event, fields: ["color_id": colorID.map(JSONValue.string) ?? .null], scope: .this, notifyGuests: false)
        } catch {
            report(error)
            await loadEvents()
        }
    }

    func delete(_ event: CalendarEvent, scope: EditScope, notifyGuests: Bool) async {
        withAnimation(.snappy) { events.removeAll { $0.id == event.id } }
        do {
            try await client.deleteNoContent("/v1/calendars/events/\(event.id)", query: [
                URLQueryItem(name: "scope", value: scope.rawValue),
                URLQueryItem(name: "time_zone", value: timeZone),
                URLQueryItem(name: "notify_guests", value: notifyGuests ? "true" : "false"),
            ])
        } catch {
            report(error)
        }
        await loadEvents()
    }

    func respond(_ event: CalendarEvent, response: String, scope: EditScope) async {
        if let index = events.firstIndex(where: { $0.id == event.id }) {
            events[index].myResponse = response
        }
        do {
            let _: EventWriteResponse = try await client.put(
                "/v1/calendars/events/\(event.id)/response",
                body: JSONValue.object(["response": .string(response), "scope": .string(scope.rawValue)])
            )
        } catch {
            report(error)
        }
        await loadEvents()
    }

    /// Show or hide a calendar; shared with the desktop.
    func setHidden(_ calendar: CalendarInfo, hidden: Bool) async {
        mutateCalendar(calendar.id) { $0.hidden = hidden }
        do {
            let _: CalendarInfo = try await client.patch("/v1/calendars/\(calendar.id)", body: JSONValue.object(["hidden": .bool(hidden)]))
        } catch {
            mutateCalendar(calendar.id) { $0.hidden = !hidden }
            report(error)
        }
    }

    private func mutateCalendar(_ id: UUID, _ change: (inout CalendarInfo) -> Void) {
        accounts = accounts.map { account in
            let calendars = account.calendars.map { calendar in
                var calendar = calendar
                if calendar.id == id { change(&calendar) }
                return calendar
            }
            return CalendarAccount(id: account.id, provider: account.provider, email: account.email, canWrite: account.canWrite, calendars: calendars)
        }
    }

    func report(_ error: Error) {
        if error is CancellationError { return }
        errorMessage = Self.message(for: error)
    }

    /// The API's own `detail` when there is one, so errors read as sentences.
    static func message(for error: Error) -> String {
        if let apiError = error as? APIError,
           let data = apiError.detail.data(using: .utf8),
           let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let detail = body["detail"] as? String {
            return detail
        }
        return error.localizedDescription
    }
}
