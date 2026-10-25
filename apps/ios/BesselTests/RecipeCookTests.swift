import XCTest
@testable import Bessel

private let recipeID = "3F2504E0-4F89-11D3-9A0C-0305E82C3301"

private func recipeJSON(title: String = "Dal", lastCookedOn: String? = nil, cookCount: Int = 0) -> String {
    let last = lastCookedOn.map { "\"\($0)\"" } ?? "null"
    return """
    {"id":"\(recipeID)","created_at":"2026-10-01T08:00:00Z","modified_at":null,"title":"\(title)","content":"",
     "recipe_type":"main","body":{},"structured":true,"last_cooked_on":\(last),"cook_count":\(cookCount)}
    """
}

private func decodeRecipe(_ json: String) throws -> RecipeItem {
    try JSONDecoder.api.decode(RecipeItem.self, from: Data(json.utf8))
}

final class RecipeCookedLabelTests: XCTestCase {
    private let today = DateParsing.dateOnly.date(from: "2026-10-25")!

    func testSaysHowLongAgoItWasCooked() throws {
        let cases: [(String?, String)] = [
            (nil, "Not cooked yet"),
            ("2026-10-25", "Cooked today"),
            ("2026-10-24", "Cooked yesterday"),
            ("2026-10-12", "Cooked 13 days ago"),
            ("2026-10-11", "Cooked 2 weeks ago"),
            ("2026-08-26", "Cooked 2 months ago"),
            ("2025-10-25", "Cooked over a year ago"),
        ]
        for (last, expected) in cases {
            XCTAssertEqual(try decodeRecipe(recipeJSON(lastCookedOn: last)).cookedLabel(today: today), expected, "\(last ?? "nil")")
        }
    }

    func testTheCookedSortPutsTheOnesMadeLongestAgoFirstAndNeverMadeOnesLast() throws {
        let recipes = try [
            decodeRecipe(recipeJSON(title: "dal", lastCookedOn: "2026-10-20")),
            decodeRecipe(recipeJSON(title: "Carbonara")),
            decodeRecipe(recipeJSON(title: "Lasagna", lastCookedOn: "2026-09-01")),
            decodeRecipe(recipeJSON(title: "apple pie")),
            decodeRecipe(recipeJSON(title: "Burgers", lastCookedOn: "2026-10-20")),
        ]

        XCTAssertEqual(RecipeSort.cooked.sorted(recipes).map(\.title), ["Lasagna", "Burgers", "dal", "apple pie", "Carbonara"])
        XCTAssertEqual(RecipeSort.title.sorted(recipes).map(\.title), ["apple pie", "Burgers", "Carbonara", "dal", "Lasagna"])
    }

    func testARecipeCachedBeforeCookingWasLoggedReadsAsNeverCooked() throws {
        let cached = recipeJSON().replacingOccurrences(of: #","last_cooked_on":null,"cook_count":0"#, with: "")
        XCTAssertNotEqual(cached, recipeJSON())

        let recipe = try decodeRecipe(cached)

        XCTAssertEqual(recipe.cookCount, 0)
        XCTAssertNil(recipe.lastCookedOn)
    }
}

@MainActor
final class RecipeCookStoreTests: XCTestCase {
    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
    }

    private func loadedStore(cookResult: String) async -> (RecipesStore, ToastCenter) {
        MockURLProtocol.responder = { request in
            switch request.httpMethod {
            case "PUT": return (200, [:], Data(cookResult.utf8))
            case "DELETE": return (200, [:], Data(recipeJSON().utf8))
            default: return (200, [:], Data(#"{"items":[\#(recipeJSON())],"pagination":{"total_count":1,"max_page":1}}"#.utf8))
            }
        }
        let client = makeTestClient()
        let store = RecipesStore(
            client: client,
            outbox: DeleteOutbox(client: client, account: "alice", fileURL: temporaryURL("deletes.json")),
            cache: ResponseCache(account: "alice", root: temporaryURL("cache"))
        )
        await store.load()
        return (store, ToastCenter())
    }

    func testLoggingTodayPutsTheLocalDayAndShowsItAsCooked() async throws {
        let today = DateParsing.dateOnly.string(from: .now)
        let (store, toasts) = await loadedStore(cookResult: #"{"recipe":\#(recipeJSON(lastCookedOn: today, cookCount: 1)),"created":true}"#)

        await store.logCooked(try XCTUnwrap(store.recipes.first), toasts: toasts)

        let put = try XCTUnwrap(MockURLProtocol.requests.last)
        XCTAssertEqual(put.httpMethod, "PUT")
        XCTAssertEqual(put.url?.path, "/v1/recipes/\(recipeID)/cooks/\(today)")
        XCTAssertEqual(store.recipes.first?.cookCount, 1)
        XCTAssertEqual(store.recipes.first?.wasCooked(on: .now), true)
        XCTAssertEqual(toasts.current?.message, "Logged as cooked today")
    }

    func testUndoTakesOffTheDayThatWasAdded() async throws {
        let today = DateParsing.dateOnly.string(from: .now)
        let (store, toasts) = await loadedStore(cookResult: #"{"recipe":\#(recipeJSON(lastCookedOn: today, cookCount: 1)),"created":true}"#)
        await store.logCooked(try XCTUnwrap(store.recipes.first), toasts: toasts)

        try XCTUnwrap(toasts.current?.action)()
        for _ in 0..<50 where store.recipes.first?.cookCount != 0 {
            try await Task.sleep(for: .milliseconds(20))
        }

        let delete = try XCTUnwrap(MockURLProtocol.requests.last)
        XCTAssertEqual(delete.httpMethod, "DELETE")
        XCTAssertEqual(delete.url?.path, "/v1/recipes/\(recipeID)/cooks/\(today)")
        XCTAssertEqual(store.recipes.first?.cookCount, 0)
    }

    func testADayAlreadyLoggedElsewhereIsNotOfferedForUndo() async throws {
        let today = DateParsing.dateOnly.string(from: .now)
        let (store, toasts) = await loadedStore(cookResult: #"{"recipe":\#(recipeJSON(lastCookedOn: today, cookCount: 1)),"created":false}"#)

        await store.logCooked(try XCTUnwrap(store.recipes.first), toasts: toasts)

        XCTAssertEqual(toasts.current?.message, "Already logged for today")
        XCTAssertNil(toasts.current?.action)
    }
}
