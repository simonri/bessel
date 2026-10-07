import SwiftUI

/// What the editor sheet is open for.
enum EventEditorTarget: Identifiable {
    case new(EventTiming)
    case edit(CalendarEvent)

    var id: String {
        switch self {
        case .new(let timing): "new-\(timing.start.timeIntervalSince1970)-\(timing.allDay)"
        case .edit(let event): "edit-\(event.id)"
        }
    }
}

/// The week as eight cells, two across: Monday to Sunday with their events
/// stacked, and a month to jump around in.
struct CalendarView: View {
    let auth: AuthSession

    @State private var store: CalendarStore
    @State private var detailEvent: CalendarEvent?
    @State private var editorTarget: EventEditorTarget?
    @State private var showingCalendars = false
    @Environment(\.scenePhase) private var scenePhase

    init(auth: AuthSession) {
        self.auth = auth
        _store = State(initialValue: CalendarStore(client: APIClient(auth: auth)))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    header
                    LazyVGrid(
                        columns: [GridItem(.flexible(), spacing: 10, alignment: .top), GridItem(.flexible(), spacing: 10, alignment: .top)],
                        spacing: 10
                    ) {
                        ForEach(store.days, id: \.self) { day in
                            DayCell(
                                store: store,
                                day: day,
                                onCreate: { create(on: day) },
                                onOpen: { detailEvent = $0 }
                            )
                        }
                        MonthCell(store: store)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, Theme.pageTop)
                .padding(.bottom, 90)
            }
            .refreshable { await store.load() }
            .simultaneousGesture(swipeWeeks)
            .background(Theme.background)
            .overlay {
                if !store.hasLoaded { ProgressView() }
            }
            .navigationTitle("Calendar")
            .toolbarTitleDisplayMode(.inlineLarge)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingCalendars = true } label: { Image(systemName: "calendar") }
                        .accessibilityLabel("Calendars")
                }
                ProfileToolbarItem(auth: auth)
            }
            .sheet(item: $detailEvent) { event in
                EventDetailSheet(store: store, eventID: event.id) { editing in
                    detailEvent = nil
                    editorTarget = .edit(editing)
                }
            }
            .sheet(item: $editorTarget) { target in
                EventEditorView(store: store, target: target)
            }
            .sheet(isPresented: $showingCalendars) {
                CalendarsSheet(store: store)
            }
            .alert("Couldn't update the calendar", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(store.errorMessage ?? "")
            }
            .task { await store.load() }
            .task(id: scenePhase) {
                guard scenePhase == .active, store.hasLoaded else { return }
                await store.loadEvents()
            }
            .task {
                // Keep up with changes made elsewhere, like the desktop does.
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(300))
                    await store.loadEvents()
                }
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 8) {
            Text(weekTitle)
                .font(.headline)
                .foregroundStyle(Theme.foreground)
            Spacer()
            if !store.isShowingToday {
                FilterPill(title: "Today", isSelected: false) {
                    Task { await store.goToToday() }
                }
            }
            navButton("chevron.left", label: "Previous week") { Task { await store.step(weeks: -1) } }
            navButton("chevron.right", label: "Next week") { Task { await store.step(weeks: 1) } }
        }
    }

    private func navButton(_ systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.foreground)
                .frame(width: 34, height: 34)
                .background(Theme.fill, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    /// "Oct 5 – 11", "Sep 28 – Oct 4", with the year when it isn't this one.
    private var weekTitle: String {
        let calendar = Calendar.current
        let first = store.firstDay
        let last = calendar.date(byAdding: .day, value: CalendarStore.dayCount - 1, to: first)!
        let sameMonth = calendar.isDate(first, equalTo: last, toGranularity: .month)
        let thisYear = calendar.isDate(last, equalTo: .now, toGranularity: .year)
        let start = first.formatted(.dateTime.month(.abbreviated).day())
        let end = sameMonth ? last.formatted(.dateTime.day()) : last.formatted(.dateTime.month(.abbreviated).day())
        return thisYear ? "\(start) – \(end)" : "\(start) – \(end), \(last.formatted(.dateTime.year()))"
    }

    /// Swipe sideways to change week.
    private var swipeWeeks: some Gesture {
        DragGesture(minimumDistance: 40)
            .onEnded { value in
                let dx = value.translation.width
                guard abs(dx) > 80, abs(dx) > abs(value.translation.height) * 2 else { return }
                Task { await store.step(weeks: dx < 0 ? 1 : -1) }
            }
    }

    // MARK: - Actions

    /// Tap a day: a one-hour event at 9, or at the next full hour today.
    private func create(on day: Date) {
        guard store.canCreate else {
            store.errorMessage = "Connect a calendar account that allows editing on the desktop to add events."
            return
        }
        let calendar = Calendar.current
        var hour = 9
        if calendar.isDateInToday(day) {
            hour = min(calendar.component(.hour, from: .now) + 1, 23)
        }
        let start = calendar.date(byAdding: .hour, value: hour, to: calendar.startOfDay(for: day))!
        editorTarget = .new(EventTiming(allDay: false, start: start, end: start.addingTimeInterval(3600)))
    }

    private var errorBinding: Binding<Bool> {
        Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })
    }
}

// MARK: - Day

/// One day: its name and date, then its events stacked; tap the empty part to add one.
private struct DayCell: View {
    let store: CalendarStore
    let day: Date
    let onCreate: () -> Void
    let onOpen: (CalendarEvent) -> Void

    var body: some View {
        let isToday = Calendar.current.isDateInToday(day)
        let isPast = day < Calendar.current.startOfDay(for: .now)
        let events = store.events(on: day)

        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(day.formatted(.dateTime.weekday(.wide)))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(isToday ? Theme.primary : (isPast ? Theme.faintForeground : Theme.foreground))
                Spacer(minLength: 4)
                Text(day.formatted(.dateTime.day()))
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(isToday ? .white : (isPast ? Theme.faintForeground : Theme.mutedForeground))
                    .frame(minWidth: 26, minHeight: 26)
                    .background(isToday ? Theme.primary : .clear, in: Circle())
            }
            ForEach(events) { event in
                Button {
                    onOpen(event)
                } label: {
                    EventLine(event: event, day: day, store: store)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 150, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            if isToday {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(Theme.primary.opacity(0.5), lineWidth: 1.5)
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .onTapGesture(perform: onCreate)
        .accessibilityAction(named: "Add event", onCreate)
    }
}

/// An event in a day cell: its colour, title and time.
private struct EventLine: View {
    let event: CalendarEvent
    let day: Date
    let store: CalendarStore

    var body: some View {
        let calendarColor = store.calendar(event.calendarId)?.swiftColor ?? .gray
        let fill = event.colorId.map(EventColors.color(for:)) ?? calendarColor
        let isPast = event.end <= .now

        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(calendarColor)
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 1) {
                Text(event.displayTitle)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.foreground)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text(timeLabel)
                    .font(.caption2)
                    .monospacedDigit()
                    .foregroundStyle(Theme.mutedForeground)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 5)
        .padding(.leading, 5)
        .padding(.trailing, 4)
        .background(fill.opacity(event.isUnansweredInvite ? 0.06 : 0.16), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay {
            if event.isUnansweredInvite {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(fill, style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
            }
        }
        .opacity(isPast ? 0.55 : 1)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// "09:00–10:00", "All day", "from 22:00", "until 01:00".
    private var timeLabel: String {
        if event.allDay { return "All day" }
        let calendar = Calendar.current
        let dayStart = calendar.startOfDay(for: day)
        let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart)!
        let startsToday = event.start >= dayStart
        let endsToday = event.end <= dayEnd
        let start = event.start.formatted(date: .omitted, time: .shortened)
        let end = event.end.formatted(date: .omitted, time: .shortened)
        switch (startsToday, endsToday) {
        case (true, true): return "\(start)–\(end)"
        case (true, false): return "from \(start)"
        case (false, true): return "until \(end)"
        case (false, false): return "All day"
        }
    }
}

// MARK: - Month

/// The eighth cell: the month around the shown week; tap a day to jump to its week.
private struct MonthCell: View {
    let store: CalendarStore

    /// The month most of the shown week falls in (the week's Thursday).
    private var month: Date {
        Calendar.current.date(byAdding: .day, value: 3, to: store.firstDay) ?? store.firstDay
    }

    /// Every week that touches the month, Monday first.
    private var gridDays: [Date] {
        let calendar = Calendar.current
        guard let interval = calendar.dateInterval(of: .month, for: month) else { return [] }
        var days: [Date] = []
        var week = CalendarStore.weekStart(of: interval.start)
        while week < interval.end {
            days += (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: week) }
            week = calendar.date(byAdding: .day, value: 7, to: week)!
        }
        return days
    }

    var body: some View {
        let calendar = Calendar.current
        let columns = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)
        let shownWeek = store.firstDay

        VStack(alignment: .leading, spacing: 6) {
            Text(month.formatted(.dateTime.month(.wide)))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.foreground)
            LazyVGrid(columns: columns, spacing: 2) {
                ForEach(Array(["M", "T", "W", "T", "F", "S", "S"].enumerated()), id: \.offset) { _, letter in
                    Text(letter)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(Theme.faintForeground)
                }
                ForEach(gridDays, id: \.self) { day in
                    let inMonth = calendar.isDate(day, equalTo: month, toGranularity: .month)
                    let inShownWeek = CalendarStore.weekStart(of: day) == shownWeek
                    let isToday = calendar.isDateInToday(day)
                    Button {
                        Task { await store.show(day) }
                    } label: {
                        Text(day.formatted(.dateTime.day()))
                            .font(.system(size: 11, weight: isToday ? .bold : .medium))
                            .monospacedDigit()
                            .foregroundStyle(isToday ? .white : (inMonth ? Theme.foreground : Theme.faintForeground))
                            .frame(width: 20, height: 20)
                            .background(isToday ? Theme.primary : .clear, in: Circle())
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 1)
                            .background(inShownWeek ? Theme.primarySoft : .clear)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(day.formatted(date: .complete, time: .omitted))
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 150, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
