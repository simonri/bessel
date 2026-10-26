import XCTest
@testable import Bessel

private let contactID = "3F2504E0-4F89-11D3-9A0C-0305E82C3301"
private let eventID = "9B2C1E70-1D2A-4C3B-8E4F-5A6B7C8D9E0F"
private let entryID = "0D1E2F30-4152-4637-8899-AABBCCDDEEFF"

private func contactJSON(
    id: String = contactID,
    name: String = "Anna Berg",
    organization: String? = nil,
    jobTitle: String? = nil,
    phones: [String] = [],
    emails: [String] = [],
    tags: [String] = [],
    lastSeen: String = "null"
) -> String {
    func quoted(_ value: String?) -> String { value.map { "\"\($0)\"" } ?? "null" }
    func methods(_ values: [String]) -> String { "[" + values.map { #"{"label":"mobile","value":"\#($0)","display":"shown \#($0)"}"# }.joined(separator: ",") + "]" }
    return """
    {"created_at":"2026-10-01T08:00:00Z","modified_at":null,"id":"\(id)","source_id":"\(contactID)",
     "display_name":"\(name)","given_name":null,"family_name":null,"nickname":null,"organization":\(quoted(organization)),
     "job_title":\(quoted(jobTitle)),"birthday":null,"photo_url":null,"notes":null,"external_url":null,
     "phones":\(methods(phones)),"emails":\(methods(emails)),"addresses":[],"urls":[],"dates":[],
     "tags":[\(tags.map { "\"\($0)\"" }.joined(separator: ","))],"last_seen":\(lastSeen)}
    """
}

private func contact(
    _ name: String = "Anna Berg",
    organization: String? = nil,
    jobTitle: String? = nil,
    phones: [String] = [],
    emails: [String] = [],
    tags: [String] = []
) throws -> ContactItem {
    let json = contactJSON(id: UUID().uuidString, name: name, organization: organization, jobTitle: jobTitle, phones: phones, emails: emails, tags: tags)
    return try JSONDecoder.api.decode(ContactItem.self, from: Data(json.utf8))
}

private func entryJSON(id: String? = entryID, on: String = "2026-10-26", kind: String = "met", source: String = "manual", note: String? = nil, eventTitle: String? = nil) -> String {
    func quoted(_ value: String?) -> String { value.map { "\"\($0)\"" } ?? "null" }
    return #"{"id":\#(quoted(id)),"occurred_on":"\#(on)","kind":"\#(kind)","source":"\#(source)","note":\#(quoted(note)),"event_title":\#(quoted(eventTitle))}"#
}

private func entry(id: String? = entryID, on: String = "2026-10-26", kind: String = "met", source: String = "manual", note: String? = nil, eventTitle: String? = nil) throws -> ContactInteraction {
    let json = entryJSON(id: id, on: on, kind: kind, source: source, note: note, eventTitle: eventTitle)
    return try JSONDecoder.api.decode(ContactInteraction.self, from: Data(json.utf8))
}

private func followUpJSON(kind: String, name: String = "Anna Berg", title: String = "Lunch") -> String {
    #"{"kind":"\#(kind)","contact":{"id":"\#(contactID)","display_name":"\#(name)","photo_url":null},"event":{"id":"\#(eventID)","title":"\#(title)","on":"2026-10-26"}}"#
}

private func followUp(kind: String, name: String = "Anna Berg", title: String = "Lunch") throws -> ContactFollowUp {
    try JSONDecoder.api.decode(ContactFollowUp.self, from: Data(followUpJSON(kind: kind, name: name, title: title).utf8))
}

private func day(_ string: String) -> Date {
    DateParsing.dateOnly.date(from: string)!
}

private let british = Locale(identifier: "en_GB")

final class ContactListTests: XCTestCase {
    func testInitialsTakeTheFirstAndLastNames() {
        XCTAssertEqual(ContactText.initials("Anna Berg"), "AB")
        XCTAssertEqual(ContactText.initials("anna maria berg"), "AB")
        XCTAssertEqual(ContactText.initials("Anna"), "A")
        XCTAssertEqual(ContactText.initials("+46 70"), "#")
        XCTAssertEqual(ContactText.initials(" "), "#")
    }

    func testSectionsAreSortedTheSwedishWayWithEachLetterOnce() throws {
        let names = ["Oscar", "örjan", "Olle", "Émile", "Erik", "42 Pizza", "Zara", "Åsa", "anna"]

        let sections = ContactSection.group(try names.map { try contact($0) })

        XCTAssertEqual(sections.map(\.letter), ["A", "E", "O", "Z", "Å", "Ö", "#"])
        XCTAssertEqual(sections.map { $0.contacts.map(\.displayName) }, [["anna"], ["Émile", "Erik"], ["Olle", "Oscar"], ["Zara"], ["Åsa"], ["örjan"], ["42 Pizza"]])
    }

    func testTheRowShowsTheCompanyOrElseTheFirstNumber() throws {
        XCTAssertEqual(try contact(organization: "Acme", phones: ["070"]).subtitle, "Acme")
        XCTAssertEqual(try contact(organization: "", phones: ["+4670123"]).subtitle, "shown +4670123")
        XCTAssertNil(try contact().subtitle)
    }

    func testTheRoleReadsTitleAtCompany() throws {
        XCTAssertEqual(try contact(organization: "Acme", jobTitle: "Designer").role, "Designer at Acme")
        XCTAssertEqual(try contact(jobTitle: "Designer").role, "Designer")
        XCTAssertEqual(try contact(organization: "Acme").role, "Acme")
        XCTAssertNil(try contact(organization: "", jobTitle: "").role)
    }

    func testSearchFindsNamesCompaniesEmailsTagsAndNumbersHoweverTheyAreWritten() throws {
        let anna = try contact("Anna Berg", organization: "Acme", phones: ["+46 (0)70-123 45 67"], emails: ["anna@example.com"], tags: ["Climbing"])

        for query in ["", "berg", "ACME", "example.com", "climb", "070 123", "0701234567", "4670"] {
            XCTAssertTrue(anna.matches(query), query)
        }
        for query in ["bob", "07", "0709", "running"] {
            XCTAssertFalse(anna.matches(query), query)
        }
    }
}

final class ContactLinkTests: XCTestCase {
    func testPhoneLinksKeepOnlyWhatIsDialled() {
        XCTAssertEqual(ContactText.callURL("+46 (0)70 123")?.absoluteString, "tel:+4670123")
        XCTAssertEqual(ContactText.callURL("+46 (0)70-123.45 67")?.absoluteString, "tel:+46701234567")
        XCTAssertEqual(ContactText.callURL("(08) 123 45")?.absoluteString, "tel:0812345")
        XCTAssertEqual(ContactText.messageURL("070-123 45")?.absoluteString, "sms:07012345")
        XCTAssertNil(ContactText.callURL("ext"))
    }

    func testEmailMapsAndWebLinks() {
        XCTAssertEqual(ContactText.emailURL(" anna@example.com ")?.absoluteString, "mailto:anna@example.com")
        XCTAssertEqual(ContactText.mapsURL("Storgatan 1\n111 22 Stockholm")?.absoluteString, "maps://?q=Storgatan%201,%20111%2022%20Stockholm")
        XCTAssertEqual(ContactText.linkURL("example.com")?.absoluteString, "https://example.com")
        XCTAssertEqual(ContactText.linkURL("http://a.se")?.absoluteString, "http://a.se")
    }

    func testGoogleLabelsAreCapitalised() {
        XCTAssertEqual(ContactText.methodLabel("mobile"), "Mobile")
        XCTAssertNil(ContactText.methodLabel(" "))
        XCTAssertNil(ContactText.methodLabel(nil))
    }
}

final class ContactWordingTests: XCTestCase {
    private let today = day("2026-10-26")

    func testAgoIsBucketedLikeACookedLabel() {
        let cases: [(String, String)] = [
            ("2026-10-26", "today"),
            ("2026-10-25", "yesterday"),
            ("2026-10-13", "13 days ago"),
            ("2026-10-12", "2 weeks ago"),
            ("2026-10-05", "3 weeks ago"),
            ("2026-08-01", "2 months ago"),
            ("2025-10-26", "over a year ago"),
        ]
        for (seen, expected) in cases {
            XCTAssertEqual(ContactText.ago(day(seen), today: today), expected, seen)
        }
    }

    func testLastSeenSaysHowYouWereInTouchAndWhatAbout() {
        func line(_ on: String, _ kind: ContactInteractionKind, _ summary: String?) -> String {
            ContactText.lastSeen(ContactSighting(on: day(on), kind: kind, summary: summary), today: today)
        }

        XCTAssertEqual(line("2026-10-05", .event, "Lunch"), "Seen 3 weeks ago - Lunch")
        XCTAssertEqual(line("2026-10-05", .met, "Fika"), "Seen 3 weeks ago - Fika")
        XCTAssertEqual(line("2026-10-25", .call, "Moving to Berlin"), "Called yesterday - Moving to Berlin")
        XCTAssertEqual(line("2026-10-26", .message, nil), "Messaged today")
        XCTAssertEqual(line("2026-10-26", .note, "Got the job"), "Noted today - Got the job")
        XCTAssertEqual(line("2026-10-26", .unknown, nil), "Seen today")
        XCTAssertEqual(line("2026-10-26", .met, "  "), "Seen today")
        XCTAssertEqual(ContactText.lastSeen(nil, today: today), "Not seen in the past year")
    }

    func testDatesOnTheListSayWhenTheyFall() {
        XCTAssertEqual(ContactText.dayLabel(today, today: today, locale: british), "Today")
        XCTAssertEqual(ContactText.dayLabel(day("2026-10-27"), today: today, locale: british), "Tomorrow")
        XCTAssertEqual(ContactText.dayLabel(day("2026-10-30"), today: today, locale: british), "Friday")
        XCTAssertNotEqual(ContactText.dayLabel(day("2026-11-02"), today: today, locale: british), "Monday", "a week off reads as a date")
        let later = ContactText.dayLabel(day("2026-11-07"), today: today, locale: british)
        XCTAssertTrue(later.hasPrefix("Sat") && later.contains("7") && later.hasSuffix("Nov"), later)
    }

    func testComingUpSaysTheAgeForBirthdaysAndTheYearsForOtherDates() {
        let anna = API.ContactReference(id: UUID(), displayName: "Anna Berg", photoUrl: nil)
        func line(_ label: String, _ on: String, _ years: Int?) -> String {
            ContactText.comingUp(ContactDateReminder(contact: anna, label: label, on: day(on), years: years), today: today, locale: british)
        }

        XCTAssertEqual(line("Birthday", "2026-10-30", 37), "Birthday, turns 37 - Friday")
        XCTAssertEqual(line("Anniversary", "2026-10-30", 12), "Anniversary, 12 years - Friday")
        XCTAssertEqual(line("Anniversary", "2026-10-26", 1), "Anniversary, 1 year - Today")
        XCTAssertEqual(line("Birthday", "2026-10-27", 1), "Birthday, turns 1 - Tomorrow")
        XCTAssertEqual(line("Birthday", "2026-10-30", nil), "Birthday - Friday")
    }

    func testABirthdaySaysTheDateHowSoonAndTheAgeTurned() {
        XCTAssertEqual(ContactText.birthday(ContactBirthday(month: 11, day: 7, year: 1990), today: today, locale: british), "7 November 1990, in 12 days, turns 36")
        XCTAssertEqual(ContactText.birthday(ContactBirthday(month: 10, day: 26, year: 1990), today: today, locale: british), "26 October 1990, today, turns 36")
        XCTAssertEqual(ContactText.birthday(ContactBirthday(month: 10, day: 27, year: nil), today: today, locale: british), "27 October, tomorrow")
        XCTAssertEqual(ContactText.birthday(ContactBirthday(month: 10, day: 25, year: 1990), today: today, locale: british), "25 October 1990, in 364 days, turns 37")
    }

    func testAnotherDateSaysHowManyYearsItWillHaveBeen() {
        XCTAssertEqual(ContactText.date(ContactDate(label: "Anniversary", month: 11, day: 25, year: 2014), today: today, locale: british), "25 November 2014, in 30 days, 12 years")
        XCTAssertEqual(ContactText.date(ContactDate(label: "Anniversary", month: 10, day: 27, year: 2025), today: today, locale: british), "27 October 2025, tomorrow, 1 year")
        XCTAssertEqual(ContactText.date(ContactDate(label: "Name day", month: 10, day: 26, year: nil), today: today, locale: british), "26 October, today")
    }

    func testALeapDayFallsOnThe28thInOtherYears() throws {
        XCTAssertEqual(DateParsing.dateOnly.string(from: try XCTUnwrap(ContactText.next(month: 2, day: 29, today: today))), "2027-02-28")
        XCTAssertEqual(DateParsing.dateOnly.string(from: try XCTUnwrap(ContactText.next(month: 2, day: 29, today: day("2027-03-01")))), "2028-02-29")
    }

    func testATimelineEntrySaysWhenAndWhetherItCameFromTheCalendar() throws {
        XCTAssertEqual(ContactText.entryDay(today, today: today, locale: british), "Today")
        XCTAssertEqual(ContactText.entryDay(day("2026-10-25"), today: today, locale: british), "Yesterday")
        let thisYear = ContactText.entryDay(day("2026-10-12"), today: today, locale: british)
        XCTAssertTrue(thisYear.hasPrefix("Mon") && thisYear.contains("12") && !thisYear.contains("2026"), thisYear)
        let lastYear = ContactText.entryDay(day("2025-12-01"), today: today, locale: british)
        XCTAssertTrue(lastYear.contains("2025") && lastYear.contains("Dec"), lastYear)

        XCTAssertEqual(ContactText.entryCaption(try entry(id: nil, on: "2026-10-25", kind: "event", source: "calendar", eventTitle: "Lunch"), today: today), "Yesterday - From calendar")
        XCTAssertEqual(ContactText.entryCaption(try entry(on: "2026-10-25", kind: "event", source: "manual", eventTitle: "Lunch"), today: today), "Yesterday")
    }

    func testATimelineEntryLeadsWithTheEventThenTheNote() throws {
        let event = try entry(kind: "event", note: "Talked about the move", eventTitle: "Lunch")
        XCTAssertEqual(event.headline, "Lunch")
        XCTAssertEqual(event.detail, "Talked about the move")

        let note = try entry(kind: "call", note: "Moving to Berlin")
        XCTAssertEqual(note.headline, "Moving to Berlin")
        XCTAssertNil(note.detail)

        XCTAssertEqual(try entry(kind: "call", note: " ").headline, "Call")
        XCTAssertNotEqual(try entry(id: nil, eventTitle: "Lunch").listKey, try entry(id: nil, eventTitle: "Fika").listKey)
    }

    func testAFollowUpAsksForANoteOrWhetherTheyWereThere() throws {
        XCTAssertEqual(try followUp(kind: "note").prompt, .note)
        XCTAssertEqual(try followUp(kind: "note").question, "Anything to note about Anna Berg?")
        XCTAssertEqual(try followUp(kind: "confirm").prompt, .confirm)
        XCTAssertEqual(try followUp(kind: "confirm", title: "Board games").question, "Was Anna Berg at Board games?")
        XCTAssertNil(try followUp(kind: "remind").prompt)
    }

    func testATagIsAddedOnceWhateverItsCase() {
        XCTAssertEqual(ContactTags.adding(" Climbing ", to: ["Work"]), ["Work", "Climbing"])
        XCTAssertNil(ContactTags.adding("work", to: ["Work"]))
        XCTAssertNil(ContactTags.adding("  ", to: []))
        XCTAssertEqual(ContactTags.adding(String(repeating: "a", count: 60), to: [])?.first?.count, 50)
        XCTAssertNil(ContactTags.adding("new", to: (1...20).map(String.init)))
    }

    func testRemindersSurviveTheCache() throws {
        let json = """
        {"dates":[{"contact":{"id":"\(contactID)","display_name":"Anna","photo_url":null},"label":"Birthday","on":"2026-11-07","years":36}]}
        """
        let reminders = try JSONDecoder.api.decode(ContactReminders.self, from: Data(json.utf8))
        let cache = ResponseCache(account: "alice", root: temporaryURL("cache"))

        cache.save(reminders, as: "reminders")
        let cached = try XCTUnwrap(cache.load(ContactReminders.self, key: "reminders"))

        XCTAssertEqual(cached, reminders)
        XCTAssertEqual(DateParsing.dateOnly.string(from: try XCTUnwrap(cached.dates.first).on), "2026-11-07")
    }
}

/// The JSON a request sent. URLSession hands a protocol the body as a stream.
private func sentJSON(_ request: URLRequest) -> [String: Any]? {
    var data = request.httpBody
    if data == nil, let stream = request.httpBodyStream {
        stream.open()
        defer { stream.close() }
        var buffer = [UInt8](repeating: 0, count: 4096)
        var read = Data()
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            read.append(buffer, count: count)
        }
        data = read
    }
    return data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
}

/// The changes a store sent: "PUT /v1/contacts/…/tags" and the JSON with it.
private final class SentChanges: @unchecked Sendable {
    var calls: [(route: String, body: [String: Any]?)] = []
    /// What reading the one contact again returns, when not the listing's copy.
    var fresh: String?
    /// Paths that answer 500, like "/v1/contacts/follow-ups".
    var failing: Set<String> = []
    /// What the list reads from now on, when not the listing it started with.
    var listing: String?

    var routes: [String] { calls.map(\.route) }

    func body(_ route: String) -> NSDictionary? {
        calls.last { $0.route == route }?.body as NSDictionary?
    }
}

@MainActor
final class ContactsStoreTests: XCTestCase {
    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
    }

    private let contactPath = "/v1/contacts/\(contactID)"
    private let sent = SentChanges()

    /// A store that's read the list once. `change` answers anything but a GET;
    /// nil falls back to an empty success.
    private func loadedStore(
        listing: String = contactJSON(tags: ["Work"]),
        followUps: [String] = [],
        reminders: String = #"{"dates":[]}"#,
        interactions: String = "[]",
        cache: ResponseCache = ResponseCache(account: "alice", root: temporaryURL("cache")),
        change: @escaping (URLRequest) -> (Int, String)? = { _ in nil }
    ) async -> ContactsStore {
        MockURLProtocol.responder = { [sent] request in
            let path = request.url?.path ?? ""
            let method = request.httpMethod ?? "GET"
            if method != "GET" {
                sent.calls.append(("\(method) \(path)", sentJSON(request)))
                let (status, body) = change(request) ?? (204, "")
                return (status, [:], Data(body.utf8))
            }
            if sent.failing.contains(path) { return (500, [:], Data(#"{"detail":"Down."}"#.utf8)) }
            if path.hasSuffix("/reminders") { return (200, [:], Data(reminders.utf8)) }
            if path.hasSuffix("/follow-ups") { return (200, [:], Data("[\(followUps.joined(separator: ","))]".utf8)) }
            if path.hasSuffix("/sources") { return (200, [:], Data("[]".utf8)) }
            if path.hasSuffix("/interactions") { return (200, [:], Data(interactions.utf8)) }
            if path == "/v1/contacts" {
                return (200, [:], Data(#"{"items":[\#(sent.listing ?? listing)],"pagination":{"total_count":1,"max_page":1}}"#.utf8))
            }
            return (200, [:], Data((sent.fresh ?? listing).utf8))
        }
        let store = ContactsStore(client: makeTestClient(), cache: cache)
        await store.load()
        return store
    }

    private func gets(_ path: String) -> Int {
        MockURLProtocol.requests.filter { $0.httpMethod == "GET" && $0.url?.path == path }.count
    }

    func testLoadingReadsEveryContactTheNextTwoWeeksAndTheFollowUps() async throws {
        let store = await loadedStore(followUps: [followUpJSON(kind: "note"), followUpJSON(kind: "remind")])

        XCTAssertEqual(store.contacts.map(\.displayName), ["Anna Berg"])
        XCTAssertEqual(store.sections.map(\.letter), ["A"])
        XCTAssertNotNil(store.reminders)
        let reminders = try XCTUnwrap(MockURLProtocol.requests.first { $0.url?.path == "/v1/contacts/reminders" })
        XCTAssertEqual(reminders.url?.query, "days=14")
        XCTAssertEqual(store.followUps.map(\.kind), ["note"], "a kind this build doesn't know isn't shown")
    }

    func testFollowUpsThatDontLoadLeaveTheListLoadingAndKeepWhatWasShown() async throws {
        let store = await loadedStore(followUps: [followUpJSON(kind: "note")])
        sent.failing = ["/v1/contacts/follow-ups"]
        sent.listing = contactJSON(name: "Anna Lind")

        await store.load()

        XCTAssertEqual(store.contacts.map(\.displayName), ["Anna Lind"])
        XCTAssertEqual(store.followUps.map(\.kind), ["note"])
        XCTAssertNotNil(store.reminders)
        XCTAssertNil(store.loadError)
    }

    func testRemindersAndFollowUpsThatDontLoadKeepTheCachedOnes() async throws {
        let cache = ResponseCache(account: "alice", root: temporaryURL("cache"))
        let birthday = #"{"dates":[{"contact":{"id":"\#(contactID)","display_name":"Anna","photo_url":null},"label":"Birthday","on":"2026-11-07","years":36}]}"#
        _ = await loadedStore(followUps: [followUpJSON(kind: "confirm")], reminders: birthday, cache: cache)
        sent.failing = ["/v1/contacts/follow-ups", "/v1/contacts/reminders"]
        sent.listing = contactJSON(name: "Anna Lind")

        let store = await loadedStore(cache: cache)

        XCTAssertEqual(store.contacts.map(\.displayName), ["Anna Lind"])
        XCTAssertEqual(store.followUps.map(\.kind), ["confirm"])
        XCTAssertEqual(store.reminders?.dates.map(\.label), ["Birthday"])
        XCTAssertNil(store.loadError)
    }

    func testContactsThatDontLoadStillSayWhy() async throws {
        let store = await loadedStore()
        sent.failing = ["/v1/contacts"]

        await store.load()

        XCTAssertEqual(store.contacts.map(\.displayName), ["Anna Berg"])
        XCTAssertNotNil(store.loadError)
    }

    func testContactsAreKeptInTheListsOrder() async {
        let listing = [contactJSON(id: UUID().uuidString, name: "Örjan"), contactJSON(id: UUID().uuidString, name: "anna")].joined(separator: ",")

        let store = await loadedStore(listing: listing)

        XCTAssertEqual(store.contacts.map(\.displayName), ["anna", "Örjan"])
        XCTAssertEqual(store.sections.map(\.letter), ["A", "Ö"])
    }

    // MARK: - Tags

    func testATagChangePutsTheTagsAndShowsWhatTheServerSaved() async throws {
        let store = await loadedStore { _ in (200, contactJSON(tags: ["Work", "Climbing"])) }

        await store.setTags(try XCTUnwrap(store.contacts.first), ["Work", "climbing"])

        XCTAssertEqual(sent.routes, ["PUT \(contactPath)/tags"])
        XCTAssertEqual(sent.body("PUT \(contactPath)/tags"), ["tags": ["Work", "climbing"]])
        XCTAssertEqual(store.contacts.first?.tags, ["Work", "Climbing"])
        XCTAssertNil(store.errorMessage)
    }

    func testATagChangeTheServerTurnsDownIsPutBack() async throws {
        let store = await loadedStore { _ in (422, #"{"detail":"Too many tags."}"#) }

        await store.setTags(try XCTUnwrap(store.contacts.first), ["Work", "Climbing"])

        XCTAssertEqual(store.contacts.first?.tags, ["Work"])
        XCTAssertEqual(store.sections.first?.contacts.first?.tags, ["Work"])
        XCTAssertEqual(store.errorMessage, "Too many tags.")
    }

    // MARK: - The log

    func testTheLogIsReadPerContact() async throws {
        let store = await loadedStore(interactions: "[\(entryJSON(note: "Fika")),\(entryJSON(id: nil, kind: "event", source: "calendar", eventTitle: "Lunch"))]")
        let id = try XCTUnwrap(UUID(uuidString: contactID))

        let error = await store.loadInteractions(id)

        XCTAssertNil(error)
        XCTAssertEqual(gets("\(contactPath)/interactions"), 1)
        XCTAssertEqual(store.interactions[id]?.map(\.headline), ["Fika", "Lunch"])
    }

    func testLoggingPostsTheKindAndTrimmedNoteAndShowsTheEntryFirst() async throws {
        let seen = #"{"on":"2026-10-26","kind":"call","summary":"Moving to Berlin"}"#
        let store = await loadedStore(interactions: "[\(entryJSON(id: UUID().uuidString, on: "2026-10-01", note: "Fika"))]") { _ in
            (201, entryJSON(kind: "call", note: "Moving to Berlin"))
        }
        let id = try XCTUnwrap(UUID(uuidString: contactID))
        await store.loadInteractions(id)
        sent.fresh = contactJSON(lastSeen: seen)

        let logged = await store.log(try XCTUnwrap(store.contacts.first), kind: .call, note: "  Moving to Berlin \n")

        XCTAssertTrue(logged)
        XCTAssertEqual(sent.routes, ["POST \(contactPath)/interactions"])
        XCTAssertEqual(sent.body("POST \(contactPath)/interactions"), ["kind": "call", "note": "Moving to Berlin"])
        XCTAssertEqual(store.interactions[id]?.map(\.headline), ["Moving to Berlin", "Fika"])
        XCTAssertEqual(store.contacts.first?.lastSeen?.kind, .call, "the contact is read again for its last-seen line")
    }

    func testLoggingWithoutANoteSendsJustTheKind() async throws {
        let store = await loadedStore { _ in (201, entryJSON()) }

        await store.log(try XCTUnwrap(store.contacts.first), kind: .met, note: "  ")

        XCTAssertEqual(sent.body("POST \(contactPath)/interactions"), ["kind": "met"])
    }

    func testLoggingBeforeTheLogIsReadReadsAllOfIt() async throws {
        let store = await loadedStore(interactions: "[\(entryJSON()),\(entryJSON(id: UUID().uuidString, on: "2026-10-01", note: "Fika"))]") { _ in (201, entryJSON()) }

        await store.log(try XCTUnwrap(store.contacts.first), kind: .met, note: "")

        XCTAssertEqual(store.interactions[try XCTUnwrap(UUID(uuidString: contactID))]?.count, 2)
    }

    func testALogTheServerTurnsDownSaysWhyAndShowsNothing() async throws {
        let store = await loadedStore { _ in (422, #"{"detail":"That day hasn't happened yet."}"#) }
        let id = try XCTUnwrap(UUID(uuidString: contactID))
        await store.loadInteractions(id)

        let logged = await store.log(try XCTUnwrap(store.contacts.first), kind: .met, note: "Fika")

        XCTAssertFalse(logged)
        XCTAssertEqual(store.errorMessage, "That day hasn't happened yet.")
        XCTAssertEqual(store.interactions[id]?.count, 0)
    }

    func testDeletingAnEntryRemovesIt() async throws {
        let store = await loadedStore(interactions: "[\(entryJSON(note: "Fika"))]")
        let id = try XCTUnwrap(UUID(uuidString: contactID))
        await store.loadInteractions(id)

        await store.delete(try XCTUnwrap(store.interactions[id]?.first), of: try XCTUnwrap(store.contacts.first))

        XCTAssertEqual(sent.routes, ["DELETE \(contactPath)/interactions/\(entryID)"])
        XCTAssertEqual(store.interactions[id]?.count, 0)
        XCTAssertNil(store.errorMessage)
    }

    func testADeleteTheServerTurnsDownIsPutBack() async throws {
        let store = await loadedStore(interactions: "[\(entryJSON(note: "Fika"))]") { _ in (404, #"{"detail":"Entry not found."}"#) }
        let id = try XCTUnwrap(UUID(uuidString: contactID))
        await store.loadInteractions(id)

        await store.delete(try XCTUnwrap(store.interactions[id]?.first), of: try XCTUnwrap(store.contacts.first))

        XCTAssertEqual(store.interactions[id]?.map(\.headline), ["Fika"])
        XCTAssertEqual(store.errorMessage, "Entry not found.")
    }

    func testACalendarEntryCantBeDeleted() async throws {
        let store = await loadedStore(interactions: "[\(entryJSON(id: nil, kind: "event", source: "calendar", eventTitle: "Lunch"))]")
        let id = try XCTUnwrap(UUID(uuidString: contactID))
        await store.loadInteractions(id)

        await store.delete(try XCTUnwrap(store.interactions[id]?.first), of: try XCTUnwrap(store.contacts.first))

        XCTAssertEqual(sent.routes, [])
        XCTAssertEqual(store.interactions[id]?.count, 1)
    }

    // MARK: - Following up

    func testANoteLogsTheEventWithItAndClearsThePrompt() async throws {
        let store = await loadedStore(followUps: [followUpJSON(kind: "note")]) { _ in (201, entryJSON(kind: "event", eventTitle: "Lunch")) }
        let prompt = try XCTUnwrap(store.followUps.first)
        let contactGets = gets(contactPath)

        await store.confirm(prompt, note: " Talked about the move ")

        XCTAssertEqual(sent.routes, ["POST \(contactPath)/interactions"])
        let body = try XCTUnwrap(sent.body("POST \(contactPath)/interactions"))
        XCTAssertEqual(body["calendar_event_id"] as? String, eventID)
        XCTAssertEqual(body["note"] as? String, "Talked about the move")
        XCTAssertNil(body["occurred_on"], "the server takes the day from the event")
        XCTAssertTrue(store.followUps.isEmpty)
        XCTAssertEqual(gets(contactPath), contactGets + 1, "the contact is read again for its last-seen line")
    }

    func testSkippingANoteStillLogsTheEvent() async throws {
        let store = await loadedStore(followUps: [followUpJSON(kind: "note")]) { _ in (201, entryJSON(kind: "event", eventTitle: "Lunch")) }

        await store.confirm(try XCTUnwrap(store.followUps.first))

        let body = try XCTUnwrap(sent.body("POST \(contactPath)/interactions"))
        XCTAssertEqual(body["calendar_event_id"] as? String, eventID)
        XCTAssertNil(body["note"])
        XCTAssertTrue(store.followUps.isEmpty)
    }

    func testABlankNoteIsLeftOut() async throws {
        let store = await loadedStore(followUps: [followUpJSON(kind: "note")]) { _ in (201, entryJSON(kind: "event", eventTitle: "Lunch")) }

        await store.confirm(try XCTUnwrap(store.followUps.first), note: " \n ")

        XCTAssertNil(try XCTUnwrap(sent.body("POST \(contactPath)/interactions"))["note"])
    }

    func testSayingTheyWereThereLogsTheEvent() async throws {
        let store = await loadedStore(followUps: [followUpJSON(kind: "confirm")]) { _ in (201, entryJSON(kind: "event", eventTitle: "Lunch")) }

        await store.confirm(try XCTUnwrap(store.followUps.first))

        XCTAssertEqual(sent.routes, ["POST \(contactPath)/interactions"])
        XCTAssertEqual(sent.body("POST \(contactPath)/interactions")?["calendar_event_id"] as? String, eventID)
        XCTAssertTrue(store.followUps.isEmpty)
    }

    func testSayingTheyWerentThereDismissesTheEvent() async throws {
        let store = await loadedStore(followUps: [followUpJSON(kind: "confirm")])

        await store.dismiss(try XCTUnwrap(store.followUps.first))

        XCTAssertEqual(sent.routes, ["POST \(contactPath)/dismissals"])
        XCTAssertEqual(sent.body("POST \(contactPath)/dismissals"), ["calendar_event_id": eventID])
        XCTAssertTrue(store.followUps.isEmpty)
        XCTAssertNil(store.errorMessage)
    }

    func testAnAnswerThatDoesntGoThroughBringsThePromptBack() async throws {
        let store = await loadedStore(followUps: [followUpJSON(kind: "confirm")]) { _ in (404, #"{"detail":"Event not found."}"#) }

        await store.dismiss(try XCTUnwrap(store.followUps.first))

        XCTAssertEqual(store.followUps.map(\.kind), ["confirm"])
        XCTAssertEqual(store.errorMessage, "Event not found.")
    }

    func testAnAnswerReadsAnOpenLogAgain() async throws {
        let store = await loadedStore(followUps: [followUpJSON(kind: "confirm")]) { _ in (201, entryJSON(kind: "event", eventTitle: "Lunch")) }
        let id = try XCTUnwrap(UUID(uuidString: contactID))
        await store.loadInteractions(id)

        await store.confirm(try XCTUnwrap(store.followUps.first))

        XCTAssertEqual(gets("\(contactPath)/interactions"), 2)
    }

    func testPullToRefreshAsksForASyncAndThenReadsTheList() async throws {
        let store = await loadedStore { _ in (202, "null") }
        store.syncWait = .zero
        MockURLProtocol.requests = []

        await store.refresh()

        let methods = MockURLProtocol.requests.map { "\($0.httpMethod ?? "") \($0.url?.path ?? "")" }
        XCTAssertEqual(methods.first, "POST /v1/contacts/sync")
        XCTAssertTrue(methods.dropFirst().contains("GET /v1/contacts"), "\(methods)")
        XCTAssertNil(store.loadError)
    }
}
