import Foundation
import Observation
import SwiftUI
import UIKit

/// What the transactions list shows: one month, or every month while searching.
struct TransactionFilter: Hashable {
    var month: MonthKey
    var accountID: UUID?
    var search = ""

    var trimmedSearch: String {
        search.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var query: [URLQueryItem] {
        var items = [URLQueryItem(name: "sorting", value: "-transaction_date")]
        if trimmedSearch.isEmpty {
            items.append(URLQueryItem(name: "date_from", value: month.firstDay))
            items.append(URLQueryItem(name: "date_to", value: month.lastDay))
        } else {
            items.append(URLQueryItem(name: "search", value: trimmedSearch))
        }
        if let accountID {
            items.append(URLQueryItem(name: "bank_account_id", value: accountID.uuidString))
        }
        return items
    }
}

/// One day's transactions, newest day first.
struct TransactionDay: Identifiable {
    let day: Date
    let transactions: [MoneyTransaction]

    var id: Date { day }

    /// The list arrives newest first already, so days stay in that order.
    static func group(_ transactions: [MoneyTransaction], calendar: Calendar = .current) -> [TransactionDay] {
        var days: [TransactionDay] = []
        for transaction in transactions {
            let day = calendar.startOfDay(for: transaction.transactionDate)
            if let last = days.last, last.day == day {
                days[days.count - 1] = TransactionDay(day: day, transactions: last.transactions + [transaction])
            } else {
                days.append(TransactionDay(day: day, transactions: [transaction]))
            }
        }
        return days
    }
}

@MainActor
@Observable
final class TransactionsStore {
    private(set) var transactions: [MoneyTransaction] = []
    private(set) var shownFilter: TransactionFilter?
    private(set) var isLoading = false
    /// A change that didn't go through; shown as an alert.
    var errorMessage: String?
    /// A refresh that didn't go through; shown quietly over what's already there.
    var loadError: String?

    private let client: APIClient
    private let cache: ResponseCache
    @ObservationIgnored private var loads = LoadGeneration()
    @ObservationIgnored private let changes = SerialQueues<UUID>()
    @ObservationIgnored private var thumbnails: [UUID: UIImage] = [:]
    private static let cacheKey = "money.transactions.v1"
    /// A search over every month stops here; the newest matches come first.
    private static let searchPages = 3

    init(services: AppServices) {
        client = services.client
        cache = services.cache
        if let saved = cache.load(CachedList.self, key: Self.cacheKey), saved.month == .current {
            transactions = saved.items
            shownFilter = TransactionFilter(month: saved.month)
        }
    }

    var days: [TransactionDay] { TransactionDay.group(transactions) }

    func transaction(_ id: UUID) -> MoneyTransaction? {
        transactions.first { $0.id == id }
    }

    func hasLoaded(_ filter: TransactionFilter) -> Bool {
        shownFilter == filter
    }

    func loadIfStale(_ filter: TransactionFilter) async {
        guard shownFilter != filter || loads.isStale(maxAge: AppServices.freshFor) else { return }
        await load(filter)
    }

    func load(_ filter: TransactionFilter) async {
        let ticket = loads.begin()
        isLoading = true
        defer { if loads.isCurrent(ticket) { isLoading = false } }
        do {
            let items: [MoneyTransaction] = try await client.getAllPages(
                "/v1/transactions",
                query: filter.query,
                maxPages: filter.trimmedSearch.isEmpty ? 20 : Self.searchPages
            )
            guard loads.isCurrent(ticket) else { return }
            transactions = items
            shownFilter = filter
            loadError = nil
            loads.finish(ticket)
            if filter == TransactionFilter(month: .current) {
                cache.save(CachedList(month: filter.month, items: items), as: Self.cacheKey)
            }
        } catch {
            guard loads.isCurrent(ticket), !error.isCancellation else { return }
            loadError = error.userMessage
        }
    }

    /// Files a transaction under `categoryID`, or under none when nil.
    func setCategory(_ transaction: MoneyTransaction, to categoryID: UUID?) async -> Bool {
        let previous = transaction.categoryId
        apply(categoryID, to: transaction.id)
        do {
            let update = MoneyTransactionUpdate(categoryId: .some(categoryID), isBusiness: nil, note: nil)
            let saved: API.TransactionUpdateResponse = try await changes.run(transaction.id) { [client] in
                try await client.patch("/v1/transactions/\(transaction.id)", body: update)
            }
            apply(saved.categoryId, to: saved.id)
            return true
        } catch {
            apply(previous, to: transaction.id)
            if !error.isCancellation { errorMessage = error.userMessage }
            return false
        }
    }

    // MARK: - Receipts

    func documents(for transaction: MoneyTransaction) async -> [MoneyDocument] {
        guard transaction.documentCount > 0 else { return [] }
        do {
            return try await client.get("/v1/transactions/\(transaction.id)/documents")
        } catch {
            return []
        }
    }

    /// A small image of a receipt's first page, kept while the app runs.
    func thumbnail(_ document: MoneyDocument) async -> UIImage? {
        if let saved = thumbnails[document.id] { return saved }
        guard let data = try? await client.getData("/v1/documents/\(document.id)/thumbnail"),
              let image = UIImage(data: data)
        else { return nil }
        thumbnails[document.id] = image
        return image
    }

    private func apply(_ categoryID: UUID?, to id: UUID) {
        guard let index = transactions.firstIndex(where: { $0.id == id }) else { return }
        withAnimation(.snappy) { transactions[index].categoryId = categoryID }
    }

    private struct CachedList: Codable {
        let month: MonthKey
        let items: [MoneyTransaction]
    }
}
