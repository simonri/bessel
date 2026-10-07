import SwiftUI
import UIKit

/// Create or edit an event, with the same fields as the desktop editor. Edits
/// send only what changed; repeating events ask which occurrences to change.
struct EventEditorView: View {
    let store: CalendarStore
    let target: EventEditorTarget

    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var allDay = false
    @State private var start = Date.now
    @State private var end = Date.now
    /// All-day events: the last day shown (the API's end is the day after).
    @State private var lastDay = Date.now
    @State private var location = ""
    @State private var notes = ""
    @State private var calendarID: UUID?
    @State private var busy = true
    /// Nil means a rule the presets can't express; it's kept as it is.
    @State private var repeatPreset: RepeatPreset? = RepeatPreset.none
    @State private var guests: [String] = []
    @State private var newGuest = ""
    @State private var addMeet = false
    @State private var notifyGuests = true
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var askingScope = false
    @State private var hasLoaded = false
    @FocusState private var titleFocused: Bool

    private var existing: CalendarEvent? {
        if case .edit(let event) = target { return event }
        return nil
    }

    private var account: CalendarAccount? { calendarID.flatMap(store.account(for:)) }
    private var isGoogle: Bool { account?.isGoogle == true }

    /// New events can go in any writable calendar; existing ones stay in their account.
    private var calendarChoices: [CalendarInfo] {
        guard let existing, let account = store.account(for: existing.calendarId) else { return store.writableCalendars }
        return account.calendars.filter { $0.writable && !$0.hidden }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(existing == nil ? "New event" : "Untitled", text: $title, axis: .vertical)
                        .font(.title3.weight(.semibold))
                        .focused($titleFocused)
                }
                .listRowBackground(Theme.card)

                timeSection

                Section {
                    Picker("Repeat", selection: $repeatPreset) {
                        ForEach(RepeatPreset.allCases) { preset in
                            Text(preset.label).tag(Optional(preset))
                        }
                        if repeatPreset == nil {
                            Text("Custom").tag(RepeatPreset?.none)
                        }
                    }
                    if !calendarChoices.isEmpty {
                        Picker("Calendar", selection: $calendarID) {
                            ForEach(calendarChoices) { calendar in
                                Text(calendar.name).tag(Optional(calendar.id))
                            }
                        }
                    }
                    Picker("Show as", selection: $busy) {
                        Text("Busy").tag(true)
                        Text("Free").tag(false)
                    }
                }
                .listRowBackground(Theme.card)

                Section {
                    TextField("Location", text: $location)
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(3...10)
                }
                .listRowBackground(Theme.card)

                if isGoogle {
                    guestsSection
                    if existing?.conferenceUrl == nil {
                        Section {
                            Toggle("Add Google Meet", isOn: $addMeet)
                        }
                        .listRowBackground(Theme.card)
                    }
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.circle")
                            .font(.footnote)
                            .foregroundStyle(Theme.destructive)
                    }
                    .listRowBackground(Theme.card)
                }
            }
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.background)
            .navigationTitle(existing == nil ? "New event" : "Edit event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button(existing == nil ? "Add" : "Save", action: save)
                            .fontWeight(.semibold)
                            .disabled(calendarID == nil)
                    }
                }
            }
            .confirmationDialog("Change which events?", isPresented: $askingScope, titleVisibility: .visible) {
                ForEach(allowedScopes) { scope in
                    Button(scope.label) { saveExisting(scope: scope) }
                }
                Button("Cancel", role: .cancel) {}
            }
            .onAppear(perform: populate)
        }
        .presentationCornerRadius(28)
        .presentationDragIndicator(.hidden)
        .interactiveDismissDisabled(isSaving)
    }

    // MARK: - Sections

    @ViewBuilder
    private var timeSection: some View {
        Section {
            Toggle("All day", isOn: Binding(get: { allDay }, set: toggleAllDay))
            if allDay {
                DatePicker("Starts", selection: $start, displayedComponents: .date)
                DatePicker("Ends", selection: $lastDay, in: start..., displayedComponents: .date)
            } else {
                DatePicker("Starts", selection: startKeepingLength, displayedComponents: [.date, .hourAndMinute])
                DatePicker("Ends", selection: $end, in: start.addingTimeInterval(15 * 60)..., displayedComponents: [.date, .hourAndMinute])
                Text(TimeZone.current.localizedName(for: .shortGeneric, locale: .current) ?? TimeZone.current.identifier)
                    .font(.footnote)
                    .foregroundStyle(Theme.mutedForeground)
            }
        }
        .listRowBackground(Theme.card)
    }

    private var guestsSection: some View {
        Section {
            ForEach(guests, id: \.self) { email in
                Text(email)
                    .font(.subheadline)
            }
            .onDelete { guests.remove(atOffsets: $0) }
            HStack {
                TextField("Add guest email", text: $newGuest)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit(addGuest)
                Button("Add", action: addGuest)
                    .disabled(!Self.isEmail(newGuest))
            }
            if !guests.isEmpty {
                Toggle("Email guests", isOn: $notifyGuests)
            }
        } header: {
            SectionHeading(title: "Guests")
        }
        .listRowBackground(Theme.card)
    }

    /// Moving the start keeps the length, only for changes made here.
    private var startKeepingLength: Binding<Date> {
        Binding(
            get: { start },
            set: { new in
                end = end.addingTimeInterval(new.timeIntervalSince(start))
                start = new
            }
        )
    }

    private func addGuest() {
        let email = newGuest.trimmingCharacters(in: .whitespaces).lowercased()
        guard Self.isEmail(email), !guests.contains(email) else { return }
        guests.append(email)
        newGuest = ""
    }

    private static func isEmail(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        guard let at = trimmed.firstIndex(of: "@") else { return false }
        return trimmed[trimmed.index(after: at)...].contains(".") && !trimmed.contains(" ")
    }

    // MARK: - State

    private func populate() {
        guard !hasLoaded else { return }
        hasLoaded = true
        UIDatePicker.appearance().minuteInterval = 15
        switch target {
        case .new(let timing):
            allDay = timing.allDay
            start = timing.start
            end = timing.end
            lastDay = Calendar.current.date(byAdding: .day, value: -1, to: timing.end) ?? timing.start
            calendarID = store.defaultCalendarID
            titleFocused = true
        case .edit(let event):
            title = event.title
            allDay = event.allDay
            start = event.start
            end = event.end
            lastDay = Calendar.current.date(byAdding: .day, value: -1, to: event.end) ?? event.start
            location = event.location ?? ""
            notes = event.description ?? ""
            calendarID = event.calendarId
            busy = event.busy
            repeatPreset = RepeatPreset.matching(event.recurrence, start: event.start)
            guests = event.attendees.map { $0.email.lowercased() }
        }
    }

    /// All-day → timed gives 9–10 on the start day; timed → all-day keeps the days.
    private func toggleAllDay(_ isOn: Bool) {
        let calendar = Calendar.current
        if isOn {
            let firstDay = calendar.startOfDay(for: start)
            let endsAtMidnight = calendar.startOfDay(for: end) == end
            var last = calendar.startOfDay(for: end)
            if endsAtMidnight, last > firstDay { last = calendar.date(byAdding: .day, value: -1, to: last)! }
            start = firstDay
            lastDay = max(last, firstDay)
        } else {
            let day = calendar.startOfDay(for: start)
            start = calendar.date(byAdding: .hour, value: 9, to: day)!
            end = calendar.date(byAdding: .hour, value: 10, to: day)!
        }
        allDay = isOn
    }

    private var timing: EventTiming {
        if allDay {
            let calendar = Calendar.current
            let first = calendar.startOfDay(for: start)
            let exclusiveEnd = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: max(lastDay, first)))!
            return EventTiming(allDay: true, start: first, end: exclusiveEnd)
        }
        return EventTiming(allDay: false, start: start, end: max(end, start.addingTimeInterval(15 * 60)))
    }

    // MARK: - Saving

    private func save() {
        errorMessage = nil
        guard let calendarID else { return }
        guard existing != nil else {
            create(in: calendarID)
            return
        }
        guard let existing else { return }
        if existing.recurring, !changes(for: existing).isEmpty || movesCalendar {
            askingScope = true
        } else {
            saveExisting(scope: .this)
        }
    }

    private func create(in calendarID: UUID) {
        var fields: [String: JSONValue] = [
            "title": .string(title.trimmingCharacters(in: .whitespacesAndNewlines)),
            "timing": timing.json(timeZone: store.timeZone),
            "location": .optionalString(location.trimmingCharacters(in: .whitespacesAndNewlines)),
            "description": .optionalString(notes.trimmingCharacters(in: .whitespacesAndNewlines)),
            "busy": .bool(busy),
            "notify_guests": .bool(isGoogle && !guests.isEmpty && notifyGuests),
        ]
        if let recurrence = repeatPreset?.recurrence(start: timing.start) {
            fields["recurrence"] = recurrence.json
        }
        if isGoogle, !guests.isEmpty {
            fields["attendees"] = .array(guests.map(JSONValue.string))
        }
        if isGoogle, addMeet {
            fields["add_conference"] = .bool(true)
        }
        run { try await store.create(in: calendarID, fields: fields) }
    }

    private var movesCalendar: Bool {
        guard let existing, let calendarID else { return false }
        return calendarID != existing.calendarId
    }

    private var recurrenceChanged: Bool {
        guard let existing, let repeatPreset else { return false }
        return repeatPreset != RepeatPreset.matching(existing.recurrence, start: existing.start)
    }

    /// Moving calendars applies to the whole series; changing the rule can't
    /// apply to a single occurrence. Same rules as the desktop.
    private var allowedScopes: [EditScope] {
        if movesCalendar { return [.all] }
        if recurrenceChanged { return [.following, .all] }
        return EditScope.allCases
    }

    /// Only the fields that differ from the event as loaded.
    private func changes(for event: CalendarEvent) -> [String: JSONValue] {
        var fields: [String: JSONValue] = [:]
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedTitle != event.title { fields["title"] = .string(trimmedTitle) }
        let newTiming = timing
        if newTiming != EventTiming(allDay: event.allDay, start: event.start, end: event.end) {
            fields["timing"] = newTiming.json(timeZone: store.timeZone)
        }
        let trimmedLocation = location.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedLocation != (event.location ?? "") { fields["location"] = .optionalString(trimmedLocation) }
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedNotes != (event.description ?? "") { fields["description"] = .optionalString(trimmedNotes) }
        if busy != event.busy { fields["busy"] = .bool(busy) }
        if recurrenceChanged, let repeatPreset {
            fields["recurrence"] = repeatPreset.recurrence(start: newTiming.start)?.json ?? .null
        }
        if isGoogle, Set(guests) != Set(event.attendees.map { $0.email.lowercased() }) {
            fields["attendees"] = .array(guests.map(JSONValue.string))
        }
        if isGoogle, addMeet { fields["add_conference"] = .bool(true) }
        return fields
    }

    private func saveExisting(scope: EditScope) {
        guard let existing else { return }
        let fields = changes(for: existing)
        guard !fields.isEmpty || movesCalendar else {
            dismiss()
            return
        }
        let notify = isGoogle && !guests.isEmpty && notifyGuests
        let destination = movesCalendar ? calendarID : nil
        run { try await store.update(existing, fields: fields, scope: scope, notifyGuests: notify, moveTo: destination) }
    }

    private func run(_ work: @escaping () async throws -> Void) {
        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                try await work()
                dismiss()
            } catch {
                errorMessage = CalendarStore.message(for: error)
            }
        }
    }
}

/// Show or hide calendars; the choice is shared with the desktop.
struct CalendarsSheet: View {
    let store: CalendarStore

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if store.accounts.isEmpty {
                    Text("Connect a Google or iCloud calendar on the desktop app to see it here.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedForeground)
                        .listRowBackground(Theme.card)
                }
                ForEach(store.accounts) { account in
                    Section {
                        ForEach(account.calendars) { calendar in
                            Toggle(isOn: Binding(
                                get: { !(store.calendar(calendar.id)?.hidden ?? calendar.hidden) },
                                set: { isOn in Task { await store.setHidden(calendar, hidden: !isOn) } }
                            )) {
                                HStack(spacing: 10) {
                                    Circle().fill(calendar.swiftColor).frame(width: 12, height: 12)
                                    Text(calendar.name)
                                    if !calendar.writable {
                                        Image(systemName: "lock")
                                            .font(.caption)
                                            .foregroundStyle(Theme.faintForeground)
                                    }
                                }
                            }
                            .tint(calendar.swiftColor)
                        }
                    } header: {
                        SectionHeading(title: account.email)
                    }
                    .listRowBackground(Theme.card)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle("Calendars")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationCornerRadius(28)
        .presentationDragIndicator(.hidden)
    }
}
