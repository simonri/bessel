import Foundation
import Observation
import SwiftUI

/// The Google address book as Bessel mirrors it, with Bessel's own layer on
/// top: tags, who to keep in touch with, upcoming birthdays.
@MainActor
@Observable
final class ContactsStore {
    private(set) var contacts: [ContactItem] = []
    private(set) var sections: [ContactSection] = []
    private(set) var reminders: ContactReminders?
    private(set) var sources: [ContactSource] = []
    private(set) var hasLoaded = false
    /// A change that didn't go through; shown as an alert.
    var errorMessage: String?
    /// A refresh that didn't go through; shown quietly over what's already there.
    var loadError: String?

    private let client: APIClient
    private let cache: ResponseCache
    @ObservationIgnored private var loads = LoadGeneration()
    @ObservationIgnored private let changes = SerialQueues<UUID>()
    private static let cacheKey = "contacts.v1"
    private static let remindersCacheKey = "contacts.reminders.v1"
    private static let sourcesCacheKey = "contacts.sources.v1"
    /// How far ahead the Birthdays section looks, today included.
    static let birthdayDays = 14
    /// About how long the server takes to pull a small address book from Google.
    @ObservationIgnored var syncWait: Duration = .seconds(3)

    convenience init(services: AppServices) {
        self.init(client: services.client, cache: services.cache)
    }

    init(client: APIClient, cache: ResponseCache) {
        self.client = client
        self.cache = cache
        if let saved = cache.load([ContactItem].self, key: Self.cacheKey) {
            setContacts(saved)
            reminders = cache.load(ContactReminders.self, key: Self.remindersCacheKey)
            sources = cache.load([ContactSource].self, key: Self.sourcesCacheKey) ?? []
            hasLoaded = true
        }
    }

    func contact(_ id: UUID) -> ContactItem? {
        contacts.first { $0.id == id }
    }

    /// When the address book last came over from Google, or nil before it ever has.
    var syncedAt: Date? {
        sources.compactMap(\.syncedAt).max()
    }

    var syncError: String? {
        sources.lazy.compactMap(\.syncError).first
    }

    func loadIfStale() async {
        guard loads.isStale(maxAge: AppServices.freshFor) else { return }
        await load()
    }

    func load() async {
        let ticket = loads.begin()
        defer { hasLoaded = true }
        do {
            async let items: [ContactItem] = client.getAllPages("/v1/contacts")
            async let upcoming = fetchReminders()
            async let accounts: [ContactSource] = client.get("/v1/contacts/sources")
            let (loaded, loadedReminders, loadedSources) = try await (items, upcoming, accounts)
            guard loads.isCurrent(ticket) else { return }
            setContacts(loaded)
            reminders = loadedReminders
            sources = loadedSources
            loadError = nil
            loads.finish(ticket)
            cache.save(loaded, as: Self.cacheKey)
            cache.save(loadedReminders, as: Self.remindersCacheKey)
            cache.save(loadedSources, as: Self.sourcesCacheKey)
        } catch {
            guard loads.isCurrent(ticket), !error.isCancellation else { return }
            loadError = error.userMessage
        }
    }

    /// Pull to refresh: asks the server to fetch from Google now, then reads
    /// the result once it's had a moment. A sync that couldn't be asked for
    /// still refreshes what the server already has.
    func refresh() async {
        var syncError: Error?
        do {
            try await client.postNoContent("/v1/contacts/sync", json: Data("{}".utf8))
            try await Task.sleep(for: syncWait)
        } catch {
            guard !error.isCancellation else { return }
            syncError = error
        }
        await load()
        if let syncError, loadError == nil {
            loadError = syncError.userMessage
        }
    }

    /// Reads one contact again, for its latest last-seen and catch-up dates.
    func reload(_ id: UUID) async {
        do {
            let fresh: ContactItem = try await client.get("/v1/contacts/\(id)")
            replace(fresh)
        } catch let error as APIError where error.statusCode == 404 {
            setContacts(contacts.filter { $0.id != id })
        } catch {
            // What's on screen stays; the list's own refresh reports trouble.
        }
    }

    // MARK: - Keeping in touch

    /// Marks today as the last catch-up, with Undo putting back the day it replaced.
    func markCaughtUp(_ contact: ContactItem, toasts: ToastCenter) async {
        let previous = contact.caughtUpOn
        guard await updateKeepUp(contact, ContactKeepUpUpdate(caughtUpOn: .some(Date.now))) else { return }
        toasts.show("Marked as caught up today") { [weak self] in
            guard let self, let current = self.contact(contact.id) else { return }
            Task { await self.updateKeepUp(current, ContactKeepUpUpdate(caughtUpOn: .some(previous))) }
        }
    }

    /// Every `days` days, or off with nil. Shown straight away and put back if the server says no.
    func setKeepInTouch(_ contact: ContactItem, days: Int?) async {
        await updateKeepUp(contact, ContactKeepUpUpdate(keepInTouchDays: .some(days))) { $0.keepInTouchDays = days }
    }

    func setTags(_ contact: ContactItem, _ tags: [String]) async {
        await updateKeepUp(contact, ContactKeepUpUpdate(tags: .some(tags))) { $0.tags = tags }
    }

    /// Sends Bessel's own fields, showing `optimistic` until the server answers.
    /// The reminders are read again after, since the change can move someone
    /// in or out of Catch up.
    @discardableResult
    private func updateKeepUp(_ contact: ContactItem, _ update: ContactKeepUpUpdate, optimistic: ((inout ContactItem) -> Void)? = nil) async -> Bool {
        loads.invalidate()
        if let optimistic {
            var shown = contact
            optimistic(&shown)
            replace(shown)
        }
        do {
            let updated: ContactItem = try await changes.run(contact.id) { [client] in
                try await client.patch("/v1/contacts/\(contact.id)/keep-up", body: update)
            }
            replace(updated)
            await reloadReminders()
            return true
        } catch {
            if optimistic != nil { replace(contact) }
            errorMessage = error.userMessage
            return false
        }
    }

    private func reloadReminders() async {
        guard let fresh = try? await fetchReminders() else { return }
        withAnimation(.snappy) { reminders = fresh }
        cache.save(fresh, as: Self.remindersCacheKey)
    }

    private func fetchReminders() async throws -> ContactReminders {
        try await client.get("/v1/contacts/reminders", query: [URLQueryItem(name: "days", value: String(Self.birthdayDays))])
    }

    private func replace(_ contact: ContactItem) {
        var updated = contacts
        if let index = updated.firstIndex(where: { $0.id == contact.id }) {
            updated[index] = contact
        } else {
            updated.append(contact)
        }
        withAnimation(.snappy) { setContacts(updated) }
        cache.save(contacts, as: Self.cacheKey)
    }

    private func setContacts(_ items: [ContactItem]) {
        sections = ContactSection.group(items)
        contacts = sections.flatMap(\.contacts)
    }
}
