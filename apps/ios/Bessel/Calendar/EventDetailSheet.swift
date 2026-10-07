import SwiftUI

/// Tap an event: what, when, where and who, with RSVP, colour and delete.
struct EventDetailSheet: View {
    let store: CalendarStore
    let eventID: UUID
    let onEdit: (CalendarEvent) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var confirmingDelete = false
    @State private var pendingReply: String?
    /// A repeating event's chosen delete scope, waiting on "email guests?".
    @State private var deleteScope: EditScope?

    private var event: CalendarEvent? { store.events.first { $0.id == eventID } }

    var body: some View {
        NavigationStack {
            Group {
                if let event {
                    content(event)
                } else {
                    EmptyState(emoji: "🗓️", title: "This event is gone")
                        .frame(maxHeight: .infinity)
                }
            }
            .background(Theme.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Theme.background)
        .presentationCornerRadius(28)
        .presentationDragIndicator(.hidden)
    }

    // MARK: - Content

    private func content(_ event: CalendarEvent) -> some View {
        let calendar = store.calendar(event.calendarId)
        let tint = event.colorId.map(EventColors.color(for:)) ?? calendar?.swiftColor ?? .gray
        return ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Capsule()
                        .fill(tint)
                        .frame(width: 36, height: 5)
                        .padding(.bottom, 4)
                    Text(event.displayTitle)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(Theme.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(Self.when(event))
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedForeground)
                    if event.recurring {
                        Label(Self.repeatLabel(event), systemImage: "repeat")
                            .font(.subheadline)
                            .foregroundStyle(Theme.mutedForeground)
                    }
                }

                if let link = event.conferenceUrl, let url = URL(string: link) {
                    Button {
                        openURL(url)
                    } label: {
                        Label("Join video call", systemImage: "video.fill")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                            .background(Theme.primary, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }

                if store.canReply(event) {
                    rsvpBar(event)
                }

                card {
                    if let calendar {
                        infoRow(icon: "circle.fill", iconTint: calendar.swiftColor, iconSize: 10, title: calendar.name)
                    }
                    if let location = event.location, !location.isEmpty {
                        Self.divider
                        infoRow(icon: "mappin.and.ellipse", title: location)
                    }
                    Self.divider
                    infoRow(icon: event.busy ? "moon.zzz" : "sun.max", title: event.busy ? "Busy" : "Free")
                    if event.attendees.isEmpty, let creator = event.creatorName ?? event.creatorEmail {
                        Self.divider
                        infoRow(icon: "person", title: "Created by \(creator)")
                    }
                }

                if let description = event.description, !description.isEmpty {
                    card {
                        Text(description)
                            .font(.subheadline)
                            .foregroundStyle(Theme.foreground)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                    }
                }

                if !event.attendees.isEmpty {
                    guests(event)
                }

                if let reason = store.readOnlyReason(event), !store.canReply(event) {
                    Label(reason, systemImage: "lock")
                        .font(.footnote)
                        .foregroundStyle(Theme.faintForeground)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .confirmationDialog(deleteTitle(event), isPresented: $confirmingDelete, titleVisibility: .visible) {
            deleteButtons(event)
        }
        .confirmationDialog(
            "Email guests about the cancellation?",
            isPresented: Binding(get: { deleteScope != nil }, set: { if !$0 { deleteScope = nil } }),
            titleVisibility: .visible
        ) {
            if let scope = deleteScope {
                Button("Delete and email guests", role: .destructive) { delete(event, scope: scope, notify: true) }
                Button("Delete without emailing", role: .destructive) { delete(event, scope: scope, notify: false) }
            }
            Button("Cancel", role: .cancel) { deleteScope = nil }
        }
        .confirmationDialog("Answer for which events?", isPresented: Binding(get: { pendingReply != nil }, set: { if !$0 { pendingReply = nil } }), titleVisibility: .visible) {
            Button("This event") { reply(event, scope: .this) }
            Button("All events") { reply(event, scope: .all) }
            Button("Cancel", role: .cancel) { pendingReply = nil }
        }
    }

    private func card(@ViewBuilder _ content: () -> some View) -> some View {
        VStack(spacing: 0, content: content)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private static var divider: some View {
        Theme.border.frame(height: 0.5).padding(.leading, 50)
    }

    private func infoRow(icon: String, iconTint: Color = Theme.mutedForeground, iconSize: CGFloat = 16, title: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: iconSize))
                .foregroundStyle(iconTint)
                .frame(width: 22)
            Text(title)
                .font(.subheadline)
                .foregroundStyle(Theme.foreground)
                .textSelection(.enabled)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 48)
    }

    private func rsvpBar(_ event: CalendarEvent) -> some View {
        HStack(spacing: 8) {
            Text("Going?")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Theme.mutedForeground)
            Spacer()
            ForEach([("accepted", "Yes"), ("declined", "No"), ("tentative", "Maybe")], id: \.0) { value, label in
                FilterPill(title: label, isSelected: event.myResponse == value) {
                    if event.recurring {
                        pendingReply = value
                    } else {
                        Task { await store.respond(event, response: value, scope: .this) }
                    }
                }
            }
        }
        .padding(12)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func reply(_ event: CalendarEvent, scope: EditScope) {
        guard let value = pendingReply else { return }
        pendingReply = nil
        Task { await store.respond(event, response: value, scope: scope) }
    }

    private func guests(_ event: CalendarEvent) -> some View {
        let sorted = event.attendees.sorted { $0.isOrganizer && !$1.isOrganizer }
        return VStack(alignment: .leading, spacing: 8) {
            Text("\(sorted.count) \(sorted.count == 1 ? "guest" : "guests")")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.mutedForeground)
                .padding(.leading, 4)
            card {
            ForEach(Array(sorted.enumerated()), id: \.element.email) { index, guest in
                if index > 0 { Self.divider }
                HStack(spacing: 10) {
                    Text(String((guest.name ?? guest.email).prefix(1)).uppercased())
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.pastel(PastelHue.forName(guest.email)))
                        .frame(width: 28, height: 28)
                        .background(Theme.pastelWash(PastelHue.forName(guest.email), strength: 1.4), in: Circle())
                    VStack(alignment: .leading, spacing: 1) {
                        Text(guest.name ?? guest.email)
                            .font(.subheadline)
                            .foregroundStyle(Theme.foreground)
                        Text(guest.isOrganizer ? "Organizer" : Self.responseLabel(guest.response))
                            .font(.caption)
                            .foregroundStyle(Theme.mutedForeground)
                    }
                    .lineLimit(1)
                    Spacer()
                    Image(systemName: Self.responseIcon(guest.response))
                        .foregroundStyle(guest.response == "accepted" ? Theme.positive : guest.response == "declined" ? Theme.destructive : Theme.faintForeground)
                }
                .padding(.horizontal, 14)
                .frame(minHeight: 52)
            }
            }
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button { dismiss() } label: { Image(systemName: "xmark") }
                .accessibilityLabel("Close")
        }
        if let event {
            ToolbarItem(placement: .topBarTrailing) {
                moreMenu(event)
            }
            if store.canEdit(event) {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Edit") { onEdit(event) }
                        .fontWeight(.semibold)
                }
            }
        }
    }

    private func moreMenu(_ event: CalendarEvent) -> some View {
        let account = store.account(for: event.calendarId)
        let canColor = account?.isGoogle == true && account?.canWrite == true && store.calendar(event.calendarId)?.writable == true
        return Menu {
            if canColor {
                Menu {
                    ForEach(EventColors.menu, id: \.id) { option in
                        Button {
                            Task { await store.setColor(event, colorID: event.colorId == option.id ? nil : option.id) }
                        } label: {
                            if event.colorId == option.id {
                                Label(option.name, systemImage: "checkmark")
                            } else {
                                Text(option.name)
                            }
                        }
                    }
                    if event.colorId != nil {
                        Button("Calendar colour") { Task { await store.setColor(event, colorID: nil) } }
                    }
                } label: {
                    Label("Colour", systemImage: "paintpalette")
                }
            }
            if let link = event.htmlLink, let url = URL(string: link) {
                Button { openURL(url) } label: { Label("Open in Google Calendar", systemImage: "arrow.up.right.square") }
            }
            if store.canEdit(event) {
                Button(role: .destructive) { confirmingDelete = true } label: { Label("Delete", systemImage: "trash") }
            }
        } label: {
            Image(systemName: "ellipsis")
        }
        .accessibilityLabel("More")
    }

    // MARK: - Delete

    private func deleteTitle(_ event: CalendarEvent) -> String {
        event.recurring ? "Delete which events?" : "Delete this event?"
    }

    @ViewBuilder
    private func deleteButtons(_ event: CalendarEvent) -> some View {
        let emailsGuests = event.hasGuests && store.account(for: event.calendarId)?.isGoogle == true
        if event.recurring {
            ForEach(EditScope.allCases) { scope in
                Button(scope.label, role: .destructive) {
                    guard emailsGuests else {
                        delete(event, scope: scope, notify: false)
                        return
                    }
                    Task {
                        // Let this dialog close before asking about guests.
                        try? await Task.sleep(for: .milliseconds(400))
                        deleteScope = scope
                    }
                }
            }
        } else if emailsGuests {
            Button("Delete and email guests", role: .destructive) { delete(event, scope: .this, notify: true) }
            Button("Delete without emailing", role: .destructive) { delete(event, scope: .this, notify: false) }
        } else {
            Button("Delete", role: .destructive) { delete(event, scope: .this, notify: false) }
        }
        Button("Cancel", role: .cancel) {}
    }

    private func delete(_ event: CalendarEvent, scope: EditScope, notify: Bool) {
        deleteScope = nil
        dismiss()
        Task { await store.delete(event, scope: scope, notifyGuests: notify) }
    }

    // MARK: - Formatting

    static func when(_ event: CalendarEvent) -> String {
        if event.allDay {
            let lastDay = Calendar.current.date(byAdding: .day, value: -1, to: event.end) ?? event.start
            let first = event.start.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())
            if Calendar.current.isDate(lastDay, inSameDayAs: event.start) { return "\(first) · All day" }
            return "\(first) – \(lastDay.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())) · All day"
        }
        let day = event.start.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())
        let start = event.start.formatted(date: .omitted, time: .shortened)
        if Calendar.current.isDate(event.start, inSameDayAs: event.end) || event.end == Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: event.start)) {
            return "\(day) · \(start)–\(event.end.formatted(date: .omitted, time: .shortened))"
        }
        return "\(day) \(start) – \(event.end.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute()))"
    }

    static func repeatLabel(_ event: CalendarEvent) -> String {
        RepeatPreset.matching(event.recurrence, start: event.start).flatMap { $0 == .none ? nil : $0.label } ?? "Repeats"
    }

    static func responseLabel(_ response: String) -> String {
        switch response {
        case "accepted": "Going"
        case "declined": "Not going"
        case "tentative": "Maybe"
        default: "Hasn't answered"
        }
    }

    static func responseIcon(_ response: String) -> String {
        switch response {
        case "accepted": "checkmark.circle.fill"
        case "declined": "xmark.circle.fill"
        case "tentative": "questionmark.circle.fill"
        default: "circle.dashed"
        }
    }
}
