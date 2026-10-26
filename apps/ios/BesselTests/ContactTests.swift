import XCTest
@testable import Bessel

private let contactID = "3F2504E0-4F89-11D3-9A0C-0305E82C3301"

private func contactJSON(
    id: String = contactID,
    name: String = "Anna Berg",
    organization: String? = nil,
    jobTitle: String? = nil,
    phones: [String] = [],
    emails: [String] = [],
    tags: [String] = [],
    keepInTouchDays: Int? = nil,
    caughtUpOn: String? = nil
) -> String {
    func quoted(_ value: String?) -> String { value.map { "\"\($0)\"" } ?? "null" }
    func methods(_ values: [String]) -> String { "[" + values.map { #"{"label":"mobile","value":"\#($0)"}"# }.joined(separator: ",") + "]" }
    return """
    {"created_at":"2026-10-01T08:00:00Z","modified_at":null,"id":"\(id)","source_id":"\(contactID)",
     "display_name":"\(name)","given_name":null,"family_name":null,"nickname":null,"organization":\(quoted(organization)),
     "job_title":\(quoted(jobTitle)),"birthday":null,"photo_url":null,"notes":null,"external_url":null,
     "phones":\(methods(phones)),"emails":\(methods(emails)),"addresses":[],"urls":[],
     "tags":[\(tags.map { "\"\($0)\"" }.joined(separator: ","))],"keep_in_touch_days":\(keepInTouchDays.map(String.init) ?? "null"),
     "caught_up_on":\(quoted(caughtUpOn)),"last_seen":null,"catch_up_on":null}
    """
}

private func contact(
    _ name: String = "Anna Berg",
    organization: String? = nil,
    jobTitle: String? = nil,
    phones: [String] = [],
    emails: [String] = [],
    tags: [String] = [],
    caughtUpOn: String? = nil
) throws -> ContactItem {
    let json = contactJSON(id: UUID().uuidString, name: name, organization: organization, jobTitle: jobTitle, phones: phones, emails: emails, tags: tags, caughtUpOn: caughtUpOn)
    return try JSONDecoder.api.decode(ContactItem.self, from: Data(json.utf8))
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
        XCTAssertEqual(try contact(organization: "", phones: ["+46 70 123"]).subtitle, "+46 70 123")
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

    func testLastSeenSaysHowLongAgoAndWhere() {
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
        XCTAssertEqual(ContactText.lastSeen(ContactSighting(on: day("2026-10-05"), eventTitle: "Lunch with Anna"), today: today), "Last seen 3 weeks ago - Lunch with Anna")
        XCTAssertEqual(ContactText.lastSeen(ContactSighting(on: today, eventTitle: nil), today: today), "Last seen today")
        XCTAssertEqual(ContactText.lastSeen(nil, today: today), "Not seen in the past year")
        XCTAssertEqual(ContactText.lastSeenShort(ContactSighting(on: day("2026-10-05"), eventTitle: "Lunch"), today: today), "Last seen 3 weeks ago")
        XCTAssertEqual(ContactText.lastSeenShort(nil, today: today), "Never seen")
    }

    func testTheNextCatchUpCountsDownAndThenSaysItIsTime() {
        XCTAssertEqual(ContactText.nextCatchUp(day("2026-11-04"), today: today), "Next catch-up in 9 days")
        XCTAssertEqual(ContactText.nextCatchUp(day("2026-10-27"), today: today), "Next catch-up tomorrow")
        XCTAssertEqual(ContactText.nextCatchUp(day("2026-11-08"), today: today), "Next catch-up in 13 days")
        XCTAssertEqual(ContactText.nextCatchUp(day("2026-11-09"), today: today), "Next catch-up in 2 weeks")
        XCTAssertEqual(ContactText.nextCatchUp(day("2026-11-16"), today: today), "Next catch-up in 3 weeks")
        XCTAssertEqual(ContactText.nextCatchUp(day("2027-01-26"), today: today), "Next catch-up in 3 months")
        XCTAssertEqual(ContactText.nextCatchUp(today, today: today), "Time to catch up")
        XCTAssertEqual(ContactText.nextCatchUp(day("2026-09-01"), today: today), "Time to catch up")
    }

    func testBirthdaysOnTheListSayWhenTheyFall() {
        XCTAssertEqual(ContactText.dayLabel(today, today: today, locale: british), "Today")
        XCTAssertEqual(ContactText.dayLabel(day("2026-10-27"), today: today, locale: british), "Tomorrow")
        XCTAssertEqual(ContactText.dayLabel(day("2026-10-30"), today: today, locale: british), "Friday")
        XCTAssertNotEqual(ContactText.dayLabel(day("2026-11-02"), today: today, locale: british), "Monday", "a week off reads as a date")
        let later = ContactText.dayLabel(day("2026-11-07"), today: today, locale: british)
        XCTAssertTrue(later.hasPrefix("Sat") && later.contains("7") && later.hasSuffix("Nov"), later)

        let reference = API.ContactReference(id: UUID(), displayName: "Anna", photoUrl: nil)
        XCTAssertEqual(ContactText.birthdayReminder(BirthdayReminder(contact: reference, on: today, turns: 36), today: today, locale: british), "Today - turns 36")
        XCTAssertEqual(ContactText.birthdayReminder(BirthdayReminder(contact: reference, on: day("2026-10-30"), turns: nil), today: today, locale: british), "Friday")
    }

    func testABirthdaySaysTheDateHowSoonAndTheAgeTurned() {
        XCTAssertEqual(ContactText.birthday(ContactBirthday(month: 11, day: 7, year: 1990), today: today, locale: british), "7 November 1990, in 12 days, turns 36")
        XCTAssertEqual(ContactText.birthday(ContactBirthday(month: 10, day: 26, year: 1990), today: today, locale: british), "26 October 1990, today, turns 36")
        XCTAssertEqual(ContactText.birthday(ContactBirthday(month: 10, day: 27, year: nil), today: today, locale: british), "27 October, tomorrow")
        XCTAssertEqual(ContactText.birthday(ContactBirthday(month: 10, day: 25, year: 1990), today: today, locale: british), "25 October 1990, in 364 days, turns 37")
    }

    func testALeapDayBirthdayFallsOnThe28thInOtherYears() throws {
        let leapling = ContactBirthday(month: 2, day: 29, year: 2000)

        XCTAssertEqual(DateParsing.dateOnly.string(from: try XCTUnwrap(ContactText.nextBirthday(leapling, today: today))), "2027-02-28")
        XCTAssertEqual(DateParsing.dateOnly.string(from: try XCTUnwrap(ContactText.nextBirthday(leapling, today: day("2027-03-01")))), "2028-02-29")
    }

    func testKeepInTouchNamesItsCadence() {
        XCTAssertEqual(KeepInTouch.presets.map(\.days), [7, 14, 30, 91, 182, 365])
        XCTAssertEqual(KeepInTouch.label(nil), "Off")
        XCTAssertEqual(KeepInTouch.label(14), "Every 2 weeks")
        XCTAssertEqual(KeepInTouch.label(10), "Every 10 days")
        XCTAssertTrue(KeepInTouch.isPreset(91))
        XCTAssertFalse(KeepInTouch.isPreset(10))
    }

    func testCaughtUpTodayIsOnlyToday() throws {
        XCTAssertTrue(try contact(caughtUpOn: "2026-10-26").wasCaughtUp(on: today))
        XCTAssertFalse(try contact(caughtUpOn: "2026-10-25").wasCaughtUp(on: today))
        XCTAssertFalse(try contact().wasCaughtUp(on: today))
    }

    func testATagIsAddedOnceWhateverItsCase() {
        XCTAssertEqual(ContactTags.adding(" Climbing ", to: ["Work"]), ["Work", "Climbing"])
        XCTAssertNil(ContactTags.adding("work", to: ["Work"]))
        XCTAssertNil(ContactTags.adding("  ", to: []))
        XCTAssertEqual(ContactTags.adding(String(repeating: "a", count: 60), to: [])?.first?.count, 50)
        XCTAssertNil(ContactTags.adding("new", to: (1...20).map(String.init)))
    }
}

final class ContactKeepUpBodyTests: XCTestCase {
    private func sent(_ body: ContactKeepUpUpdate) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder.api.encode(body)) as? [String: Any])
    }

    func testTurningKeepInTouchOffSendsNull() throws {
        let body = try sent(ContactKeepUpUpdate(keepInTouchDays: .some(nil)))

        XCTAssertEqual(Array(body.keys), ["keep_in_touch_days"])
        XCTAssertTrue(body["keep_in_touch_days"] is NSNull)
    }

    func testACadenceSendsItsDaysAndNothingElse() throws {
        XCTAssertEqual(try sent(ContactKeepUpUpdate(keepInTouchDays: .some(14))) as NSDictionary, ["keep_in_touch_days": 14])
    }

    func testCaughtUpSendsTheLocalDay() throws {
        XCTAssertEqual(try sent(ContactKeepUpUpdate(caughtUpOn: .some(day("2026-10-26")))) as NSDictionary, ["caught_up_on": "2026-10-26"])
    }

    func testRemindersSurviveTheCache() throws {
        let json = """
        {"birthdays":[{"contact":{"id":"\(contactID)","display_name":"Anna","photo_url":null},"on":"2026-11-07","turns":36}],
         "catch_up":[{"contact":{"id":"\(contactID)","display_name":"Anna","photo_url":null},"due_on":"2026-10-20","last_seen":{"on":"2026-09-01","event_title":"Fika"}}]}
        """
        let reminders = try JSONDecoder.api.decode(ContactReminders.self, from: Data(json.utf8))
        let cache = ResponseCache(account: "alice", root: temporaryURL("cache"))

        cache.save(reminders, as: "reminders")
        let cached = try XCTUnwrap(cache.load(ContactReminders.self, key: "reminders"))

        XCTAssertEqual(cached, reminders)
        XCTAssertEqual(DateParsing.dateOnly.string(from: try XCTUnwrap(cached.birthdays.first).on), "2026-11-07")
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

@MainActor
final class ContactsStoreTests: XCTestCase {
    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
    }

    private let emptyReminders = #"{"birthdays":[],"catch_up":[]}"#

    private func loadedStore(listing: String = contactJSON(tags: ["Work"]), keepUp: @escaping (URLRequest) -> (Int, String)) async -> ContactsStore {
        MockURLProtocol.responder = { [emptyReminders] request in
            let path = request.url?.path ?? ""
            if request.httpMethod == "PATCH" {
                let (status, body) = keepUp(request)
                return (status, [:], Data(body.utf8))
            }
            if path.hasSuffix("/reminders") { return (200, [:], Data(emptyReminders.utf8)) }
            if path.hasSuffix("/sources") { return (200, [:], Data("[]".utf8)) }
            if request.httpMethod == "POST" { return (202, [:], Data("null".utf8)) }
            return (200, [:], Data(#"{"items":[\#(listing)],"pagination":{"total_count":1,"max_page":1}}"#.utf8))
        }
        let store = ContactsStore(client: makeTestClient(), cache: ResponseCache(account: "alice", root: temporaryURL("cache")))
        await store.load()
        return store
    }

    func testLoadingReadsEveryContactAndTheNextTwoWeeksOfBirthdays() async throws {
        let store = await loadedStore { _ in (500, "") }

        XCTAssertEqual(store.contacts.map(\.displayName), ["Anna Berg"])
        XCTAssertEqual(store.sections.map(\.letter), ["A"])
        XCTAssertNotNil(store.reminders)
        let reminders = try XCTUnwrap(MockURLProtocol.requests.first { $0.url?.path == "/v1/contacts/reminders" })
        XCTAssertEqual(reminders.url?.query, "days=14")
    }

    func testContactsAreKeptInTheListsOrder() async {
        let listing = [contactJSON(id: UUID().uuidString, name: "Örjan"), contactJSON(id: UUID().uuidString, name: "anna")].joined(separator: ",")

        let store = await loadedStore(listing: listing) { _ in (500, "") }

        XCTAssertEqual(store.contacts.map(\.displayName), ["anna", "Örjan"])
        XCTAssertEqual(store.sections.map(\.letter), ["A", "Ö"])
    }

    func testCaughtUpPatchesKeepUpAndReadsTheRemindersAgain() async throws {
        let today = DateParsing.dateOnly.string(from: .now)
        var sent: [String: Any]?
        let store = await loadedStore { request in
            sent = sentJSON(request)
            return (200, contactJSON(tags: ["Work"], caughtUpOn: today))
        }
        let toasts = ToastCenter()
        let remindersBefore = MockURLProtocol.requests.filter { $0.url?.path == "/v1/contacts/reminders" }.count

        await store.markCaughtUp(try XCTUnwrap(store.contacts.first), toasts: toasts)

        let patch = try XCTUnwrap(MockURLProtocol.requests.first { $0.httpMethod == "PATCH" })
        XCTAssertEqual(patch.url?.path, "/v1/contacts/\(contactID)/keep-up")
        XCTAssertEqual(sent as NSDictionary?, ["caught_up_on": today])
        XCTAssertEqual(store.contacts.first?.wasCaughtUp(on: .now), true)
        XCTAssertEqual(MockURLProtocol.requests.filter { $0.url?.path == "/v1/contacts/reminders" }.count, remindersBefore + 1)
        XCTAssertEqual(toasts.current?.message, "Marked as caught up today")
        XCTAssertNotNil(toasts.current?.action)
    }

    func testTurningKeepInTouchOffSendsNull() async throws {
        var sent: [String: Any]?
        let store = await loadedStore(listing: contactJSON(keepInTouchDays: 30)) { request in
            sent = sentJSON(request)
            return (200, contactJSON(keepInTouchDays: nil))
        }
        XCTAssertEqual(store.contacts.first?.keepInTouchDays, 30)

        await store.setKeepInTouch(try XCTUnwrap(store.contacts.first), days: nil)

        let body = try XCTUnwrap(sent)
        XCTAssertEqual(Array(body.keys), ["keep_in_touch_days"])
        XCTAssertTrue(body["keep_in_touch_days"] is NSNull)
        XCTAssertNil(store.contacts.first?.keepInTouchDays)
    }

    func testATagChangeTheServerTurnsDownIsPutBack() async throws {
        let store = await loadedStore { _ in (422, #"{"detail":"Too many tags."}"#) }

        await store.setTags(try XCTUnwrap(store.contacts.first), ["Work", "Climbing"])

        XCTAssertEqual(store.contacts.first?.tags, ["Work"])
        XCTAssertEqual(store.sections.first?.contacts.first?.tags, ["Work"])
        XCTAssertEqual(store.errorMessage, "Too many tags.")
    }

    func testATagChangeShowsWhatTheServerSaved() async throws {
        let store = await loadedStore { _ in (200, contactJSON(tags: ["Work", "Climbing"])) }

        await store.setTags(try XCTUnwrap(store.contacts.first), ["Work", "climbing"])

        XCTAssertEqual(store.contacts.first?.tags, ["Work", "Climbing"])
        XCTAssertNil(store.errorMessage)
    }

    func testPullToRefreshAsksForASyncAndThenReadsTheList() async throws {
        let store = await loadedStore { _ in (500, "") }
        store.syncWait = .zero
        MockURLProtocol.requests = []

        await store.refresh()

        let methods = MockURLProtocol.requests.map { "\($0.httpMethod ?? "") \($0.url?.path ?? "")" }
        XCTAssertEqual(methods.first, "POST /v1/contacts/sync")
        XCTAssertTrue(methods.dropFirst().contains("GET /v1/contacts"), "\(methods)")
        XCTAssertNil(store.loadError)
    }
}
