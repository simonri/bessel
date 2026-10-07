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

/// The week as eight cells filling the screen, two across and edge to edge:
/// Monday to Sunday with their events, and a month to jump around in.
struct CalendarView: View {
    let auth: AuthSession
    let isActive: Bool

    @State private var store: CalendarStore
    @State private var detailEvent: CalendarEvent?
    @State private var editorTarget: EventEditorTarget?
    @State private var dayList: Date?
    @State private var showingCalendars = false
    init(auth: AuthSession, services: AppServices, isActive: Bool) {
        self.auth = auth
        self.isActive = isActive
        _store = State(initialValue: CalendarStore(services: services))
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                header
                GeometryReader { geometry in
                    weekGrid(cellHeight: geometry.size.height / 4)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, Theme.pageTop)
            .padding(.bottom, 8)
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
            .sheet(item: dayListBinding) { day in
                DayEventsSheet(store: store, day: day.date) { event in
                    dayList = nil
                    detailEvent = event
                }
            }
            .sheet(isPresented: $showingCalendars) {
                CalendarsSheet(store: store)
            }
            .alert("Couldn't update the calendar", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(store.errorMessage ?? "")
            }
            .refreshWhileVisible(isActive) {
                await store.loadIfStale()
                // Keep up with changes made elsewhere while it's on screen, like the desktop does.
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(300))
                    guard !Task.isCancelled else { return }
                    await store.loadEvents()
                }
            }
            .loadErrorToast($store.loadError, isActive: isActive) { await store.load() }
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

    // MARK: - Grid

    /// Four rows of two, sharing hairlines instead of gaps.
    private func weekGrid(cellHeight: CGFloat) -> some View {
        VStack(spacing: 0) {
            ForEach(0..<4, id: \.self) { row in
                if row > 0 {
                    Theme.border.frame(height: 0.5)
                }
                HStack(spacing: 0) {
                    cell(row * 2, height: cellHeight)
                    Theme.border.frame(width: 0.5)
                    cell(row * 2 + 1, height: cellHeight)
                }
                .frame(height: cellHeight - (row > 0 ? 0.5 : 0))
            }
        }
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .contentShape(Rectangle())
        .gesture(swipeWeeks)
    }

    @ViewBuilder
    private func cell(_ index: Int, height: CGFloat) -> some View {
        if index < store.days.count {
            let day = store.days[index]
            DayCell(
                store: store,
                day: day,
                height: height,
                onCreate: { create(on: day) },
                onOpen: { detailEvent = $0 },
                onShowAll: { dayList = day }
            )
        } else {
            MonthCell(store: store, height: height)
        }
    }

    /// Swipe sideways to change week.
    private var swipeWeeks: some Gesture {
        DragGesture(minimumDistance: 30)
            .onEnded { value in
                let dx = value.translation.width
                guard abs(dx) > 60, abs(dx) > abs(value.translation.height) * 1.5 else { return }
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

    private struct ShownDay: Identifiable {
        let date: Date
        var id: Date { date }
    }

    private var dayListBinding: Binding<ShownDay?> {
        Binding(get: { dayList.map(ShownDay.init) }, set: { dayList = $0?.date })
    }

    private var errorBinding: Binding<Bool> {
        Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })
    }
}

// MARK: - Day

/// One day: name and date, then as many events as fit at a fixed height, with
/// "+N more" when they don't. Tap the empty part to add one.
private struct DayCell: View {
    let store: CalendarStore
    let day: Date
    let height: CGFloat
    let onCreate: () -> Void
    let onOpen: (CalendarEvent) -> Void
    let onShowAll: () -> Void

    private let padding: CGFloat = 8
    private let headerHeight: CGFloat = 24
    private let spacing: CGFloat = 3

    var body: some View {
        let isToday = Calendar.current.isDateInToday(day)
        let isPast = day < Calendar.current.startOfDay(for: .now)
        let events = store.events(on: day)
        let fits = max(Int((height - padding * 2 - headerHeight) / (EventLine.height + spacing)), 1)
        let shown = events.count > fits ? Array(events.prefix(fits - 1)) : events

        VStack(alignment: .leading, spacing: spacing) {
            HStack(alignment: .center) {
                Text(day.formatted(.dateTime.weekday(.abbreviated)))
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(isToday ? Theme.primary : (isPast ? Theme.faintForeground : Theme.foreground))
                Spacer(minLength: 2)
                Text(day.formatted(.dateTime.day()))
                    .font(.footnote.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(isToday ? .white : (isPast ? Theme.faintForeground : Theme.mutedForeground))
                    .frame(minWidth: 22, minHeight: 22)
                    .background(isToday ? Theme.primary : .clear, in: Circle())
            }
            .frame(height: headerHeight)
            ForEach(shown) { event in
                Button {
                    onOpen(event)
                } label: {
                    EventLine(event: event, day: day, store: store)
                }
                .buttonStyle(.plain)
            }
            if shown.count < events.count {
                Button(action: onShowAll) {
                    Text("+\(events.count - shown.count) more")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Theme.mutedForeground)
                        .frame(maxWidth: .infinity, minHeight: EventLine.height, alignment: .leading)
                        .padding(.leading, 4)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(padding)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(isToday ? Theme.primarySoft : .clear)
        .contentShape(Rectangle())
        .onTapGesture(perform: onCreate)
        .accessibilityAction(named: "Add event", onCreate)
    }
}

/// An event as one fixed-height line: colour, time and title.
private struct EventLine: View {
    static let height: CGFloat = 20

    let event: CalendarEvent
    let day: Date
    let store: CalendarStore

    var body: some View {
        let calendarColor = store.calendar(event.calendarId)?.swiftColor ?? .gray
        let fill = event.colorId.map(EventColors.color(for:)) ?? calendarColor

        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 1)
                .fill(calendarColor)
                .frame(width: 2.5, height: 12)
            if let time = timeLabel {
                Text(time)
                    .font(.system(size: 10, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(Theme.mutedForeground)
            }
            Text(event.displayTitle)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.foreground)
            Spacer(minLength: 0)
        }
        .lineLimit(1)
        .padding(.horizontal, 4)
        .frame(height: Self.height)
        .background(fill.opacity(event.isUnansweredInvite ? 0.06 : 0.16), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
        .overlay {
            if event.isUnansweredInvite {
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .strokeBorder(fill, style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
            }
        }
        .opacity(event.end <= .now ? 0.55 : 1)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// Start time for timed events that start this day; nil for all-day or continuing ones.
    private var timeLabel: String? {
        guard !event.allDay, event.start >= Calendar.current.startOfDay(for: day) else { return nil }
        return event.start.formatted(date: .omitted, time: .shortened)
    }
}

/// Every event of one day, for when they don't all fit in its cell.
private struct DayEventsSheet: View {
    let store: CalendarStore
    let day: Date
    let onOpen: (CalendarEvent) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 6) {
                    ForEach(store.events(on: day)) { event in
                        Button {
                            onOpen(event)
                        } label: {
                            EventLine(event: event, day: day, store: store)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            .background(Theme.background)
            .navigationTitle(day.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Theme.background)
        .presentationCornerRadius(28)
        .presentationDragIndicator(.hidden)
    }
}

// MARK: - Month

/// The eighth cell: the month around the shown week, sized to fit; tap a day
/// to jump to its week.
private struct MonthCell: View {
    let store: CalendarStore
    let height: CGFloat

    /// The month most of the shown week falls in (the week's Thursday).
    private var month: Date {
        Calendar.current.date(byAdding: .day, value: 3, to: store.firstDay) ?? store.firstDay
    }

    /// Every week that touches the month, Monday first.
    private var weeks: [[Date]] {
        let calendar = Calendar.current
        guard let interval = calendar.dateInterval(of: .month, for: month) else { return [] }
        var weeks: [[Date]] = []
        var week = CalendarStore.weekStart(of: interval.start)
        while week < interval.end {
            weeks.append((0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: week) })
            week = calendar.date(byAdding: .day, value: 7, to: week)!
        }
        return weeks
    }

    var body: some View {
        let calendar = Calendar.current
        let weeks = weeks
        // Title and weekday letters, then the weeks share what's left.
        let rowHeight = max((height - 16 - 20 - 14) / CGFloat(max(weeks.count, 1)), 14)

        VStack(alignment: .leading, spacing: 0) {
            Text(month.formatted(.dateTime.month(.wide)))
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Theme.foreground)
                .frame(height: 20)
            HStack(spacing: 0) {
                ForEach(Array(["M", "T", "W", "T", "F", "S", "S"].enumerated()), id: \.offset) { _, letter in
                    Text(letter)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(Theme.faintForeground)
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 14)
            ForEach(weeks, id: \.first) { week in
                let isShown = week.first == store.firstDay
                HStack(spacing: 0) {
                    ForEach(week, id: \.self) { day in
                        let inMonth = calendar.isDate(day, equalTo: month, toGranularity: .month)
                        let isToday = calendar.isDateInToday(day)
                        Text(day.formatted(.dateTime.day()))
                            .font(.system(size: 10, weight: isToday ? .bold : .medium))
                            .monospacedDigit()
                            .foregroundStyle(isToday ? .white : (inMonth ? Theme.foreground : Theme.faintForeground))
                            .frame(width: min(rowHeight, 18), height: min(rowHeight, 18))
                            .background(isToday ? Theme.primary : .clear, in: Circle())
                            .frame(maxWidth: .infinity)
                    }
                }
                .frame(height: rowHeight)
                .background(isShown ? Theme.primarySoft : .clear, in: Capsule())
                .contentShape(Rectangle())
                .onTapGesture { Task { await store.show(week[0]) } }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Week of \(week[0].formatted(.dateTime.month(.wide).day()))")
                .accessibilityAddTraits(.isButton)
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
