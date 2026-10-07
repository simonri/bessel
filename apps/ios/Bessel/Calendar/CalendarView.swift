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

/// A move or resize waiting on "which events?" or "email guests?".
struct PendingRetime: Identifiable {
    let event: CalendarEvent
    let timing: EventTiming
    var id: UUID { event.id }
}

/// Three days side by side, like the desktop calendar's week view.
struct CalendarView: View {
    let auth: AuthSession

    @State private var store: CalendarStore
    @State private var detailEvent: CalendarEvent?
    @State private var editorTarget: EventEditorTarget?
    @State private var showingCalendars = false
    @State private var selectedID: UUID?
    @State private var pendingRetime: PendingRetime?
    @Environment(\.scenePhase) private var scenePhase

    private let gutter: CGFloat = 44

    init(auth: AuthSession) {
        self.auth = auth
        _store = State(initialValue: CalendarStore(client: APIClient(auth: auth)))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header
                    .padding(.horizontal, 16)
                    .padding(.top, Theme.pageTop)
                    .padding(.bottom, 10)
                dayHeaders
                allDayRow
                Theme.border.frame(height: 0.5)
                grid
            }
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
            .confirmationDialog(
                retimeTitle,
                isPresented: Binding(get: { pendingRetime != nil }, set: { if !$0 { cancelRetime() } }),
                titleVisibility: .visible,
                presenting: pendingRetime
            ) { pending in
                retimeButtons(pending)
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
            Text(monthTitle)
                .font(.headline)
                .foregroundStyle(Theme.foreground)
            Spacer()
            if !store.isShowingToday {
                FilterPill(title: "Today", isSelected: false) {
                    Task { await store.goToToday() }
                }
            }
            navButton("chevron.left", label: "Previous days") { Task { await store.step(-CalendarStore.dayCount) } }
            navButton("chevron.right", label: "Next days") { Task { await store.step(CalendarStore.dayCount) } }
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

    /// Today's month when today is shown, else the month most shown days fall in.
    private var monthTitle: String {
        let calendar = Calendar.current
        if store.isShowingToday {
            return Date.now.formatted(.dateTime.month(.wide).year())
        }
        let months = Dictionary(grouping: store.days) { calendar.dateComponents([.year, .month], from: $0) }
        let best = store.days.reversed().max { (months[calendar.dateComponents([.year, .month], from: $0)]?.count ?? 0) < (months[calendar.dateComponents([.year, .month], from: $1)]?.count ?? 0) }
        return (best ?? store.firstDay).formatted(.dateTime.month(.wide).year())
    }

    private var dayHeaders: some View {
        HStack(spacing: 0) {
            Color.clear.frame(width: gutter, height: 1)
            ForEach(store.days, id: \.self) { day in
                let isToday = Calendar.current.isDateInToday(day)
                VStack(spacing: 2) {
                    Text(day.formatted(.dateTime.weekday(.abbreviated)))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(isToday ? Theme.primary : Theme.mutedForeground)
                    Text(day.formatted(.dateTime.day()))
                        .font(.headline)
                        .foregroundStyle(isToday ? .white : Theme.foreground)
                        .frame(width: 32, height: 32)
                        .background(isToday ? Theme.primary : .clear, in: Circle())
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.bottom, 6)
        .contentShape(Rectangle())
        .gesture(swipeDays)
    }

    // MARK: - All-day

    private var allDayRow: some View {
        let layout = CalendarLayout.layoutAllDay(store.visibleEvents, days: store.days)
        let rows = max(layout.rows, 1)
        let rowHeight = CalendarLayout.allDayRowHeight
        return HStack(spacing: 0) {
            Text("all-day")
                .font(.caption2)
                .foregroundStyle(Theme.faintForeground)
                .padding(.trailing, 6)
                .frame(width: gutter, alignment: .trailing)
            GeometryReader { geometry in
                let columnWidth = geometry.size.width / CGFloat(CalendarStore.dayCount)
                ZStack(alignment: .topLeading) {
                    HStack(spacing: 0) {
                        ForEach(store.days, id: \.self) { day in
                            Color.clear
                                .contentShape(Rectangle())
                                .onTapGesture { tapAllDay(day) }
                        }
                    }
                    ForEach(layout.items) { item in
                        AllDayChip(event: item.event, store: store, isSelected: selectedID == item.event.id)
                            .frame(width: columnWidth * CGFloat(item.span) - 4, height: rowHeight - 4)
                            .offset(x: columnWidth * CGFloat(item.startColumn) + 2, y: 3 + CGFloat(item.row) * rowHeight)
                            .onTapGesture { detailEvent = item.event }
                    }
                }
            }
            .frame(height: CGFloat(rows) * rowHeight + 6)
        }
    }

    private func tapAllDay(_ day: Date) {
        guard selectedID == nil else { selectedID = nil; return }
        guard store.canCreate else {
            store.errorMessage = "Connect a calendar account that allows editing on the desktop to add events."
            return
        }
        let end = Calendar.current.date(byAdding: .day, value: 1, to: day)!
        editorTarget = .new(EventTiming(allDay: true, start: day, end: end))
    }

    // MARK: - Grid

    private var grid: some View {
        ScrollView {
                GeometryReader { geometry in
                    let columnWidth = (geometry.size.width - gutter) / CGFloat(CalendarStore.dayCount)
                    ZStack(alignment: .topLeading) {
                        hourLines(width: geometry.size.width)
                        HStack(spacing: 0) {
                            ForEach(Array(store.days.enumerated()), id: \.element) { index, day in
                                DayColumn(
                                    store: store,
                                    day: day,
                                    dayIndex: index,
                                    columnWidth: columnWidth,
                                    selectedID: $selectedID,
                                    onTapEmpty: { minutes in tapSlot(day: day, minutes: minutes) },
                                    onOpen: { detailEvent = $0 },
                                    onRetime: requestRetime
                                )
                                .frame(width: columnWidth)
                                .overlay(alignment: .leading) {
                                    Theme.border.frame(width: 0.5)
                                }
                            }
                        }
                        .padding(.leading, gutter)
                        NowLine(days: store.days, gutter: gutter, columnWidth: columnWidth)
                    }
                }
                .frame(height: CalendarLayout.hourHeight * 24)
                .padding(.bottom, 90)
        }
        .simultaneousGesture(swipeDays)
        // Opens with the current time in view.
        .defaultScrollAnchor(UnitPoint(x: 0, y: Self.dayFraction(.now)))
    }

    private func hourLines(width: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            ForEach(0..<25, id: \.self) { hour in
                let y = CGFloat(hour) * CalendarLayout.hourHeight
                if hour > 0 && hour < 24 {
                    Theme.border
                        .frame(width: width - gutter, height: 0.5)
                        .offset(x: gutter, y: y)
                    Text(CalendarLayout.date(.now, minutes: hour * 60).formatted(.dateTime.hour()))
                        .font(.caption2)
                        .monospacedDigit()
                        .foregroundStyle(Theme.faintForeground)
                        .frame(width: gutter - 8, alignment: .trailing)
                        .offset(y: y - 7)
                }
            }
        }
    }

    /// How far through the day a time is, from 0 to 1.
    private static func dayFraction(_ date: Date) -> Double {
        let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
        return Double((parts.hour ?? 0) * 60 + (parts.minute ?? 0)) / 1440
    }

    /// Swipe the grid sideways to step through days.
    private var swipeDays: some Gesture {
        DragGesture(minimumDistance: 40)
            .onEnded { value in
                let dx = value.translation.width
                guard abs(dx) > 80, abs(dx) > abs(value.translation.height) * 2, !DayColumn.isDraggingEvent else { return }
                Task { await store.step(dx < 0 ? CalendarStore.dayCount : -CalendarStore.dayCount) }
            }
    }

    // MARK: - Actions

    private func tapSlot(day: Date, minutes: Int) {
        guard selectedID == nil else { selectedID = nil; return }
        guard store.canCreate else {
            store.errorMessage = "Connect a calendar account that allows editing on the desktop to add events."
            return
        }
        let start = CalendarLayout.date(day, minutes: minutes)
        let end = CalendarLayout.date(day, minutes: min(minutes + CalendarLayout.defaultDurationMinutes, 1440))
        editorTarget = .new(EventTiming(allDay: false, start: start, end: end))
    }

    /// Repeating events ask which ones; Google events with guests ask about emailing.
    private func requestRetime(_ event: CalendarEvent, _ timing: EventTiming) {
        let emailsGuests = event.hasGuests && store.account(for: event.calendarId)?.isGoogle == true
        if event.recurring || emailsGuests {
            pendingRetime = PendingRetime(event: event, timing: timing)
        } else {
            Task { await store.retime(event, to: timing, scope: .this, notifyGuests: false) }
        }
    }

    private var retimeTitle: String {
        guard let pending = pendingRetime else { return "" }
        return pending.event.recurring ? "Change which events?" : "Email guests about the change?"
    }

    @ViewBuilder
    private func retimeButtons(_ pending: PendingRetime) -> some View {
        let notify = pending.event.hasGuests && store.account(for: pending.event.calendarId)?.isGoogle == true
        if pending.event.recurring {
            ForEach(EditScope.allCases) { scope in
                Button(scope.label) { commitRetime(pending, scope: scope, notify: notify) }
            }
        } else {
            Button("Send update") { commitRetime(pending, scope: .this, notify: true) }
            Button("Don't send") { commitRetime(pending, scope: .this, notify: false) }
        }
        Button("Cancel", role: .cancel) { cancelRetime() }
    }

    private func commitRetime(_ pending: PendingRetime, scope: EditScope, notify: Bool) {
        pendingRetime = nil
        Task { await store.retime(pending.event, to: pending.timing, scope: scope, notifyGuests: notify) }
    }

    private func cancelRetime() {
        pendingRetime = nil
    }

    private var errorBinding: Binding<Bool> {
        Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })
    }
}

// MARK: - Day column

/// One day of the grid: tap empty space to add, events laid out side by side,
/// hold an event to move it, drag the handle of the selected one to resize.
private struct DayColumn: View {
    let store: CalendarStore
    let day: Date
    let dayIndex: Int
    let columnWidth: CGFloat
    @Binding var selectedID: UUID?
    let onTapEmpty: (Int) -> Void
    let onOpen: (CalendarEvent) -> Void
    let onRetime: (CalendarEvent, EventTiming) -> Void

    /// Lets the day swipe ignore drags that were moving an event.
    @MainActor static var isDraggingEvent = false

    @State private var draggingID: UUID?
    @State private var dragOffset: CGSize = .zero
    @State private var resizingID: UUID?
    @State private var resizeDelta: CGFloat = 0

    var body: some View {
        let placed = CalendarLayout.layoutDay(store.visibleEvents, day: day)
        ZStack(alignment: .topLeading) {
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture(coordinateSpace: .local) { location in
                    onTapEmpty(CalendarLayout.snappedMinutes(atY: location.y))
                }
            ForEach(placed) { item in
                eventView(item)
            }
        }
    }

    @ViewBuilder
    private func eventView(_ item: CalendarLayout.Placed) -> some View {
        let event = item.event
        let width = columnWidth / CGFloat(item.columns)
        let isDragging = draggingID == event.id
        let isResizing = resizingID == event.id
        let isSelected = selectedID == event.id
        let editable = store.canEdit(event)
        let height = max(item.height + (isResizing ? resizeDelta : 0), CalendarLayout.minEventHeight)

        EventChip(event: event, store: store, isSelected: isSelected || isDragging, height: height)
            .frame(width: width - 3, height: height - 1)
            .overlay(alignment: .bottom) {
                if isSelected && editable && !isDragging {
                    resizeHandle(event, item: item)
                }
            }
            .offset(x: width * CGFloat(item.column) + 1.5, y: item.top)
            .offset(isDragging ? dragOffset : .zero)
            .zIndex(isDragging || isSelected ? 1 : 0)
            .shadow(color: .black.opacity(isDragging ? 0.2 : 0), radius: 8, y: 4)
            .onTapGesture {
                if isSelected { selectedID = nil } else { onOpen(event) }
            }
            .gesture(editable ? moveGesture(event) : nil)
            .animation(.snappy(duration: 0.2), value: isDragging)
    }

    /// Hold, then drag: moves in 15-minute steps and across the shown days.
    private func moveGesture(_ event: CalendarEvent) -> some Gesture {
        LongPressGesture(minimumDuration: 0.3)
            .sequenced(before: DragGesture(minimumDistance: 0))
            .onChanged { value in
                guard case .second(true, let drag) = value else { return }
                if draggingID != event.id {
                    draggingID = event.id
                    selectedID = event.id
                    Self.isDraggingEvent = true
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                }
                let translation = drag?.translation ?? .zero
                let dayDelta = clampedDayDelta(translation.width)
                let minuteDelta = CalendarLayout.snappedDelta(forDY: translation.height)
                dragOffset = CGSize(
                    width: CGFloat(dayDelta) * columnWidth,
                    height: CGFloat(minuteDelta) / 60 * CalendarLayout.hourHeight
                )
            }
            .onEnded { value in
                defer {
                    draggingID = nil
                    dragOffset = .zero
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(300))
                        Self.isDraggingEvent = false
                    }
                }
                guard case .second(true, let drag) = value, let drag else { return }
                let dayDelta = clampedDayDelta(drag.translation.width)
                let minuteDelta = CalendarLayout.snappedDelta(forDY: drag.translation.height)
                guard dayDelta != 0 || minuteDelta != 0 else { return }
                let shift = TimeInterval(minuteDelta * 60)
                let calendar = Calendar.current
                let start = calendar.date(byAdding: .day, value: dayDelta, to: event.start)!.addingTimeInterval(shift)
                let end = calendar.date(byAdding: .day, value: dayDelta, to: event.end)!.addingTimeInterval(shift)
                selectedID = nil
                onRetime(event, EventTiming(allDay: false, start: start, end: end))
            }
    }

    private func clampedDayDelta(_ dx: CGFloat) -> Int {
        let raw = Int((dx / columnWidth).rounded())
        return min(max(raw, -dayIndex), CalendarStore.dayCount - 1 - dayIndex)
    }

    /// Bottom grip on the selected event: drag to change when it ends.
    private func resizeHandle(_ event: CalendarEvent, item: CalendarLayout.Placed) -> some View {
        Capsule()
            .fill(Theme.foreground.opacity(0.6))
            .frame(width: 28, height: 5)
            .padding(.vertical, 8)
            .padding(.horizontal, 12)
            .contentShape(Rectangle())
            .offset(y: 10)
            .highPriorityGesture(
                DragGesture(minimumDistance: 1)
                    .onChanged { value in
                        resizingID = event.id
                        Self.isDraggingEvent = true
                        let minDelta = CGFloat(CalendarLayout.minDurationMinutes) / 60 * CalendarLayout.hourHeight - item.height
                        let delta = CGFloat(CalendarLayout.snappedDelta(forDY: value.translation.height)) / 60 * CalendarLayout.hourHeight
                        resizeDelta = max(delta, minDelta)
                    }
                    .onEnded { _ in
                        let minutes = Int((resizeDelta / CalendarLayout.hourHeight * 60).rounded())
                        resizingID = nil
                        resizeDelta = 0
                        Self.isDraggingEvent = false
                        guard minutes != 0 else { return }
                        let end = max(
                            event.end.addingTimeInterval(TimeInterval(minutes * 60)),
                            event.start.addingTimeInterval(TimeInterval(CalendarLayout.minDurationMinutes * 60))
                        )
                        selectedID = nil
                        onRetime(event, EventTiming(allDay: false, start: event.start, end: end))
                    }
            )
            .accessibilityLabel("Change end time")
    }
}

// MARK: - Chips

/// An event block: its colour as a soft fill, the calendar's colour as a bar.
struct EventChip: View {
    let event: CalendarEvent
    let store: CalendarStore
    let isSelected: Bool
    let height: CGFloat

    var body: some View {
        let calendarColor = store.calendar(event.calendarId)?.swiftColor ?? .gray
        let fill = event.colorId.map(EventColors.color(for:)) ?? calendarColor
        let isPast = event.end <= .now
        let compact = height < CalendarLayout.compactHeight

        HStack(spacing: 0) {
            Rectangle()
                .fill(isPast ? calendarColor.opacity(0.5) : calendarColor)
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 1) {
                if compact {
                    (Text(event.displayTitle).fontWeight(.semibold) + Text("  \(event.start.formatted(date: .omitted, time: .shortened))"))
                        .lineLimit(1)
                } else {
                    Text(event.displayTitle)
                        .fontWeight(.semibold)
                        .lineLimit(height > 70 ? 3 : 1)
                    Text("\(event.start.formatted(date: .omitted, time: .shortened))–\(event.end.formatted(date: .omitted, time: .shortened))")
                        .lineLimit(1)
                        .opacity(0.8)
                }
            }
            .font(.caption2)
            .foregroundStyle(isSelected ? .white : (isPast ? Theme.mutedForeground : Theme.foreground))
            .padding(.horizontal, 4)
            .padding(.vertical, compact ? 2 : 4)
            Spacer(minLength: 0)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .background(isSelected ? fill : fill.opacity(event.isUnansweredInvite ? 0.1 : (isPast ? 0.13 : 0.28)))
        .overlay {
            if event.isUnansweredInvite {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(fill, style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(event.displayTitle), \(event.start.formatted(date: .omitted, time: .shortened)) to \(event.end.formatted(date: .omitted, time: .shortened))")
    }
}

private struct AllDayChip: View {
    let event: CalendarEvent
    let store: CalendarStore
    let isSelected: Bool

    var body: some View {
        let calendarColor = store.calendar(event.calendarId)?.swiftColor ?? .gray
        let fill = event.colorId.map(EventColors.color(for:)) ?? calendarColor
        Text(event.displayTitle)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(Theme.foreground)
            .lineLimit(1)
            .padding(.horizontal, 6)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(fill.opacity(0.28), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
            .overlay(alignment: .leading) {
                calendarColor.frame(width: 3).clipShape(RoundedRectangle(cornerRadius: 2))
            }
    }
}

/// The current time across the shown days, strongest on today.
private struct NowLine: View {
    let days: [Date]
    let gutter: CGFloat
    let columnWidth: CGFloat

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            let now = context.date
            if let todayIndex = days.firstIndex(where: { Calendar.current.isDate($0, inSameDayAs: now) }) {
                let parts = Calendar.current.dateComponents([.hour, .minute], from: now)
                let y = CGFloat((parts.hour ?? 0) * 60 + (parts.minute ?? 0)) / 60 * CalendarLayout.hourHeight
                ZStack(alignment: .topLeading) {
                    Theme.primary.opacity(0.25)
                        .frame(width: columnWidth * CGFloat(days.count), height: 1)
                        .offset(x: gutter, y: y)
                    Theme.primary
                        .frame(width: columnWidth, height: 1.5)
                        .offset(x: gutter + columnWidth * CGFloat(todayIndex), y: y - 0.25)
                    Circle()
                        .fill(Theme.primary)
                        .frame(width: 8, height: 8)
                        .offset(x: gutter + columnWidth * CGFloat(todayIndex) - 4, y: y - 3.5)
                    Text(now.formatted(date: .omitted, time: .shortened))
                        .font(.system(size: 9, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .padding(.horizontal, 3)
                        .padding(.vertical, 1)
                        .background(Theme.primary, in: Capsule())
                        .frame(width: gutter - 2, alignment: .trailing)
                        .offset(y: y - 7)
                }
                .allowsHitTesting(false)
            }
        }
    }
}
