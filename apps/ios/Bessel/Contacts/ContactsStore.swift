import Foundation
import Observation
import os
import SwiftUI

/// The Google address book as Bessel mirrors it, with Bessel's own layer on
/// top: tags, a log of when you were in touch, dates coming up and events to
/// follow up on.
@MainActor
@Observable
final class ContactsStore {
    private(set) var contacts: [ContactItem] = []
    private(set) var sections: [ContactSection] = []
    private(set) var reminders: ContactReminders?
    /// Events that just ended with people who were, or might have been, there.
    private(set) var followUps: [ContactFollowUp] = []
    private(set) var sources: [ContactSource] = []
    /// Each contact's log, newest first, once their page has asked for it.
    private(set) var interactions: [UUID: [ContactInteraction]] = [:]
    private(set) var hasLoaded = false
    /// A change that didn't go through; shown as an alert.
    var errorMessage: String?
    /// A refresh that didn't go through; shown quietly over what's already there.
    var loadError: String?

    private static let log = Logger(subsystem: "app.bessel", category: "contacts")
    private let client: APIClient
    private let cache: ResponseCache
    @ObservationIgnored private var loads = LoadGeneration()
    @ObservationIgnored private let changes = SerialQueues<UUID>()
    private static let cacheKey = "contacts.v2"
    private static let remindersCacheKey = "contacts.reminders.v2"
    private static let followUpsCacheKey = "contacts.follow-ups.v1"
    private static let sourcesCacheKey = "contacts.sources.v1"
    /// How far ahead Coming up looks, today included.
    static let comingUpDays = 14
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
            followUps = cache.load([ContactFollowUp].self, key: Self.followUpsCacheKey) ?? []
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
            async let accounts: [ContactSource] = client.get("/v1/contacts/sources")
            async let upcoming = extra("reminders") { [self] in try await fetchReminders() }
            async let events = extra("follow-ups") { [client] () -> [ContactFollowUp] in try await client.get("/v1/contacts/follow-ups") }
            let (loaded, loadedSources) = try await (items, accounts)
            let (loadedReminders, loadedFollowUps) = await (upcoming, events)
            guard loads.isCurrent(ticket) else { return }
            setContacts(loaded)
            sources = loadedSources
            loadError = nil
            loads.finish(ticket)
            cache.save(loaded, as: Self.cacheKey)
            cache.save(loadedSources, as: Self.sourcesCacheKey)
            if let loadedReminders {
                reminders = loadedReminders
                cache.save(loadedReminders, as: Self.remindersCacheKey)
            }
            if let loadedFollowUps {
                followUps = loadedFollowUps.filter { $0.prompt != nil }
                cache.save(followUps, as: Self.followUpsCacheKey)
            }
        } catch {
            guard loads.isCurrent(ticket), !error.isCancellation else { return }
            loadError = error.userMessage
        }
    }

    /// A part of the list that can fail on its own: what was shown before
    /// stays, and the failure is only logged.
    private func extra<T>(_ name: String, _ fetch: () async throws -> T) async -> T? {
        do {
            return try await fetch()
        } catch {
            if !error.isCancellation {
                Self.log.error("Contact \(name, privacy: .public) didn't load: \(error.userMessage, privacy: .public)")
            }
            return nil
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

    /// Reads one contact again, for when they were last seen.
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

    func setTags(_ contact: ContactItem, _ tags: [String]) async {
        loads.invalidate()
        var shown = contact
        shown.tags = tags
        replace(shown)
        do {
            let updated: ContactItem = try await changes.run(contact.id) { [client] in
                try await client.put("/v1/contacts/\(contact.id)/tags", body: API.ContactTagsUpdate(tags: tags))
            }
            replace(updated)
        } catch {
            replace(contact)
            errorMessage = error.userMessage
        }
    }

    // MARK: - The log

    /// The contact's log and the calendar events they were surely at. A log
    /// that can't be read leaves what's shown and says why.
    @discardableResult
    func loadInteractions(_ contactID: UUID) async -> String? {
        do {
            let entries: [ContactInteraction] = try await client.get("/v1/contacts/\(contactID)/interactions")
            interactions[contactID] = entries
            return nil
        } catch {
            return error.isCancellation ? nil : error.userMessage
        }
    }

    /// Logs something that happened today, shows it at the top of the log
    /// and reads the contact again for their new last-seen line.
    @discardableResult
    func log(_ contact: ContactItem, kind: ContactInteractionKind, note: String) async -> Bool {
        let note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let entry = API.ContactInteractionCreate(kind: kind, note: note.isEmpty ? nil : note)
        do {
            let logged: ContactInteraction = try await client.post("/v1/contacts/\(contact.id)/interactions", body: entry)
            if interactions[contact.id] != nil {
                withAnimation(.snappy) { interactions[contact.id]?.insert(logged, at: 0) }
            } else {
                await loadInteractions(contact.id)
            }
            await reload(contact.id)
            return true
        } catch {
            errorMessage = error.userMessage
            return false
        }
    }

    /// Removes an entry straight away, putting it back if the server says no.
    /// Calendar entries have no id and can't be removed.
    func delete(_ entry: ContactInteraction, of contact: ContactItem) async {
        guard let entryID = entry.id, let previous = interactions[contact.id] else { return }
        withAnimation(.snappy) { interactions[contact.id] = previous.filter { $0.id != entryID } }
        do {
            try await client.deleteNoContent("/v1/contacts/\(contact.id)/interactions/\(entryID)")
            await reload(contact.id)
        } catch {
            withAnimation(.snappy) { interactions[contact.id] = previous }
            errorMessage = error.userMessage
        }
    }

    // MARK: - Following up

    /// They were there: logs the event, with a note when one's given. Skipping
    /// a note logs it too, which is what clears the prompt.
    func confirm(_ followUp: ContactFollowUp, note: String? = nil) async {
        let note = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let entry = API.ContactInteractionCreate(note: note?.isEmpty == false ? note : nil, calendarEventId: followUp.event.id)
        await settle(followUp) { [client] in
            let _: ContactInteraction = try await client.post("/v1/contacts/\(followUp.contact.id)/interactions", body: entry)
        }
    }

    /// They weren't there, so the event isn't suggested for them again.
    func dismiss(_ followUp: ContactFollowUp) async {
        await settle(followUp) { [client] in
            let body = try JSONEncoder.api.encode(API.ContactEventDismiss(calendarEventId: followUp.event.id))
            try await client.postNoContent("/v1/contacts/\(followUp.contact.id)/dismissals", json: body)
        }
    }

    /// Takes the follow-up off the list while `answer` goes through, putting it
    /// back if it doesn't. The contact's log and last-seen line are read again
    /// after, since the answer can change both.
    private func settle(_ followUp: ContactFollowUp, _ answer: () async throws -> Void) async {
        loads.invalidate()
        let previous = followUps
        withAnimation(.snappy) { followUps.removeAll { $0.id == followUp.id } }
        do {
            try await answer()
            cache.save(followUps, as: Self.followUpsCacheKey)
        } catch {
            withAnimation(.snappy) { followUps = previous }
            errorMessage = error.userMessage
            return
        }
        let contactID = followUp.contact.id
        if interactions[contactID] != nil { await loadInteractions(contactID) }
        await reload(contactID)
    }

    private func fetchReminders() async throws -> ContactReminders {
        try await client.get("/v1/contacts/reminders", query: [URLQueryItem(name: "days", value: String(Self.comingUpDays))])
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
