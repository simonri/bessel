import XCTest
@testable import Bessel

/// The models generated from the API spec (scripts/generate_swift_models.py),
/// sent and read the way APIClient does.
final class GeneratedModelsTests: XCTestCase {
    private let taskJSON = #"""
    {"id":"3F2504E0-4F89-11D3-9A0C-0305E82C3301","created_at":"2026-10-01T08:30:00.123456Z","modified_at":null,
     "title":"Water plants","description":null,"status":"blocked","priority":2,"due_date":"2026-10-07",
     "completed_at":null,"project":"Home","tags":null,"position":1000,"is_recurring":true,
     "rrule_frequency":"fortnightly","rrule_interval":1,"rrule_day_of_week":null,"rrule_day_of_month":null,
     "parent_task_id":null,"attachments":[{"id":"not-a-uuid"}]}
    """#

    private func sent<T: Encodable>(_ body: T) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder.api.encode(body)) as? [String: Any])
    }

    func testReadsValuesThisBuildDoesNotKnow() throws {
        let task = try JSONDecoder.api.decode(TaskItem.self, from: Data(taskJSON.utf8))

        XCTAssertEqual(task.status, .unknown)
        XCTAssertEqual(task.rruleFrequency, .unknown)
        XCTAssertEqual(task.attachments, [])
        XCTAssertEqual(task.title, "Water plants")
        XCTAssertEqual(DateParsing.dateOnly.string(from: try XCTUnwrap(task.dueDate)), "2026-10-07")
    }

    func testAListMissingFromAnOlderResponseReadsAsEmpty() throws {
        let json = taskJSON.replacingOccurrences(of: #","attachments":[{"id":"not-a-uuid"}]"#, with: "")
        XCTAssertNotEqual(json, taskJSON)

        let task = try JSONDecoder.api.decode(TaskItem.self, from: Data(json.utf8))

        XCTAssertEqual(task.attachments, [])
    }

    func testAnUpdateSendsOnlyTheFieldsItSets() throws {
        XCTAssertEqual(try sent(TaskUpdate(title: "New")) as NSDictionary, ["title": "New"])
    }

    func testAnUpdateClearsAFieldWithAnExplicitNull() throws {
        let body = try sent(TaskUpdate(description: .some(nil), status: .done, dueDate: .some(nil)))

        XCTAssertEqual(Set(body.keys), ["description", "status", "due_date"])
        XCTAssertTrue(body["description"] is NSNull)
        XCTAssertTrue(body["due_date"] is NSNull)
        XCTAssertEqual(body["status"] as? String, "done")
    }

    func testDatesAreSentAsTheDayPicked() throws {
        let day = try XCTUnwrap(DateParsing.dateOnly.date(from: "2026-10-30"))

        XCTAssertEqual(try sent(TaskUpdate(dueDate: day))["due_date"] as? String, "2026-10-30")
        XCTAssertEqual(try sent(TaskCreate(title: "Buy milk", dueDate: day))["due_date"] as? String, "2026-10-30")
    }

    func testACreateSendsTheServerDefaultsAndLeavesUnsetOptionalsOut() throws {
        XCTAssertEqual(
            try sent(TaskCreate(title: "Buy milk")) as NSDictionary,
            ["title": "Buy milk", "status": "todo", "priority": 0, "is_recurring": false]
        )
    }

    func testAMissingFieldWithADefaultReadsAsTheDefault() throws {
        let step = try JSONDecoder.api.decode(API.RecipeStep.self, from: Data(#"{"title":"Stir"}"#.utf8))

        XCTAssertEqual(step.text, "")
        XCTAssertEqual(step.callouts, [])
    }

    func testAStatusChangeKeepsTheRestOfTheTask() throws {
        let task = try JSONDecoder.api.decode(TaskItem.self, from: Data(taskJSON.utf8))

        let body = try sent(TaskUpdate.status(.done, for: task))

        XCTAssertEqual(body["status"] as? String, "done")
        XCTAssertEqual(body["title"] as? String, "Water plants")
        XCTAssertTrue(body["description"] is NSNull)
        XCTAssertEqual(body["project"] as? String, "Home")
    }
}
