import Foundation

// The API's contact types, generated from its spec (Bessel/API/Generated).
typealias ContactItem = API.ContactSchema
typealias ContactMethod = API.ContactMethodSchema
typealias ContactBirthday = API.ContactBirthday
typealias ContactSighting = API.ContactSighting
typealias ContactSource = API.ContactSourceSchema
typealias ContactReminders = API.ContactReminders
typealias BirthdayReminder = API.BirthdayReminder
typealias CatchUpReminder = API.CatchUpReminder
/// Bessel's own fields, which never reach Google. Only set fields are sent;
/// `.some(nil)` clears one.
typealias ContactKeepUpUpdate = API.ContactKeepUpUpdate

extension ContactItem: Identifiable {
    var initials: String { ContactText.initials(displayName) }

    /// What the list shows under the name: the company, or else the first number.
    var subtitle: String? {
        if let organization, !organization.isEmpty { return organization }
        return phones.first?.value
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

    func wasCaughtUp(on day: Date, calendar: Calendar = .current) -> Bool {
        caughtUpOn.map { calendar.isDate($0, inSameDayAs: day) } ?? false
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

/// Keep in touch every so many days; nil is off.
enum KeepInTouch {
    static let presets: [(days: Int, label: String)] = [
        (7, "Every week"),
        (14, "Every 2 weeks"),
        (30, "Every month"),
        (91, "Every 3 months"),
        (182, "Every 6 months"),
        (365, "Every year"),
    ]

    static func isPreset(_ days: Int) -> Bool {
        presets.contains { $0.days == days }
    }

    /// A preset's name, or "Every 10 days" for one set elsewhere.
    static func label(_ days: Int?) -> String {
        guard let days else { return "Off" }
        return presets.first { $0.days == days }?.label ?? (days == 1 ? "Every day" : "Every \(days) days")
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

    /// "Last seen 3 weeks ago - Lunch with Anna", or "Not seen in the past
    /// year", which is as far back as the calendar is searched.
    static func lastSeen(_ sighting: ContactSighting?, today: Date = .now, calendar: Calendar = .current) -> String {
        guard let sighting else { return "Not seen in the past year" }
        let line = "Last seen \(ago(sighting.on, today: today, calendar: calendar))"
        guard let title = sighting.eventTitle?.trimmingCharacters(in: .whitespaces), !title.isEmpty else { return line }
        return "\(line) - \(title)"
    }

    /// The catch-up list's shorter "Last seen 3 weeks ago" or "Never seen".
    static func lastSeenShort(_ sighting: ContactSighting?, today: Date = .now, calendar: Calendar = .current) -> String {
        guard let sighting else { return "Never seen" }
        return "Last seen \(ago(sighting.on, today: today, calendar: calendar))"
    }

    /// "Next catch-up in 9 days", or "Time to catch up" once it's due.
    static func nextCatchUp(_ due: Date, today: Date = .now, calendar: Calendar = .current) -> String {
        let days = daysBetween(today, and: due, calendar: calendar)
        switch days {
        case ..<1: return "Time to catch up"
        case 1: return "Next catch-up tomorrow"
        case ..<14: return "Next catch-up in \(days) days"
        case ..<60: return "Next catch-up in \(days / 7) weeks"
        default: return "Next catch-up in \(days / 30) months"
        }
    }

    /// When a birthday on the list falls: "Today", "Tomorrow", the weekday
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

    /// "Today - turns 36", or just "Friday" when the year isn't known.
    static func birthdayReminder(_ reminder: BirthdayReminder, today: Date = .now, calendar: Calendar = .current, locale: Locale = .current) -> String {
        let when = dayLabel(reminder.on, today: today, calendar: calendar, locale: locale)
        return reminder.turns.map { "\(when) - turns \($0)" } ?? when
    }

    /// The next time a birthday comes round, today included; 29 February falls
    /// on the 28th in other years (as the API's next_birthday).
    static func nextBirthday(_ birthday: ContactBirthday, today: Date = .now, calendar: Calendar = .current) -> Date? {
        let start = calendar.startOfDay(for: today)
        let thisYear = calendar.component(.year, from: start)
        for year in [thisYear, thisYear + 1] {
            var day = birthday.day
            var date = calendar.date(from: DateComponents(year: year, month: birthday.month, day: day))
            if birthday.month == 2, day == 29, !isLeap(year) {
                day = 28
                date = calendar.date(from: DateComponents(year: year, month: 2, day: day))
            }
            if let date, date >= start { return date }
        }
        return nil
    }

    /// "7 November 1990, in 12 days, turns 36"; "7 November, tomorrow" when
    /// the year isn't known.
    static func birthday(_ birthday: ContactBirthday, today: Date = .now, calendar: Calendar = .current, locale: Locale = .current) -> String {
        var parts: [String] = []
        if let date = calendar.date(from: DateComponents(year: 2000, month: birthday.month, day: birthday.day)) {
            let label = format(date, template: "dMMMM", calendar: calendar, locale: locale)
            parts.append(birthday.year.map { "\(label) \($0)" } ?? label)
        }
        if let next = nextBirthday(birthday, today: today, calendar: calendar) {
            let days = daysBetween(today, and: next, calendar: calendar)
            parts.append(days == 0 ? "today" : days == 1 ? "tomorrow" : "in \(days) days")
            if let year = birthday.year {
                parts.append("turns \(calendar.component(.year, from: next) - year)")
            }
        }
        return parts.joined(separator: ", ")
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
}
