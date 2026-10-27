import XCTest
@testable import Bessel

final class QuickTaskTests: XCTestCase {
    private let projects = ["Uni", "Travel", "Bessel Dev", "Bessel Web"]
    private var calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Stockholm")!
        return calendar
    }()

    // Wednesday 7 Oct 2026, mid-afternoon.
    private var now: Date { calendar.date(from: DateComponents(year: 2026, month: 10, day: 7, hour: 15, minute: 30))! }

    private func parse(_ input: String) -> QuickTask {
        QuickTask.parse(input, projects: projects, now: now, calendar: calendar)
    }

    private func day(_ year: Int, _ month: Int, _ day: Int) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day))!
    }

    func testDatesAnywhereInTheLine() {
        XCTAssertEqual(parse("Call mom tomorrow").dueDate, day(2026, 10, 8))
        XCTAssertEqual(parse("Call mom tomorrow").title, "Call mom")
        XCTAssertEqual(parse("Meeting monday").dueDate, day(2026, 10, 12))
        XCTAssertEqual(parse("Essay wednesday").dueDate, day(2026, 10, 14), "Today's weekday means next week")
        XCTAssertEqual(parse("Pay rent 1/11").dueDate, day(2026, 11, 1))
        XCTAssertEqual(parse("Trip 5 jan").dueDate, day(2027, 1, 5), "A date already past rolls into next year")
        XCTAssertEqual(parse("Exam dec 3").dueDate, day(2026, 12, 3))
        XCTAssertEqual(parse("Book dentist in 3 days").dueDate, day(2026, 10, 10))
        XCTAssertEqual(parse("Plan trip in 2 weeks").dueDate, day(2026, 10, 21))
        XCTAssertEqual(parse("Shop next week").dueDate, day(2026, 10, 12))
    }

    func testDatesThatDontExistStayInTheTitle() {
        let party = parse("Party 31/2")
        XCTAssertNil(party.dueDate)
        XCTAssertEqual(party.title, "Party 31/2")
        XCTAssertNil(parse("Room 13/14").dueDate)
    }

    func testLeapDayRollsToTheNextLeapYear() {
        XCTAssertEqual(parse("Birthday 29 feb").dueDate, day(2028, 2, 29))
    }

    func testNumbersBeforeOrdinaryWordsArentDates() {
        for input in ["Buy 4 apples", "Read 3 chapters", "Bake 12 buns", "Order 2 decks"] {
            XCTAssertNil(parse(input).dueDate, input)
            XCTAssertEqual(parse(input).title, input)
        }
    }

    func testShortDayNamesInsideAPhraseArentDates() {
        for input in ["Buy sun cream", "Fix the sat nav", "Wed dress fitting"] {
            XCTAssertNil(parse(input).dueDate, input)
            XCTAssertEqual(parse(input).title, input)
        }
        XCTAssertEqual(parse("Call grandma sun").dueDate, day(2026, 10, 11), "At the end it still means Sunday")
        XCTAssertEqual(parse("Sunday brunch").dueDate, day(2026, 10, 11), "A full day name counts anywhere")
    }

    func testOnlyADateKeepsItAsTheTitle() {
        let task = parse("tomorrow")
        XCTAssertEqual(task.title, "tomorrow")
        XCTAssertEqual(task.dueDate, day(2026, 10, 8))
    }

    func testPriority() {
        XCTAssertEqual(parse("Pay rent !").priority, 3)
        XCTAssertEqual(parse("Pay rent !!!").priority, 4)
        XCTAssertEqual(parse("Call mum!!").title, "Call mum")
        XCTAssertEqual(parse("Call mum!!").priority, 3)
        XCTAssertEqual(parse("Wow!").priority, 0, "One stuck-on bang is punctuation")
        XCTAssertEqual(parse("Wow!").title, "Wow!")
    }

    func testProjects() {
        XCTAssertEqual(parse("Read chapter #uni").project, "Uni")
        XCTAssertEqual(parse("Pack #trav").project, "Travel")
        XCTAssertNil(parse("Fix bug #bessel").project, "Ambiguous prefix")
        XCTAssertEqual(parse("Fix bug #bessel").title, "Fix bug #bessel")
        XCTAssertNil(parse("Lone #").project)
        XCTAssertEqual(parse("Lone #").title, "Lone #")
    }

    func testEmojiAndSpacing() {
        XCTAssertEqual(parse("  🌷 Water   plants  fri ").title, "🌷 Water plants")
        XCTAssertEqual(parse("  🌷 Water   plants  fri ").dueDate, day(2026, 10, 9))
    }
}
