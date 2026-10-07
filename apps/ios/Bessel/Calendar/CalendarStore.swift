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
    /// A change that didn't go through; shown as an alert.
    var errorMessage: String?
    /// A refresh that didn't go through; shown quietly over what's already there.
    var loadError: String?

    private let client: APIClient
    private let cache: ResponseCache
    @ObservationIgnored private var loads = LoadGeneration()
    @ObservationIgnored private let changes = SerialQueues<UUID>()
    private static let defaultCalendarKey = "calendar.defaultCalendar"

    private struct Snapshot: Codable {
        let accounts: [CalendarAccount]
        let events: [CalendarEvent]
    }

    private static let cacheKey = "calendar.v2"

    init(services: AppServices) {
        client = services.client
        cache = services.cache
        if let snapshot = cache.load(Snapshot.self, key: Self.cacheKey) {
            accounts = snapshot.accounts
            // Days are matched by date, so last time's events only show where
            // they still overlap this week.
            events = snapshot.events
            hasLoaded = true
        }
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

    /// A day's events in `CalendarEvent.displayOrder`.
    func events(on day: Date) -> [CalendarEvent] {
        let dayStart = Calendar.current.startOfDay(for: day)
        let dayEnd = Calendar.current.date(byAdding: .day, value: 1, to: dayStart)!
        return visibleEvents
            .filter { $0.start < dayEnd && $0.end > dayStart }
            .sorted(by: CalendarEvent.displayOrder)
    }

    var isShowingToday: Bool {
        days.contains { Calendar.current.isDateInToday($0) }
    }

    // MARK: - Loading

    func loadIfStale() async {
        guard loads.isStale(maxAge: AppServices.freshFor) else { return }
        await load()
    }

    func load() async {
        defer { hasLoaded = true }
        do {
            let response: CalendarAccountListResponse = try await client.get("/v1/calendars/accounts")
            accounts = response.accounts
        } catch {
            if !error.isCancellation { loadError = error.userMessage }
        }
        await loadEvents()
    }

    /// The shown week plus the weeks either side, so swiping to the next or
    /// previous week shows its events at once while they're refreshed; and a
    /// day more at each end for time-zone edges. Only the newest request lands,
    /// so flicking through weeks never ends on a week you've already left.
    func loadEvents() async {
        let ticket = loads.begin()
        let week = firstDay
        let calendar = Calendar.current
        let start = calendar.date(byAdding: .day, value: -(Self.dayCount + 1), to: week)!
        let end = calendar.date(byAdding: .day, value: Self.dayCount + 1, to: lastDayEnd)!
        do {
            let response: CalendarEventListResponse = try await client.get("/v1/calendars/events", query: [
                URLQueryItem(name: "start_ts", value: String(Int(start.timeIntervalSince1970))),
                URLQueryItem(name: "end_ts", value: String(Int(end.timeIntervalSince1970))),
            ])
            guard loads.isCurrent(ticket) else { return }
            events = response.events
            loadError = nil
            loads.finish(ticket)
            cache.save(Snapshot(accounts: accounts, events: response.events), as: Self.cacheKey)
        } catch {
            guard loads.isCurrent(ticket), !error.isCancellation else { return }
            loadError = error.userMessage
        }
    }

    // MARK: - Writing

    /// Creates an event. `fields` are the editor's values as API JSON.
    func create(in calendarID: UUID, fields: [String: JSONValue]) async throws {
        loads.invalidate()
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
        loads.invalidate()
        let response: EventWriteResponse = try await changes.run(event.id) { [client] in
            try await client.patch("/v1/calendars/events/\(event.id)", body: JSONValue.object(body))
        }
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
        loads.invalidate()
        withAnimation(.snappy) { events.removeAll { $0.id == event.id } }
        let query = [
            URLQueryItem(name: "scope", value: scope.rawValue),
            URLQueryItem(name: "time_zone", value: timeZone),
            URLQueryItem(name: "notify_guests", value: notifyGuests ? "true" : "false"),
        ]
        do {
            try await changes.run(event.id) { [client] in
                try await client.deleteNoContent("/v1/calendars/events/\(event.id)", query: query)
            }
        } catch let error as APIError where error.statusCode == 404 {
            // Already gone.
        } catch {
            report(error)
        }
        await loadEvents()
    }

    func respond(_ event: CalendarEvent, response: String, scope: EditScope) async {
        loads.invalidate()
        if let index = events.firstIndex(where: { $0.id == event.id }) {
            events[index].myResponse = response
        }
        let body = JSONValue.object(["response": .string(response), "scope": .string(scope.rawValue)])
        do {
            let _: EventWriteResponse = try await changes.run(event.id) { [client] in
                try await client.put("/v1/calendars/events/\(event.id)/response", body: body)
            }
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
        if error.isCancellation { return }
        errorMessage = error.userMessage
    }
}
