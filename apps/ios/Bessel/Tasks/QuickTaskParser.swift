import Foundation

/// Parses a one-line task like "Essay draft fri #uni !" into its parts.
/// A port of apps/web/src/lib/task-quick-parse.ts, so quick add behaves the
/// same on both. Words are matched standalone, so "Monday meeting" does set
/// the task due Monday: the trade-off for typing dates anywhere.
struct QuickTask: Equatable {
    enum TokenKind {
        case due, project, priority
    }

    struct Token: Equatable {
        let kind: TokenKind
        let label: String
    }

    var title: String
    var dueDate: Date?
    var project: String?
    var priority: Int
    var tokens: [Token]

    static func parse(_ input: String, projects: [String], now: Date = .now, calendar: Calendar = .current) -> QuickTask {
        let today = calendar.startOfDay(for: now)
        let words = input.split(whereSeparator: \.isWhitespace).map(String.init)
        var kept: [String] = []
        var tokens: [Token] = []
        var dueDate: Date?
        var project: String?
        var priority = 0

        var index = 0
        while index < words.count {
            let word = words[index]
            defer { index += 1 }

            if priority == 0, (1...3).contains(word.count), word.allSatisfy({ $0 == "!" }) {
                priority = word.count == 3 ? 4 : 3
                tokens.append(Token(kind: .priority, label: priorityLabel(priority)))
                continue
            }
            if priority == 0, index == words.count - 1, let bangs = trailingBangs(word) {
                priority = bangs.count == 3 ? 4 : 3
                tokens.append(Token(kind: .priority, label: priorityLabel(priority)))
                kept.append(bangs.rest)
                continue
            }

            if project == nil, let matched = matchProject(word, projects: projects) {
                project = matched
                tokens.append(Token(kind: .project, label: matched))
                continue
            }

            if dueDate == nil, let due = matchDue(words, at: index, today: today, calendar: calendar) {
                dueDate = due.date
                tokens.append(Token(kind: .due, label: dueLabel(due.date, now: now, calendar: calendar)))
                index += due.length - 1
                continue
            }

            kept.append(word)
        }

        let title = kept.joined(separator: " ").trimmingCharacters(in: .whitespaces)
        return QuickTask(
            title: title.isEmpty ? input.trimmingCharacters(in: .whitespaces) : title,
            dueDate: dueDate,
            project: project,
            priority: priority,
            tokens: tokens
        )
    }

    static func dueLabel(_ due: Date, now: Date = .now, calendar: Calendar = .current) -> String {
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: due)).day ?? 0
        if days == 0 { return "Today" }
        if days == 1 { return "Tomorrow" }
        if days == -1 { return "Yesterday" }
        if days > 1 && days < 7 { return due.formatted(.dateTime.weekday(.abbreviated)) }
        return due.formatted(.dateTime.month(.abbreviated).day())
    }

    private static func priorityLabel(_ priority: Int) -> String {
        priority == 4 ? "Urgent" : "High"
    }

    /// "Call mum!!": two or three bangs stuck to the last word.
    private static func trailingBangs(_ word: String) -> (rest: String, count: Int)? {
        let rest = word.reversed().drop { $0 == "!" }
        let count = word.count - rest.count
        guard (2...3).contains(count), !rest.isEmpty else { return nil }
        return (String(rest.reversed()), count)
    }

    private static func matchProject(_ word: String, projects: [String]) -> String? {
        guard word.hasPrefix("#"), word.count >= 2 else { return nil }
        let query = word.dropFirst().lowercased()
        if let exact = projects.first(where: { $0.lowercased() == query }) { return exact }
        let prefixed = projects.filter { $0.lowercased().hasPrefix(query) }
        return prefixed.count == 1 ? prefixed[0] : nil
    }

    private static let weekdays: [[String]] = [
        ["sunday", "sun"],
        ["monday", "mon"],
        ["tuesday", "tue", "tues"],
        ["wednesday", "wed"],
        ["thursday", "thu", "thur", "thurs"],
        ["friday", "fri"],
        ["saturday", "sat"],
    ]

    private static let months = [
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december",
    ]

    private static func monthIndex(_ word: String) -> Int? {
        let lower = word.lowercased()
        guard lower.count >= 3 else { return nil }
        return months.firstIndex { $0.hasPrefix(lower) }
    }

    private static func matchDue(_ words: [String], at index: Int, today: Date, calendar: Calendar) -> (length: Int, date: Date)? {
        let word = words[index].lowercased()
        let next = index + 1 < words.count ? words[index + 1].lowercased() : nil
        func days(_ count: Int) -> Date { calendar.date(byAdding: .day, value: count, to: today)! }

        if ["today", "tod", "tonight"].contains(word) { return (1, today) }
        if ["tomorrow", "tmr", "tmrw"].contains(word) { return (1, days(1)) }

        // Calendar weekday: 1 = Sunday, matching the table above.
        let todayWeekday = calendar.component(.weekday, from: today) - 1

        if word == "next", next == "week" {
            let toMonday = (8 - todayWeekday) % 7
            return (2, days(toMonday == 0 ? 7 : toMonday))
        }

        if word == "in", let next, let count = Int(next), next.count <= 3, index + 2 < words.count {
            let unit = words[index + 2].lowercased()
            if ["days", "day", "d"].contains(unit) { return (3, days(count)) }
            if ["weeks", "week", "w"].contains(unit) { return (3, days(count * 7)) }
        }

        if let weekday = weekdays.firstIndex(where: { $0.contains(word) }) {
            let ahead = (weekday - todayWeekday + 7) % 7
            return (1, days(ahead == 0 ? 7 : ahead))
        }

        let slashParts = word.split(separator: "/")
        if slashParts.count == 2, slashParts.allSatisfy({ $0.count <= 2 }),
           let day = Int(slashParts[0]), let month = Int(slashParts[1]),
           let date = upcoming(today: today, month: month - 1, day: day, calendar: calendar) {
            return (1, date)
        }

        if let day = Int(word), word.count <= 2, let next, let month = monthIndex(next),
           let date = upcoming(today: today, month: month, day: day, calendar: calendar) {
            return (2, date)
        }
        if let month = monthIndex(word), let next, let day = Int(next), next.count <= 2,
           let date = upcoming(today: today, month: month, day: day, calendar: calendar) {
            return (2, date)
        }
        return nil
    }

    /// A calendar date on or after today; rolls into next year when past.
    private static func upcoming(today: Date, month: Int, day: Int, calendar: Calendar) -> Date? {
        guard (0...11).contains(month), (1...31).contains(day) else { return nil }
        let year = calendar.component(.year, from: today)
        func make(_ year: Int) -> Date? {
            let components = DateComponents(year: year, month: month + 1, day: day)
            guard components.isValidDate(in: calendar) else { return nil }
            return calendar.date(from: components)
        }
        guard let date = make(year) else { return nil }
        return date < today ? make(year + 1) : date
    }
}
