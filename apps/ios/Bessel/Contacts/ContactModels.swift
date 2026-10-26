import Foundation

// The API's contact types, generated from its spec (Bessel/API/Generated).
typealias ContactItem = API.ContactSchema
typealias ContactMethod = API.ContactMethodSchema
typealias ContactBirthday = API.ContactBirthday
typealias ContactSighting = API.ContactSighting
typealias ContactSource = API.ContactSourceSchema
typealias ContactDate = API.ContactDate
typealias ContactReminders = API.ContactReminders
typealias ContactDateReminder = API.ContactDateReminder
typealias ContactInteraction = API.ContactInteractionSchema
typealias ContactInteractionKind = API.ContactInteractionKind
typealias ContactFollowUp = API.ContactFollowUp

extension ContactItem: Identifiable {
    var initials: String { ContactText.initials(displayName) }

    /// What the list shows under the name: the company, or else the first number.
    var subtitle: String? {
        if let organization, !organization.isEmpty { return organization }
        return phones.first?.display
    }

    /// "Designer at Acme", or whichever of the two is known.
    var role: String? {
        switch (jobTitle?.nilIfEmpty, organization?.nilIfEmpty) {
        case let (title?, company?): "\(title) at \(company)"
        case let (title?, nil): title
        case let (nil, company?): company
        default: nil
        }
    }

    /// Search across name, nickname, company, emails, tags and numbers; numbers
    /// match however they're spaced, and "070" finds "+46 70" (apps/web
    /// contact-meta.ts matchesContact, plus tags).
    func matches(_ query: String) -> Bool {
        let query = query.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return true }
        let text = [displayName, nickname, organization].compactMap { $0 } + emails.map(\.value) + tags
        if text.contains(where: { $0.localizedCaseInsensitiveContains(query) }) { return true }
        let wanted = ContactText.digits(query)
        guard wanted.count >= 3 else { return false }
        return phones.contains { phone in
            let number = ContactText.digits(ContactText.dialable(phone.value))
            // A Swedish number saved as +46 70… is dialled as 070…
            let local = number.hasPrefix("46") ? "0" + number.dropFirst(2) : number
            return number.contains(wanted) || local.contains(wanted)
        }
    }
}

extension ContactInteractionKind {
    /// What can be logged by hand; events come from the calendar.
    static let loggable: [ContactInteractionKind] = [.met, .call, .message, .note]

    var label: String {
        switch self {
        case .met: "Met"
        case .call: "Call"
        case .message: "Message"
        case .event: "Event"
        case .note: "Note"
        case .unknown: "Other"
        }
    }

    var systemImage: String {
        switch self {
        case .met: "person.2"
        case .call: "phone"
        case .message: "message"
        case .event: "calendar"
        case .note: "note.text"
        case .unknown: "circle"
        }
    }
}

extension ContactInteraction {
    /// The event's title, else the note, else what kind of entry it is.
    var headline: String {
        eventTitle?.nilIfBlank ?? note?.nilIfBlank ?? kind.label
    }

    /// The note under an event's title.
    var detail: String? {
        eventTitle?.nilIfBlank == nil ? nil : note?.nilIfBlank
    }

    /// Calendar entries have no id, so they're told apart by day and title.
    var listKey: String {
        id?.uuidString ?? "\(DateParsing.dateOnly.string(from: occurredOn)) \(eventTitle ?? "")"
    }
}

extension ContactFollowUp: Identifiable {
    enum Prompt {
        /// They were surely at an event that just ended: anything to note?
        case note
        /// They might have been: were they?
        case confirm
    }

    var id: String { "\(contact.id) \(event.id)" }

    /// Nil for a kind added on the server after this build, which isn't shown.
    var prompt: Prompt? {
        switch kind {
        case "note": .note
        case "confirm": .confirm
        default: nil
        }
    }

    /// "Anything to note about Anna Berg?" or "Was Anna Berg at Lunch?"
    var question: String {
        let name = contact.displayName.isEmpty ? "them" : contact.displayName
        return prompt == .confirm ? "Was \(name) at \(event.title)?" : "Anything to note about \(name)?"
    }
}

/// The list's letter sections, in order.
struct ContactSection: Identifiable, Equatable {
    let letter: String
    let contacts: [ContactItem]

    var id: String { letter }

    /// Sorted the Swedish way (Å, Ä and Ö after Z) whatever the phone's
    /// language, with names that don't start with a letter under # at the end.
    static func group(_ contacts: [ContactItem]) -> [ContactSection] {
        let sorted = contacts.sorted {
            $0.displayName.compare($1.displayName, options: [.caseInsensitive], locale: ContactText.sortLocale) == .orderedAscending
        }
        var letters: [String] = []
        var byLetter: [String: [ContactItem]] = [:]
        for contact in sorted {
            let letter = ContactText.sectionLetter(contact.displayName)
            if byLetter[letter] == nil { letters.append(letter) }
            byLetter[letter, default: []].append(contact)
        }
        if let hash = letters.firstIndex(of: "#") { letters.append(letters.remove(at: hash)) }
        return letters.map { ContactSection(letter: $0, contacts: byLetter[$0] ?? []) }
    }
}

/// Wording and links for contacts, shared by the list and the detail page.
enum ContactText {
    static let sortLocale = Locale(identifier: "sv_SE")

    /// "AB" for Anna Berg, "A" for Anna, "#" when there's nothing to go on
    /// (apps/web contact-meta.ts initials).
    static func initials(_ name: String) -> String {
        let letters = name.split(whereSeparator: \.isWhitespace).compactMap { $0.first(where: \.isLetter) }
        guard let first = letters.first else { return "#" }
        return (letters.count > 1 ? "\(first)\(letters[letters.count - 1])" : "\(first)").uppercased()
    }

    /// A-Z, then Å, Ä and Ö; É files under E. "#" for names that don't start with a letter.
    static func sectionLetter(_ name: String) -> String {
        guard let first = name.trimmingCharacters(in: .whitespaces).first, first.isLetter else { return "#" }
        let letter = String(first).uppercased()
        if ["Å", "Ä", "Ö"].contains(letter) { return letter }
        return letter.folding(options: .diacriticInsensitive, locale: sortLocale)
    }

    static func digits(_ text: String) -> String {
        String(text.filter(\.isASCII).filter(\.isNumber))
    }

    /// What a phone dials: digits and +, without the trunk 0 written as "(0)"
    /// after a country code (apps/web contact-meta.ts telUrl).
    static func dialable(_ number: String) -> String {
        String(number.replacingOccurrences(of: "(0)", with: "").filter { $0 == "+" || ($0.isASCII && $0.isNumber) })
    }

    static func callURL(_ number: String) -> URL? {
        let dialable = dialable(number)
        return dialable.isEmpty ? nil : URL(string: "tel:\(dialable)")
    }

    static func messageURL(_ number: String) -> URL? {
        let dialable = dialable(number)
        return dialable.isEmpty ? nil : URL(string: "sms:\(dialable)")
    }

    static func emailURL(_ address: String) -> URL? {
        var components = URLComponents()
        components.scheme = "mailto"
        components.path = address.trimmingCharacters(in: .whitespaces)
        return components.path.isEmpty ? nil : components.url
    }

    /// The address in Apple Maps. Google keeps addresses on several lines.
    static func mapsURL(_ address: String) -> URL? {
        let query = address.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.joined(separator: ", ")
        var components = URLComponents()
        components.scheme = "maps"
        components.host = ""
        components.queryItems = [URLQueryItem(name: "q", value: query)]
        return components.url
    }

    /// A saved link, which Google keeps as typed: "example.com" opens as https.
    static func linkURL(_ link: String) -> URL? {
        let link = link.trimmingCharacters(in: .whitespaces)
        guard !link.isEmpty else { return nil }
        if link.contains("://") { return URL(string: link) }
        return URL(string: "https://\(link)")
    }

    /// Google's "mobile" or "work" as a label: "Mobile", "Work".
    static func methodLabel(_ label: String?) -> String? {
        guard let label = label?.trimmingCharacters(in: .whitespaces), let first = label.first else { return nil }
        return first.uppercased() + label.dropFirst()
    }

    // MARK: - Days

    /// Whole days from the first day to the second; negative when the second is earlier.
    static func daysBetween(_ start: Date, and end: Date, calendar: Calendar = .current) -> Int {
        calendar.dateComponents([.day], from: calendar.startOfDay(for: start), to: calendar.startOfDay(for: end)).day ?? 0
    }

    /// "today", "yesterday", "5 days ago", "3 weeks ago", "2 months ago" or
    /// "over a year ago", bucketed like a recipe's cookedLabel.
    static func ago(_ day: Date, today: Date = .now, calendar: Calendar = .current) -> String {
        let days = daysBetween(day, and: today, calendar: calendar)
        switch days {
        case ..<1: return "today"
        case 1: return "yesterday"
        case ..<14: return "\(days) days ago"
        case ..<60: return "\(days / 7) weeks ago"
        case ..<365: return "\(days / 30) months ago"
        default: return "over a year ago"
        }
    }

    /// "Seen 3 weeks ago - Lunch", "Called yesterday - Moving to Berlin", or
    /// "Not seen in the past year", which is as far back as the calendar is searched.
    static func lastSeen(_ sighting: ContactSighting?, today: Date = .now, calendar: Calendar = .current) -> String {
        guard let sighting else { return "Not seen in the past year" }
        let verb = switch sighting.kind {
        case .call: "Called"
        case .message: "Messaged"
        case .note: "Noted"
        case .met, .event, .unknown: "Seen"
        }
        let line = "\(verb) \(ago(sighting.on, today: today, calendar: calendar))"
        guard let summary = sighting.summary?.nilIfBlank else { return line }
        return "\(line) - \(summary)"
    }

    /// When a date on the list falls: "Today", "Tomorrow", the weekday
    /// within a week, else the date ("Sat 7 Nov").
    static func dayLabel(_ day: Date, today: Date = .now, calendar: Calendar = .current, locale: Locale = .current) -> String {
        let days = daysBetween(today, and: day, calendar: calendar)
        switch days {
        case 0: return "Today"
        case 1: return "Tomorrow"
        case 2..<7: return format(day, template: "EEEE", calendar: calendar, locale: locale)
        default: return format(day, template: "EEEdMMM", calendar: calendar, locale: locale)
        }
    }

    /// The label the API gives birthdays among the reminders.
    static let birthdayLabel = "Birthday"

    /// "Birthday, turns 37 - Friday", "Anniversary, 12 years - Today", or
    /// "Birthday - Friday" when the year isn't known.
    static func comingUp(_ reminder: ContactDateReminder, today: Date = .now, calendar: Calendar = .current, locale: Locale = .current) -> String {
        let when = dayLabel(reminder.on, today: today, calendar: calendar, locale: locale)
        guard let years = reminder.years else { return "\(reminder.label) - \(when)" }
        return "\(reminder.label), \(age(years, isBirthday: reminder.label == birthdayLabel)) - \(when)"
    }

    /// When a timeline entry happened: "Today", "Yesterday", "Mon 12 Oct", or
    /// with the year when it isn't this one.
    static func entryDay(_ day: Date, today: Date = .now, calendar: Calendar = .current, locale: Locale = .current) -> String {
        switch daysBetween(day, and: today, calendar: calendar) {
        case 0: return "Today"
        case 1: return "Yesterday"
        default:
            let sameYear = calendar.component(.year, from: day) == calendar.component(.year, from: today)
            return format(day, template: sameYear ? "EEEdMMM" : "dMMMy", calendar: calendar, locale: locale)
        }
    }

    /// "Yesterday", or "Mon 12 Oct - From calendar" for an event they were
    /// surely at that nobody logged.
    static func entryCaption(_ entry: ContactInteraction, today: Date = .now, calendar: Calendar = .current, locale: Locale = .current) -> String {
        let day = entryDay(entry.occurredOn, today: today, calendar: calendar, locale: locale)
        return entry.source == .calendar ? "\(day) - From calendar" : day
    }

    /// The next time a day of the year comes round, today included; 29
    /// February falls on the 28th in other years (as the API's next_birthday).
    static func next(month: Int, day: Int, today: Date = .now, calendar: Calendar = .current) -> Date? {
        let start = calendar.startOfDay(for: today)
        let thisYear = calendar.component(.year, from: start)
        for year in [thisYear, thisYear + 1] {
            let fallsOn = month == 2 && day == 29 && !isLeap(year) ? 28 : day
            if let date = calendar.date(from: DateComponents(year: year, month: month, day: fallsOn)), date >= start { return date }
        }
        return nil
    }

    /// "7 November 1990, in 12 days, turns 36"; "7 November, tomorrow" when
    /// the year isn't known.
    static func birthday(_ birthday: ContactBirthday, today: Date = .now, calendar: Calendar = .current, locale: Locale = .current) -> String {
        occasion(month: birthday.month, day: birthday.day, year: birthday.year, isBirthday: true, today: today, calendar: calendar, locale: locale)
    }

    /// An anniversary or another date Google keeps: "12 June 2014, in 30 days, 12 years".
    static func date(_ date: ContactDate, today: Date = .now, calendar: Calendar = .current, locale: Locale = .current) -> String {
        occasion(month: date.month, day: date.day, year: date.year, isBirthday: false, today: today, calendar: calendar, locale: locale)
    }

    private static func occasion(month: Int, day: Int, year: Int?, isBirthday: Bool, today: Date, calendar: Calendar, locale: Locale) -> String {
        var parts: [String] = []
        if let date = calendar.date(from: DateComponents(year: 2000, month: month, day: day)) {
            let label = format(date, template: "dMMMM", calendar: calendar, locale: locale)
            parts.append(year.map { "\(label) \($0)" } ?? label)
        }
        if let next = next(month: month, day: day, today: today, calendar: calendar) {
            let days = daysBetween(today, and: next, calendar: calendar)
            parts.append(days == 0 ? "today" : days == 1 ? "tomorrow" : "in \(days) days")
            if let year {
                parts.append(age(calendar.component(.year, from: next) - year, isBirthday: isBirthday))
            }
        }
        return parts.joined(separator: ", ")
    }

    /// "turns 37" for a birthday, "12 years" or "1 year" for anything else.
    private static func age(_ years: Int, isBirthday: Bool) -> String {
        isBirthday ? "turns \(years)" : years == 1 ? "1 year" : "\(years) years"
    }

    private static func isLeap(_ year: Int) -> Bool {
        (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
    }

    private static func format(_ date: Date, template: String, calendar: Calendar, locale: Locale) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = locale
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: date)
    }
}

/// Tags as the API keeps them: trimmed, at most 50 characters, and one of
/// each whatever the case.
enum ContactTags {
    static let maxCount = 20
    static let maxLength = 50

    /// `tags` with `tag` added, or nil when there's nothing new to add.
    static func adding(_ tag: String, to tags: [String]) -> [String]? {
        let tag = String(tag.trimmingCharacters(in: .whitespaces).prefix(maxLength))
        guard !tag.isEmpty, tags.count < maxCount,
              !tags.contains(where: { $0.caseInsensitiveCompare(tag) == .orderedSame })
        else { return nil }
        return tags + [tag]
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }

    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
