import XCTest
@testable import Bessel

private let accountID = "6F1C2B3A-4D5E-4F60-8172-93A4B5C6D7E8"
private let transactionID = "1A2B3C4D-5E6F-4A7B-8C9D-0E1F2A3B4C5D"
private let categoryID = "C0FFEE00-1234-4567-89AB-CDEF01234567"

private func transactionJSON(id: String = transactionID, categoryID: String? = nil) -> String {
    let category = categoryID.map { "\"\($0)\"" } ?? "null"
    return """
    {"created_at":"2026-10-01T08:00:00Z","modified_at":null,"id":"\(id)","amount":8950,"currency":"SEK",
     "transaction_date":"2026-10-14","direction":"debit","description":"KORTKOP CAFE EXEMPEL","name":null,"note":null,
     "category_id":\(category),"document_count":0,"dedup_hash":"abc","bank_account_id":"\(accountID)",
     "is_business":false,"company_account":false,"transfer_id":null,"investment_kind":null,"same_description_count":0}
    """
}

private func total(_ owner: String, _ currency: String, cash: Int, investments: Int = 0, debt: Int = 0) -> String {
    #"{"owner":"\#(owner)","currency":"\#(currency)","cash":\#(cash),"investments":\#(investments),"debt":\#(debt),"net":\#(cash + investments - debt)}"#
}

private func accountJSON(name: String, currency: String = "SEK", subtype: String = "checking", isBusiness: Bool = false, inNetWorth: Bool = true, balance: Int, holdings: Int? = nil, issue: String = "null") -> String {
    """
    {"created_at":"2026-01-01T08:00:00Z","modified_at":null,"id":"\(UUID().uuidString)","name":"\(name)","currency":"\(currency)",
     "base_balance":0,"subtype":"\(subtype)","is_business":\(isBusiness),"include_in_net_worth":\(inNetWorth),"current_balance":\(balance),
     "group":"cash","source":{"kind":"bank","label":"Exempelbanken","logo":null,"synced_at":null,"access_until":null,"import_bank":null,"issue":\(issue),"problem":null},
     "bank_balance":null,"balance_drift":null,"holdings_value":\(holdings.map(String.init) ?? "null"),"first_transaction":null,"last_transaction":null,
     "transaction_count":0,"history":[]}
    """
}

private func overview(accounts: [String] = [], totals: [String]) throws -> MoneyOverview {
    let json = #"{"accounts":[\#(accounts.joined(separator: ","))],"totals":[\#(totals.joined(separator: ","))]}"#
    return try JSONDecoder.api.decode(MoneyOverview.self, from: Data(json.utf8))
}

final class MoneyFormatTests: XCTestCase {
    func testWholeKronorWithSpacesBetweenThousands() {
        XCTAssertEqual(MoneyFormat.kr(123_456), "1 235 kr")
        XCTAssertEqual(MoneyFormat.kr(123_456_789), "1 234 568 kr")
        XCTAssertEqual(MoneyFormat.kr(99_900), "999 kr")
        XCTAssertEqual(MoneyFormat.kr(0), "0 kr")
    }

    func testOtherCurrenciesKeepTheirCode() {
        XCTAssertEqual(MoneyFormat.kr(1_200, currency: "EUR"), "12 EUR")
    }

    func testHalvesRoundAwayFromZeroSoARefundReadsAsThePurchase() {
        XCTAssertEqual(MoneyFormat.kr(150), "2 kr")
        XCTAssertEqual(MoneyFormat.kr(-150), "-2 kr")
        XCTAssertEqual(MoneyFormat.kr(149), "1 kr")
        XCTAssertEqual(MoneyFormat.kr(-149), "-1 kr")
    }

    func testSignOnlyOnWhatRoundsAboveZero() {
        XCTAssertEqual(MoneyFormat.kr(5_000, sign: true), "+50 kr")
        XCTAssertEqual(MoneyFormat.kr(-5_000, sign: true), "-50 kr")
        XCTAssertEqual(MoneyFormat.kr(40, sign: true), "0 kr")
    }

    func testExactKeepsOreOnlyWhenThereAreAny() {
        XCTAssertEqual(MoneyFormat.kr(8_950, exact: true), "89,50 kr")
        XCTAssertEqual(MoneyFormat.kr(-8_905, exact: true), "-89,05 kr")
        XCTAssertEqual(MoneyFormat.kr(8_950, sign: true, exact: true), "+89,50 kr")
        XCTAssertEqual(MoneyFormat.kr(123_456_700, exact: true), "1 234 567 kr")
    }

    func testCompactTurnsMillionsIntoMn() {
        XCTAssertEqual(MoneyFormat.kr(297_000_000, compact: true), "2,97 mn kr")
        XCTAssertEqual(MoneyFormat.kr(300_000_000, compact: true), "3 mn kr")
        XCTAssertEqual(MoneyFormat.kr(-250_000_000, compact: true), "-2,5 mn kr")
        XCTAssertEqual(MoneyFormat.kr(99_999_900, compact: true), "999 999 kr")
    }

    func testMaskKeepsTheShapeButNotTheDigits() {
        XCTAssertEqual(MoneyFormat.mask("-1 234,50 kr"), "-8 888,88 kr")
        XCTAssertEqual(MoneyFormat.mask("12 EUR"), "88 EUR")
    }

    func testQuantitiesAreMillionths() {
        XCTAssertEqual(MoneyFormat.quantity(12_500_000), "12,5")
        XCTAssertEqual(MoneyFormat.quantity(1_000_000), "1")
        XCTAssertEqual(MoneyFormat.quantity(1_234_000_000), "1 234")
        XCTAssertEqual(MoneyFormat.quantity(1), "0,000001")
    }

    func testPercentAgainstWhatWentIn() {
        XCTAssertEqual(MoneyFormat.percent(52, of: 1_000), "+5,2%")
        XCTAssertEqual(MoneyFormat.percent(-52, of: 1_000), "-5,2%")
        XCTAssertEqual(MoneyFormat.percent(0, of: 1_000), "0,0%")
        XCTAssertNil(MoneyFormat.percent(52, of: 0))
    }

    func testVersusUsual() {
        XCTAssertEqual(MoneyText.versusUsual(112, usual: 100), "12% more than usual")
        XCTAssertEqual(MoneyText.versusUsual(90, usual: 100), "10% less than usual")
        XCTAssertEqual(MoneyText.versusUsual(100, usual: 100), "Same as usual")
        XCTAssertNil(MoneyText.versusUsual(100, usual: 0))
    }
}

final class MonthKeyTests: XCTestCase {
    func testSteppingCrossesYears() {
        XCTAssertEqual(MonthKey(year: 2026, month: 12).adding(1), MonthKey(year: 2027, month: 1))
        XCTAssertEqual(MonthKey(year: 2026, month: 1).adding(-1), MonthKey(year: 2025, month: 12))
        XCTAssertEqual(MonthKey(year: 2026, month: 3).adding(-14), MonthKey(year: 2025, month: 1))
    }

    func testFirstAndLastDayForTheDateFilters() {
        XCTAssertEqual(MonthKey(year: 2026, month: 10).firstDay, "2026-10-01")
        XCTAssertEqual(MonthKey(year: 2026, month: 10).lastDay, "2026-10-31")
        XCTAssertEqual(MonthKey(year: 2026, month: 4).lastDay, "2026-04-30")
        XCTAssertEqual(MonthKey(year: 2026, month: 2).lastDay, "2026-02-28")
        XCTAssertEqual(MonthKey(year: 2028, month: 2).lastDay, "2028-02-29")
        XCTAssertEqual(MonthKey(year: 2100, month: 2).lastDay, "2100-02-28")
        XCTAssertEqual(MonthKey(year: 2000, month: 2).lastDay, "2000-02-29")
    }

    func testOrder() {
        XCTAssertLessThan(MonthKey(year: 2025, month: 12), MonthKey(year: 2026, month: 1))
        XCTAssertLessThan(MonthKey(year: 2026, month: 1), MonthKey(year: 2026, month: 2))
    }
}

final class MoneyAccountTests: XCTestCase {
    func testNetWorthStaysPerCurrencyAndAddsTheCompanyToYours() throws {
        let response = try overview(totals: [
            total("personal", "SEK", cash: 10_000, investments: 5_000, debt: 2_000),
            total("company", "SEK", cash: 40_000),
            total("personal", "EUR", cash: 300),
        ])

        let worth = NetWorth.perCurrency(response.totals)

        XCTAssertEqual(worth.map(\.currency), ["SEK", "EUR"])
        XCTAssertEqual(worth[0].net, 53_000)
        XCTAssertEqual(worth[0].owed, 2_000)
        XCTAssertEqual(worth[0].company?.cash, 40_000)
        XCTAssertEqual(worth[1].net, 300)
        XCTAssertNil(worth[1].company)
    }

    func testGroupTotalsCountHoldingsAndSkipWhatsOutOfNetWorth() throws {
        let response = try overview(accounts: [
            accountJSON(name: "Lönekonto", balance: 1_000),
            accountJSON(name: "ISK", subtype: "isk", balance: 200, holdings: 5_000),
            accountJSON(name: "Someone else's", inNetWorth: false, balance: 99_000),
            accountJSON(name: "Euro", currency: "EUR", balance: 700),
        ], totals: [])

        let totals = response.accounts.totalsByCurrency()

        XCTAssertEqual(totals.map(\.currency), ["SEK", "EUR"])
        XCTAssertEqual(totals.map(\.total), [6_200, 700])
    }

    func testKindsPutTheCompanyFirstThenWhatAnAccountIsFor() throws {
        let response = try overview(accounts: [
            accountJSON(name: "Company ISK", subtype: "isk", isBusiness: true, balance: 0),
            accountJSON(name: "ISK", subtype: "isk", balance: 0),
            accountJSON(name: "Card", subtype: "credit_card", balance: 0),
            accountJSON(name: "Buffer", subtype: "savings", balance: 0),
            accountJSON(name: "Everyday", balance: 0),
        ], totals: [])

        XCTAssertEqual(response.accounts.map(\.kind), [.company, .investments, .credit, .savings, .everyday])
    }

    func testProblemsSayWhatsWrongInWords() throws {
        let response = try overview(accounts: [
            accountJSON(name: "Stale", balance: 0, issue: #"{"kind":"stale","day":null,"source_balance":null,"detail":null}"#),
            accountJSON(name: "Signed out", balance: 0, issue: #"{"kind":"sign_in","day":null,"source_balance":null,"detail":null}"#),
            accountJSON(name: "Fine", balance: 0),
        ], totals: [])

        XCTAssertEqual(response.accounts.map(\.problemTitle), ["Not updated in a while", "Exempelbanken needs you to sign in again", nil])
    }
}

@MainActor
final class TransactionsStoreTests: XCTestCase {
    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
    }

    private func makeStore() -> TransactionsStore {
        let client = makeTestClient(retryPolicy: RetryPolicy(maxAttempts: 1, baseDelay: 0, maxRetryAfter: 0))
        return TransactionsStore(services: AppServices(
            client: client,
            account: "alice",
            outbox: DeleteOutbox(client: client, account: "alice", fileURL: temporaryURL("deletes.json")),
            cache: ResponseCache(account: "alice", root: temporaryURL("cache"))
        ))
    }

    private func query(_ request: URLRequest) -> [String: [String]] {
        let items = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
        return Dictionary(grouping: items, by: \.name).mapValues { $0.compactMap(\.value) }
    }

    func testAMonthAskedForByItsFirstAndLastDay() async throws {
        MockURLProtocol.respond(with: [(200, [:], #"{"items":[\#(transactionJSON())],"pagination":{"total_count":1,"max_page":1}}"#)])
        let store = makeStore()
        let filter = TransactionFilter(month: MonthKey(year: 2024, month: 2), accountID: UUID(uuidString: accountID))

        await store.load(filter)

        let sent = query(try XCTUnwrap(MockURLProtocol.requests.last))
        XCTAssertEqual(sent["date_from"], ["2024-02-01"])
        XCTAssertEqual(sent["date_to"], ["2024-02-29"])
        XCTAssertEqual(sent["bank_account_id"], [accountID])
        XCTAssertNil(sent["search"])
        XCTAssertEqual(store.transactions.map(\.id.uuidString), [transactionID])
        XCTAssertTrue(store.hasLoaded(filter))
    }

    func testASearchLooksAcrossEveryMonth() async throws {
        MockURLProtocol.respond(with: [(200, [:], #"{"items":[],"pagination":{"total_count":0,"max_page":1}}"#)])
        let store = makeStore()

        await store.load(TransactionFilter(month: MonthKey(year: 2026, month: 10), search: "  cafe "))

        let sent = query(try XCTUnwrap(MockURLProtocol.requests.last))
        XCTAssertEqual(sent["search"], ["cafe"])
        XCTAssertNil(sent["date_from"])
        XCTAssertNil(sent["date_to"])
        XCTAssertNil(sent["bank_account_id"])
    }

    func testFilingSendsOnlyTheCategory() async throws {
        let store = makeStore()
        MockURLProtocol.respond(with: [(200, [:], #"{"items":[\#(transactionJSON())],"pagination":{"total_count":1,"max_page":1}}"#)])
        await store.load(TransactionFilter(month: MonthKey(year: 2026, month: 10)))
        MockURLProtocol.respond(with: [(200, [:], transactionJSON(categoryID: categoryID))])
        let transaction = try XCTUnwrap(store.transactions.first)

        let saved = await store.setCategory(transaction, to: UUID(uuidString: categoryID))

        XCTAssertTrue(saved)
        let request = try XCTUnwrap(MockURLProtocol.requests.last)
        XCTAssertEqual(request.httpMethod, "PATCH")
        XCTAssertEqual(request.url?.path, "/v1/transactions/\(transactionID)")
        let body = try XCTUnwrap(sentBody(request))
        XCTAssertEqual(Set(body.keys), ["category_id"])
        XCTAssertEqual(body["category_id"] as? String, categoryID)
        XCTAssertEqual(store.transactions.first?.categoryId?.uuidString, categoryID)
    }

    func testClearingACategorySendsAnExplicitNull() async throws {
        let store = makeStore()
        MockURLProtocol.respond(with: [(200, [:], #"{"items":[\#(transactionJSON(categoryID: categoryID))],"pagination":{"total_count":1,"max_page":1}}"#)])
        await store.load(TransactionFilter(month: MonthKey(year: 2026, month: 10)))
        MockURLProtocol.respond(with: [(200, [:], transactionJSON())])
        let transaction = try XCTUnwrap(store.transactions.first)

        _ = await store.setCategory(transaction, to: nil)

        let body = try XCTUnwrap(sentBody(try XCTUnwrap(MockURLProtocol.requests.last)))
        XCTAssertTrue(body["category_id"] is NSNull)
        XCTAssertNil(store.transactions.first?.categoryId)
    }

    func testAFailedFilingPutsTheCategoryBack() async throws {
        let store = makeStore()
        MockURLProtocol.respond(with: [(200, [:], #"{"items":[\#(transactionJSON())],"pagination":{"total_count":1,"max_page":1}}"#)])
        await store.load(TransactionFilter(month: MonthKey(year: 2026, month: 10)))
        MockURLProtocol.respond(with: [(422, [:], #"{"detail":"No such category."}"#)])
        let transaction = try XCTUnwrap(store.transactions.first)

        let saved = await store.setCategory(transaction, to: UUID(uuidString: categoryID))

        XCTAssertFalse(saved)
        XCTAssertNil(store.transactions.first?.categoryId)
        XCTAssertEqual(store.errorMessage, "No such category.")
    }

    func testDaysKeepTheListsNewestFirstOrder() throws {
        let decoder = JSONDecoder.api
        let later = try decoder.decode(MoneyTransaction.self, from: Data(transactionJSON(id: UUID().uuidString).utf8))
        var earlier = try decoder.decode(MoneyTransaction.self, from: Data(transactionJSON(id: UUID().uuidString).utf8))
        earlier.transactionDate = try XCTUnwrap(DateParsing.dateOnly.date(from: "2026-10-12"))
        let sameDay = try decoder.decode(MoneyTransaction.self, from: Data(transactionJSON(id: UUID().uuidString).utf8))

        let days = TransactionDay.group([later, sameDay, earlier])

        XCTAssertEqual(days.map { $0.transactions.map(\.id) }, [[later.id, sameDay.id], [earlier.id]])
    }
}

/// The JSON a request sent. URLSession hands a protocol the body as a stream.
private func sentBody(_ request: URLRequest) -> [String: Any]? {
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
