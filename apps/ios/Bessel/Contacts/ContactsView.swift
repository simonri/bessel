import SwiftUI

/// The address book A to Z, with events to follow up on and birthdays and
/// other dates coming up on top. Pushed from the Calendar tab, whose events
/// say who you last saw.
struct ContactsView: View {
    @Bindable var store: ContactsStore
    let isActive: Bool

    @State private var search = ""
    @State private var noting: ContactFollowUp?

    private var sections: [ContactSection] {
        guard !search.isEmpty else { return store.sections }
        return store.sections.compactMap { section in
            let matching = section.contacts.filter { $0.matches(search) }
            return matching.isEmpty ? nil : ContactSection(letter: section.letter, contacts: matching)
        }
    }

    var body: some View {
        List {
            if store.hasLoaded {
                if search.isEmpty {
                    followUps
                    comingUp
                }
                if sections.isEmpty {
                    Section {
                        emptyState
                            .padding(.vertical, 40)
                            .listRowBackground(Color.clear)
                    }
                }
                ForEach(sections) { section in
                    Section {
                        ForEach(section.contacts) { contact in
                            NavigationLink(value: MoreRoute.contact(contact.id)) {
                                ContactRow(name: contact.displayName, photoURL: contact.photoUrl, detail: contact.subtitle)
                            }
                            .listRowBackground(Theme.card)
                            .listRowSeparatorTint(Theme.border)
                        }
                    } header: {
                        SectionHeading(title: section.letter)
                    }
                }
                if search.isEmpty, !store.contacts.isEmpty {
                    syncFooter
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await store.refresh() }
        .listSectionSpacing(18)
        .contentMargins(.top, 0, for: .scrollContent)
        .contentMargins(.bottom, 80, for: .scrollContent)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.immediately)
        .stickyHeader { searchField }
        .background(Theme.background)
        .overlay {
            if !store.hasLoaded { ProgressView() }
        }
        .navigationTitle("Contacts")
        .toolbarTitleDisplayMode(.inlineLarge)
        .sheet(item: $noting) { followUp in
            FollowUpNoteSheet(followUp: followUp, store: store)
        }
        .alert("Something went wrong", isPresented: errorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(store.errorMessage ?? "")
        }
        .refreshWhileVisible(isActive) { await store.loadIfStale() }
        .loadErrorToast($store.loadError, isActive: isActive) { await store.load() }
    }

    // MARK: - Follow up and coming up

    @ViewBuilder
    private var followUps: some View {
        if !store.followUps.isEmpty {
            Section {
                ForEach(store.followUps) { followUp in
                    FollowUpRow(followUp: followUp, store: store) {
                        noting = followUp
                    }
                    .listRowBackground(Theme.card)
                    .listRowSeparatorTint(Theme.border)
                }
            } header: {
                SectionHeading(title: "Follow up", count: store.followUps.count)
            }
        }
    }

    @ViewBuilder
    private var comingUp: some View {
        if let dates = store.reminders?.dates, !dates.isEmpty {
            Section {
                ForEach(dates, id: \.self) { reminder in
                    NavigationLink(value: MoreRoute.contact(reminder.contact.id)) {
                        ContactRow(
                            name: reminder.contact.displayName,
                            photoURL: reminder.contact.photoUrl,
                            detail: ContactText.comingUp(reminder),
                            emoji: emoji(for: reminder)
                        )
                    }
                    .listRowBackground(Theme.card)
                    .listRowSeparatorTint(Theme.border)
                }
            } header: {
                SectionHeading(title: "Coming up", count: dates.count)
            }
        }
    }

    private func emoji(for reminder: ContactDateReminder) -> String {
        guard reminder.label == ContactText.birthdayLabel else { return "📅" }
        return Calendar.current.isDateInToday(reminder.on) ? "🎉" : "🎂"
    }

    // MARK: - Header and footer

    /// In the page rather than `.searchable`, whose bar sits flush under the title.
    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Theme.mutedForeground)
            TextField("Search", text: $search)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !search.isEmpty {
                Button {
                    search = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(Theme.faintForeground)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 44)
        .background(Theme.fill, in: Capsule())
    }

    /// When Google last sent the address book over, under the list.
    private var syncFooter: some View {
        Section {
        } footer: {
            VStack(spacing: 4) {
                Text("\(store.contacts.count == 1 ? "1 contact" : "\(store.contacts.count) contacts") from Google")
                if let error = store.syncError {
                    Text(error)
                        .foregroundStyle(Theme.dueOverdue)
                } else if let syncedAt = store.syncedAt {
                    Text("Synced \(syncedAt.formatted(.relative(presentation: .named)))")
                }
            }
            .font(.footnote)
            .foregroundStyle(Theme.faintForeground)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        if store.contacts.isEmpty {
            EmptyState(emoji: "📇", title: "No contacts yet", detail: "Connect your Google account in Calendar and the people in it show up here.")
        } else {
            EmptyState(emoji: "🔍", title: "No matches", detail: "Try a name, a company, a tag or part of a number.")
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )
    }
}

/// A person in a list: their photo or initials, their name, and one line under it.
private struct ContactRow: View {
    let name: String
    let photoURL: String?
    let detail: String?
    var emoji: String?

    var body: some View {
        HStack(spacing: 12) {
            ContactAvatar(name: name, photoURL: photoURL, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(name.isEmpty ? "No name" : name)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Theme.foreground)
                    .lineLimit(1)
                if let detail, !detail.isEmpty {
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedForeground)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if let emoji {
                Text(emoji)
                    .font(.system(size: 20))
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }
}

/// An event that just ended, asked about in place: a note for someone who was
/// surely there, or whether someone who might have been was.
private struct FollowUpRow: View {
    let followUp: ContactFollowUp
    let store: ContactsStore
    let addNote: () -> Void

    private var detail: String {
        let day = ContactText.entryDay(followUp.event.on)
        return followUp.prompt == .confirm ? day : "\(followUp.event.title) - \(day)"
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ContactAvatar(name: followUp.contact.displayName, photoURL: followUp.contact.photoUrl, size: 40)
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(followUp.question)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Theme.foreground)
                        .lineLimit(2)
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedForeground)
                        .lineLimit(1)
                }
                HStack(spacing: 8) {
                    if followUp.prompt == .confirm {
                        answer("Yes", prominent: true) { await store.confirm(followUp) }
                        answer("No") { await store.dismiss(followUp) }
                    } else {
                        Button("Add a note", action: addNote)
                            .buttonStyle(.borderedProminent)
                            .tint(Theme.primary)
                            .controlSize(.small)
                        answer("Skip") { await store.confirm(followUp) }
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }

    /// Each button styled on its own, so a tap in the row only fires the one it's on.
    @ViewBuilder
    private func answer(_ title: String, prominent: Bool = false, action: @escaping () async -> Void) -> some View {
        let button = Button(title) { Task { await action() } }
            .controlSize(.small)
        if prominent {
            button
                .buttonStyle(.borderedProminent)
                .tint(Theme.primary)
        } else {
            button
                .buttonStyle(.bordered)
                .tint(Theme.mutedForeground)
        }
    }
}

/// The note for someone who was at an event. Saving logs the event with it.
private struct FollowUpNoteSheet: View {
    let followUp: ContactFollowUp
    let store: ContactsStore

    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @FocusState private var focused: Bool

    private var isBlank: Bool {
        note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("What happened?", text: $note, axis: .vertical)
                        .lineLimit(3...8)
                        .focused($focused)
                } header: {
                    Text(followUp.question)
                        .textCase(nil)
                } footer: {
                    Text("\(followUp.event.title) - \(ContactText.entryDay(followUp.event.on))")
                }
            }
            .navigationTitle(followUp.contact.displayName.isEmpty ? "Note" : followUp.contact.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let typed = note
                        dismiss()
                        Task { await store.confirm(followUp, note: typed) }
                    }
                    .disabled(isBlank)
                }
            }
            .onAppear { focused = true }
        }
        .presentationDetents([.medium])
    }
}

/// The contact's Google photo, or their initials on a pastel picked from the name.
struct ContactAvatar: View {
    let name: String
    let photoURL: String?
    let size: CGFloat

    private var hue: Double { PastelHue.forName(name) }

    var body: some View {
        initials
            .overlay {
                if let url = photoURL.flatMap(URL.init(string:)) {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image
                                .resizable()
                                .scaledToFill()
                        }
                    }
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .accessibilityHidden(true)
    }

    private var initials: some View {
        Text(ContactText.initials(name))
            .font(.system(size: size * 0.38, weight: .semibold, design: .rounded))
            .foregroundStyle(Theme.pastel(hue))
            .frame(width: size, height: size)
            .background(Theme.pastelWash(hue, strength: 1.4), in: Circle())
    }
}
