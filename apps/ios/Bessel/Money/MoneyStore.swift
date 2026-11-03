import Foundation
import Observation

/// Accounts, the month's summary, investments and categories: everything on
/// the money pages but the transactions themselves. Read-only, like the API's
/// money for every client but the web.
@MainActor
@Observable
final class MoneyStore {
    /// The month the summary and the transactions show.
    var month = MonthKey.current
    private(set) var overview: MoneyOverview?
    private(set) var summary: MoneySummary?
    private(set) var holdings: [MoneyHolding] = []
    private(set) var investmentAccounts: [InvestmentAccount] = []
    private(set) var categories: [MoneyCategory] = []
    private(set) var hasLoadedOverview = false
    private(set) var hasLoadedSummary = false
    private(set) var hasLoadedInvestments = false
    /// A refresh that didn't go through; shown quietly over what's already there.
    var loadError: String?

    private let client: APIClient
    private let cache: ResponseCache
    @ObservationIgnored private var overviewLoads = LoadGeneration()
    @ObservationIgnored private var summaryLoads = LoadGeneration()
    @ObservationIgnored private var investmentLoads = LoadGeneration()
    @ObservationIgnored private var categoryLoads = LoadGeneration()
    private static let overviewKey = "money.overview.v1"
    private static let summaryKey = "money.summary.v1"
    private static let holdingsKey = "money.holdings.v1"
    private static let investmentAccountsKey = "money.investment-accounts.v1"
    private static let categoriesKey = "money.categories.v1"

    init(services: AppServices) {
        client = services.client
        cache = services.cache
        if let saved = cache.load(MoneyOverview.self, key: Self.overviewKey) {
            overview = saved
            hasLoadedOverview = true
        }
        if let saved = cache.load(MoneySummary.self, key: Self.summaryKey), MonthKey(year: saved.year, month: saved.month) == month {
            summary = saved
            hasLoadedSummary = true
        }
        if let saved = cache.load([InvestmentAccount].self, key: Self.investmentAccountsKey) {
            investmentAccounts = saved
            holdings = cache.load([MoneyHolding].self, key: Self.holdingsKey) ?? []
            hasLoadedInvestments = true
        }
        categories = cache.load([MoneyCategory].self, key: Self.categoriesKey) ?? []
    }

    var accounts: [MoneyAccount] { overview?.accounts ?? [] }
    var netWorth: [NetWorth] { NetWorth.perCurrency(overview?.totals ?? []) }
    var accountsNeedingYou: [MoneyAccount] { accounts.filter { $0.source.issue != nil } }

    func account(_ id: UUID) -> MoneyAccount? {
        accounts.first { $0.id == id }
    }

    func category(_ id: UUID?) -> MoneyCategory? {
        guard let id else { return nil }
        return categories.first { $0.id == id }
    }

    // MARK: - Loading

    func loadOverviewIfStale() async {
        guard overviewLoads.isStale(maxAge: AppServices.freshFor) else { return }
        await loadOverview()
    }

    func loadOverview() async {
        let ticket = overviewLoads.begin()
        defer { hasLoadedOverview = true }
        do {
            let response: MoneyOverview = try await client.get("/v1/bank-accounts/overview")
            guard overviewLoads.isCurrent(ticket) else { return }
            overview = response
            loadError = nil
            overviewLoads.finish(ticket)
            cache.save(response, as: Self.overviewKey)
        } catch {
            report(error, ticket: ticket, in: overviewLoads)
        }
    }

    func loadSummaryIfStale() async {
        let shown = summary.map { MonthKey(year: $0.year, month: $0.month) }
        guard shown != month || summaryLoads.isStale(maxAge: AppServices.freshFor) else { return }
        await loadSummary()
    }

    func loadSummary() async {
        let ticket = summaryLoads.begin()
        let month = month
        defer { hasLoadedSummary = true }
        do {
            let response: MoneySummary = try await client.get("/v1/transactions/summary", query: Self.monthQuery(month))
            guard summaryLoads.isCurrent(ticket) else { return }
            summary = response
            loadError = nil
            summaryLoads.finish(ticket)
            if month == .current { cache.save(response, as: Self.summaryKey) }
        } catch {
            report(error, ticket: ticket, in: summaryLoads)
        }
    }

    func loadInvestmentsIfStale() async {
        guard investmentLoads.isStale(maxAge: AppServices.freshFor) else { return }
        await loadInvestments()
    }

    func loadInvestments() async {
        let ticket = investmentLoads.begin()
        defer { hasLoadedInvestments = true }
        do {
            async let accountsResponse: API.InvestmentAccountsResponse = client.get("/v1/investments/accounts")
            async let holdingsResponse: API.HoldingsResponse = client.get("/v1/investments/holdings")
            let (accounts, holdings) = try await (accountsResponse, holdingsResponse)
            guard investmentLoads.isCurrent(ticket) else { return }
            investmentAccounts = accounts.items
            self.holdings = holdings.items
            loadError = nil
            investmentLoads.finish(ticket)
            cache.save(accounts.items, as: Self.investmentAccountsKey)
            cache.save(holdings.items, as: Self.holdingsKey)
        } catch {
            report(error, ticket: ticket, in: investmentLoads)
        }
    }

    /// Names for the transactions' categories, which rarely change.
    func loadCategoriesIfStale() async {
        guard categoryLoads.isStale(maxAge: 60 * 60) else { return }
        let ticket = categoryLoads.begin()
        do {
            let items: [MoneyCategory] = try await client.getAllPages("/v1/categories")
            guard categoryLoads.isCurrent(ticket) else { return }
            categories = items
            categoryLoads.finish(ticket)
            cache.save(items, as: Self.categoriesKey)
        } catch {
            report(error, ticket: ticket, in: categoryLoads)
        }
    }

    /// A transaction was filed differently: the month's figures change with it.
    func transactionsChanged() {
        summaryLoads.invalidate()
    }

    func step(_ months: Int) {
        let next = month.adding(months)
        guard next <= .current else { return }
        month = next
    }

    static func monthQuery(_ month: MonthKey) -> [URLQueryItem] {
        [URLQueryItem(name: "year", value: String(month.year)), URLQueryItem(name: "month", value: String(month.month))]
    }

    private func report(_ error: Error, ticket: Int, in loads: LoadGeneration) {
        guard loads.isCurrent(ticket), !error.isCancellation else { return }
        loadError = error.userMessage
    }
}
