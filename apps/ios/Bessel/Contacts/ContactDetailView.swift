import SwiftUI
import UIKit

/// One person: call, message or email them in a tap, a log of when you were
/// in touch, and everything Google has on them. Google's fields are edited in
/// the Contacts app, which syncs them back.
struct ContactDetailView: View {
    let store: ContactsStore
    let contactID: UUID

    @Environment(\.openURL) private var openURL
    @State private var addingTag = false
    @State private var newTag = ""
    @FocusState private var tagFieldFocused: Bool
    @State private var note = ""
    @State private var kind: ContactInteractionKind = .met
    @State private var isLogging = false
    @State private var logged = 0
    @State private var historyError: String?

    var body: some View {
        Group {
            if let contact = store.contact(contactID) {
                content(contact)
            } else if store.hasLoaded {
                EmptyState(emoji: "🫥", title: "This contact is gone")
            } else {
                ProgressView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
        .navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
    }

    private func reload() async {
        let store = store
        let id = contactID
        async let history = store.loadInteractions(id)
        await store.reload(id)
        historyError = await history
    }

    private func content(_ contact: ContactItem) -> some View {
        List {
            Section {
                VStack(spacing: 20) {
                    header(contact)
                    actions(contact)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
            }
            logSection(contact)
            historySection(contact)
            section("Tags") {
                tags(contact)
                    .cardRow()
            }
            if !contact.phones.isEmpty {
                section("Phone") {
                    methodRows(contact.phones, systemImage: "phone", url: ContactText.callURL)
                }
            }
            if !contact.emails.isEmpty {
                section("Email") {
                    methodRows(contact.emails, systemImage: "envelope", url: ContactText.emailURL)
                }
            }
            if !contact.addresses.isEmpty {
                section("Address") {
                    methodRows(contact.addresses, systemImage: "map", url: ContactText.mapsURL)
                }
            }
            if contact.birthday != nil || !contact.dates.isEmpty {
                section(contact.dates.isEmpty ? "Birthday" : "Dates") {
                    if let birthday = contact.birthday {
                        dateRow(label: contact.dates.isEmpty ? nil : "Birthday", text: ContactText.birthday(birthday), systemImage: "gift")
                    }
                    ForEach(Array(contact.dates.enumerated()), id: \.offset) { _, date in
                        dateRow(label: ContactText.methodLabel(date.label), text: ContactText.date(date), systemImage: "calendar")
                    }
                }
            }
            if !contact.urls.isEmpty {
                section("Links") {
                    methodRows(contact.urls, systemImage: "link", url: ContactText.linkURL)
                }
            }
            if let notes = contact.notes, !notes.isEmpty {
                section("Notes") {
                    Text(notes)
                        .foregroundStyle(Theme.foreground)
                        .textSelection(.enabled)
                        .cardRow()
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(18)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.immediately)
        .contentMargins(.bottom, 80, for: .scrollContent)
        .solidTopEdge()
        .refreshable { await reload() }
        .haptic(.success, trigger: logged)
    }

    // MARK: - Header

    private func header(_ contact: ContactItem) -> some View {
        VStack(spacing: 6) {
            ContactAvatar(name: contact.displayName, photoURL: contact.photoUrl, size: 96)
                .padding(.bottom, 6)
            Text(contact.displayName.isEmpty ? "No name" : contact.displayName)
                .font(.title.weight(.bold))
                .foregroundStyle(Theme.foreground)
            if let nickname = contact.nickname, !nickname.isEmpty {
                Text("“\(nickname)”")
                    .foregroundStyle(Theme.mutedForeground)
            }
            if let role = contact.role {
                Text(role)
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedForeground)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private func actions(_ contact: ContactItem) -> some View {
        let phone = contact.phones.first?.value
        let email = contact.emails.first?.value
        return HStack(spacing: 10) {
            actionButton("Call", systemImage: "phone.fill", url: phone.flatMap(ContactText.callURL))
            actionButton("Message", systemImage: "message.fill", url: phone.flatMap(ContactText.messageURL))
            actionButton("Email", systemImage: "envelope.fill", url: email.flatMap(ContactText.emailURL))
        }
    }

    private func actionButton(_ title: String, systemImage: String, url: URL?) -> some View {
        Button {
            if let url { openURL(url) }
        } label: {
            VStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.system(size: 18, weight: .semibold))
                Text(title)
                    .font(.caption.weight(.medium))
            }
            .foregroundStyle(url == nil ? Theme.faintForeground : Theme.primary)
            .frame(maxWidth: .infinity)
            .frame(height: 64)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(url == nil)
    }

    // MARK: - The log

    /// When you were last in touch, and a line to log what happened today.
    private func logSection(_ contact: ContactItem) -> some View {
        section("Log") {
            Label(ContactText.lastSeen(contact.lastSeen), systemImage: "eye")
                .foregroundStyle(Theme.foreground)
                .cardRow()
            TextField("What happened?", text: $note, axis: .vertical)
                .lineLimit(1...4)
                .cardRow()
            Picker("Kind", selection: $kind) {
                ForEach(ContactInteractionKind.loggable, id: \.self) { kind in
                    Text(kind.label).tag(kind)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .cardRow()
            Button {
                log(contact)
            } label: {
                Label("Log", systemImage: "plus")
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.primary)
            .controlSize(.large)
            .disabled(isLogging || (kind == .note && note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
            .cardRow()
        }
    }

    private func log(_ contact: ContactItem) {
        let typed = note
        let picked = kind
        isLogging = true
        Task {
            if await store.log(contact, kind: picked, note: typed) {
                note = ""
                logged += 1
            }
            isLogging = false
        }
    }

    /// The log and the calendar events they were surely at, newest first.
    /// Logged entries swipe away; calendar ones come back with the event.
    private func historySection(_ contact: ContactItem) -> some View {
        let entries = store.interactions[contactID]
        return Section {
            if let entries {
                if entries.isEmpty {
                    Text("Nothing logged yet")
                        .foregroundStyle(Theme.mutedForeground)
                        .cardRow()
                }
                ForEach(entries, id: \.listKey) { entry in
                    InteractionRow(entry: entry)
                        .cardRow()
                        .swipeActions(edge: .trailing) {
                            if entry.id != nil {
                                Button(role: .destructive) {
                                    Task { await store.delete(entry, of: contact) }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                }
            } else if let historyError {
                Text(historyError)
                    .foregroundStyle(Theme.mutedForeground)
                    .cardRow()
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .cardRow()
            }
        } header: {
            SectionHeading(title: "History", count: entries.map(\.count))
        }
    }

    // MARK: - Tags

    private func tags(_ contact: ContactItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ChipRow(spacing: 6) {
                ForEach(contact.tags, id: \.self) { tag in
                    Button {
                        Task { await store.setTags(contact, contact.tags.filter { $0 != tag }) }
                    } label: {
                        Chip(text: tag, hue: PastelHue.forName(tag), systemImage: "xmark")
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove tag \(tag)")
                }
                if !addingTag, contact.tags.count < ContactTags.maxCount {
                    Button {
                        withAnimation(.snappy) { addingTag = true }
                    } label: {
                        Chip(text: contact.tags.isEmpty ? "Add a tag" : "Tag", hue: 235, systemImage: "plus", isSelected: false)
                    }
                    .buttonStyle(.plain)
                }
            }
            if addingTag {
                TextField("New tag", text: $newTag)
                    .focused($tagFieldFocused)
                    .submitLabel(.done)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 14)
                    .frame(height: 40)
                    .background(Theme.fill, in: Capsule())
                    .onAppear { tagFieldFocused = true }
                    .onSubmit { addTag(to: contact) }
                    .onChange(of: tagFieldFocused) { _, focused in
                        if !focused { addTag(to: contact) }
                    }
            }
        }
    }

    /// Adds what's typed, if it's new, and closes the field.
    private func addTag(to contact: ContactItem) {
        let typed = newTag
        newTag = ""
        withAnimation(.snappy) { addingTag = false }
        guard let current = store.contact(contact.id), let tags = ContactTags.adding(typed, to: current.tags) else { return }
        Task { await store.setTags(current, tags) }
    }

    // MARK: - Google's fields

    private func section(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        Section {
            content()
        } header: {
            SectionHeading(title: title)
        }
    }

    /// Numbers, emails, addresses or links: each opens where it should on a
    /// tap, and can be copied with a long press.
    private func methodRows(_ methods: [ContactMethod], systemImage: String, url: @escaping (String) -> URL?) -> some View {
        ForEach(Array(methods.enumerated()), id: \.offset) { _, method in
            Button {
                if let target = url(method.value) { openURL(target) }
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        if let label = ContactText.methodLabel(method.label) {
                            Text(label)
                                .font(.caption)
                                .foregroundStyle(Theme.mutedForeground)
                        }
                        Text(method.display)
                            .foregroundStyle(Theme.primary)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: systemImage)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.faintForeground)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .contextMenu {
                Button {
                    UIPasteboard.general.string = method.value
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }
            }
            .cardRow()
        }
    }

    /// A birthday or another date, with its label when there's more than one.
    private func dateRow(label: String?, text: String, systemImage: String) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                if let label {
                    Text(label)
                        .font(.caption)
                        .foregroundStyle(Theme.mutedForeground)
                }
                Text(text)
                    .foregroundStyle(Theme.foreground)
            }
            Spacer(minLength: 0)
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Theme.faintForeground)
        }
        .cardRow()
    }
}

/// One entry in a contact's history: what kind it was, the event or note, and when.
private struct InteractionRow: View {
    let entry: ContactInteraction

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: entry.kind.systemImage)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Theme.mutedForeground)
                .frame(width: 24)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.headline)
                    .foregroundStyle(Theme.foreground)
                if let detail = entry.detail {
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedForeground)
                }
                Text(ContactText.entryCaption(entry))
                    .font(.caption)
                    .foregroundStyle(Theme.faintForeground)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}

private extension View {
    /// A row on the page's cards, as in the contacts list.
    func cardRow() -> some View {
        listRowBackground(Theme.card)
            .listRowSeparatorTint(Theme.border)
    }
}
