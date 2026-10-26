import SwiftUI
import UIKit

/// One person: call, message or email them in a tap, everything Google has on
/// them, and Bessel's own notes on keeping in touch. Google's fields are
/// edited in the Contacts app, which syncs them back.
struct ContactDetailView: View {
    let store: ContactsStore
    let contactID: UUID

    @Environment(\.openURL) private var openURL
    @Environment(ToastCenter.self) private var toasts
    @State private var addingTag = false
    @State private var newTag = ""
    @FocusState private var tagFieldFocused: Bool

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
        .task { await store.reload(contactID) }
    }

    private func content(_ contact: ContactItem) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header(contact)
                actions(contact)
                keepingInTouch(contact)
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
                if let birthday = contact.birthday {
                    section("Birthday") {
                        Label(ContactText.birthday(birthday), systemImage: "gift")
                            .foregroundStyle(Theme.foreground)
                            .card()
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
                            .card()
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.immediately)
        .contentMargins(.bottom, 80, for: .scrollContent)
        .refreshable { await store.reload(contactID) }
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

    // MARK: - Keeping in touch

    /// Bessel's own layer, which never reaches Google.
    private func keepingInTouch(_ contact: ContactItem) -> some View {
        let caughtUpToday = contact.wasCaughtUp(on: .now)
        return section("Keeping in touch") {
            VStack(alignment: .leading, spacing: 14) {
                Label(ContactText.lastSeen(contact.lastSeen), systemImage: "eye")
                    .foregroundStyle(Theme.foreground)
                Button {
                    Task { await store.markCaughtUp(contact, toasts: toasts) }
                } label: {
                    Label("Caught up today", systemImage: caughtUpToday ? "checkmark" : "hand.wave")
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.primary)
                .controlSize(.large)
                .disabled(caughtUpToday)
                Divider()
                HStack {
                    Label("Keep in touch", systemImage: "arrow.triangle.2.circlepath")
                        .foregroundStyle(Theme.foreground)
                    Spacer()
                    keepInTouchPicker(contact)
                }
                if contact.keepInTouchDays != nil, let due = contact.catchUpOn {
                    Text(ContactText.nextCatchUp(due))
                        .font(.subheadline)
                        .foregroundStyle(ContactText.daysBetween(.now, and: due) < 1 ? Theme.primary : Theme.mutedForeground)
                }
                Divider()
                tags(contact)
            }
            .card()
        }
        .haptic(.success, trigger: caughtUpToday) { _, isCaughtUp in isCaughtUp }
    }

    private func keepInTouchPicker(_ contact: ContactItem) -> some View {
        Picker("Keep in touch", selection: Binding(
            get: { contact.keepInTouchDays },
            set: { days in Task { await store.setKeepInTouch(contact, days: days) } }
        )) {
            Text(KeepInTouch.label(nil)).tag(Int?.none)
            ForEach(KeepInTouch.presets, id: \.days) { preset in
                Text(preset.label).tag(Int?.some(preset.days))
            }
            // A cadence set on the desktop that isn't one of these.
            if let days = contact.keepInTouchDays, !KeepInTouch.isPreset(days) {
                Text(KeepInTouch.label(days)).tag(Int?.some(days))
            }
        }
        .pickerStyle(.menu)
        .labelsHidden()
        .tint(Theme.mutedForeground)
    }

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
        VStack(alignment: .leading, spacing: 8) {
            SectionHeading(title: title)
                .padding(.horizontal, 4)
            content()
        }
    }

    /// Numbers, emails, addresses or links: each opens where it should on a
    /// tap, and can be copied with a long press.
    private func methodRows(_ methods: [ContactMethod], systemImage: String, url: @escaping (String) -> URL?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(methods.enumerated()), id: \.offset) { index, method in
                if index > 0 { Divider() }
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
                            Text(method.value)
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
            }
        }
        .card()
    }
}
