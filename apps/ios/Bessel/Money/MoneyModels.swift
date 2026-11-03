import Foundation
import SwiftUI

// The API's money types, generated from its spec (Bessel/API/Generated).
typealias MoneyOverview = API.AccountsOverviewResponse
typealias MoneyAccount = API.AccountOverview
typealias MoneyTotal = API.OverviewTotal
typealias AccountProblem = API.AccountProblem
typealias MoneyTransaction = API.TransactionSchema
typealias MoneyTransactionUpdate = API.TransactionUpdate
typealias MoneyCategory = API.CategorySchema
typealias MoneySummary = API.TransactionSummaryResponse
typealias CurrencySummary = API.CurrencySummary
typealias MoneyHolding = API.HoldingSchema
typealias InvestmentAccount = API.InvestmentAccountSummary
typealias MoneyDocument = API.DocumentSchema

/// Amounts the way the web shows them: whole kronor with "kr", other
/// currencies with their code, a space between thousands and a decimal comma.
/// Written out by hand so every device prints the same characters.
enum MoneyFormat {
    /// `minor` is in öre (or cents). `exact` keeps öre for a single purchase,
    /// `compact` turns a million or more into "2,97 mn kr", `sign` adds a plus.
    static func kr(_ minor: Int, currency: String = "SEK", compact: Bool = false, sign: Bool = false, exact: Bool = false) -> String {
        let suffix = currency == "SEK" ? "kr" : currency
        if exact, minor % 100 != 0 {
            let magnitude = minor.magnitude
            let prefix = minor < 0 ? "-" : (sign ? "+" : "")
            let cents = String(format: "%02d", Int(magnitude % 100))
            return "\(prefix)\(grouped(magnitude / 100)),\(cents) \(suffix)"
        }
        // Halves round away from zero, so a refund reads as the purchase did.
        let units = (minor.magnitude + 50) / 100
        let prefix = units == 0 ? "" : (minor < 0 ? "-" : (sign ? "+" : ""))
        if compact, units >= 1_000_000 {
            let hundredths = (units + 5_000) / 10_000
            return "\(prefix)\(decimal(whole: hundredths / 100, fraction: hundredths % 100, digits: 2)) mn \(suffix)"
        }
        return "\(prefix)\(grouped(units)) \(suffix)"
    }

    /// Stands in for an amount while hidden: same width, digits not the real ones.
    static func mask(_ text: String) -> String {
        String(text.map { $0.isASCII && $0.isNumber ? "8" : $0 })
    }

    /// A holding's quantity, which the API keeps in millionths.
    static func quantity(_ micro: Int) -> String {
        let magnitude = micro.magnitude
        let text = decimal(whole: magnitude / 1_000_000, fraction: magnitude % 1_000_000, digits: 6)
        return micro < 0 ? "-\(text)" : text
    }

    /// "+12,3%" of `part` against `whole`, or nil when there's nothing to compare with.
    static func percent(_ part: Int, of whole: Int) -> String? {
        guard whole > 0 else { return nil }
        let tenths = (part.magnitude * 1000 + whole.magnitude / 2) / whole.magnitude
        let text = "\(tenths / 10),\(tenths % 10)%"
        if tenths == 0 { return text }
        return (part > 0 ? "+" : "-") + text
    }

    /// 1234567 as "1 234 567".
    static func grouped(_ value: UInt) -> String {
        let digits = Array(String(value))
        var out = ""
        for (index, digit) in digits.enumerated() {
            if index > 0, (digits.count - index) % 3 == 0 { out.append(" ") }
            out.append(digit)
        }
        return out
    }

    /// `whole` and up to `digits` decimals of `fraction`, without trailing zeros.
    private static func decimal(whole: UInt, fraction: UInt, digits: Int) -> String {
        var decimals = String(fraction)
        decimals = String(repeating: "0", count: max(0, digits - decimals.count)) + decimals
        while decimals.last == "0" { decimals.removeLast() }
        return decimals.isEmpty ? grouped(whole) : "\(grouped(whole)),\(decimals)"
    }
}

// MARK: - Accounts

/// Which group an account sits in: the company's together, the rest by what they're for.
enum AccountKind: String, CaseIterable, Identifiable {
    case everyday
    case savings
    case investments
    case credit
    case company

    var id: String { rawValue }

    var label: String {
        switch self {
        case .everyday: "Everyday"
        case .savings: "Savings"
        case .investments: "Investments"
        case .credit: "Pay later & cards"
        case .company: "Company"
        }
    }
}

extension MoneyAccount: Identifiable {
    private static let investmentSubtypes: Set<String> = ["isk", "af", "kf", "brokerage"]

    var kind: AccountKind {
        if isBusiness { return .company }
        if Self.investmentSubtypes.contains(subtype) { return .investments }
        if subtype == "savings" { return .savings }
        if subtype == "credit_card" || subtype == "loan" { return .credit }
        return .everyday
    }

    /// What the account is worth: an investment account's holdings count too.
    var value: Int {
        currentBalance + (holdingsValue ?? 0)
    }

    var typeLabel: String {
        if source.kind == "klarna" { return "Pay later" }
        switch subtype {
        case "checking": return "Everyday account"
        case "savings": return "Savings account"
        case "isk": return "ISK"
        case "af": return "Shares and funds"
        case "kf": return "Endowment insurance"
        case "brokerage": return "Brokerage"
        case "credit_card": return "Card"
        case "loan": return "Loan"
        default: return "Account"
        }
    }

    /// What's wrong with the account, in one short line, or nil when it's fine.
    var problemTitle: String? {
        source.issue.map { $0.title(source: source) }
    }
}

extension AccountProblem {
    /// Names no amounts: a balance mismatch is shown beside it through `AmountText`.
    func title(source: API.AccountSource) -> String {
        let when = day.map { $0.formatted(.dateTime.day().month(.abbreviated)) }
        switch kind {
        case "sync_failed":
            return "Couldn't update from \(source.label)"
        case "not_shared":
            return "Left out when you last approved \(source.label)"
        case "stale":
            return when.map { "Not updated since \($0)" } ?? "Not updated in a while"
        case "renew_soon":
            return when.map { "Access ends \($0)" } ?? "Access ends soon"
        case "sign_in":
            return "\(source.label) needs you to sign in again"
        case "balance_mismatch":
            return source.kind == "klarna" ? "Doesn't match what Klarna says you owe" : "Doesn't match \(source.label)'s balance"
        case "import_due":
            if source.kind == "klarna" {
                return when.map { "Last imported \($0)" } ?? "Not imported in a while"
            }
            return when.map { "Nothing new since \($0)" } ?? "Nothing new in a while"
        case "no_transactions":
            return "No transactions yet"
        default:
            return detail ?? "Needs a look"
        }
    }
}

/// One currency's net worth and where it is. Currencies are never added together.
struct NetWorth: Identifiable, Equatable {
    let currency: String
    let personal: MoneyTotal?
    let company: MoneyTotal?

    var id: String { currency }

    var net: Int { (personal?.net ?? 0) + (company?.net ?? 0) }
    var owed: Int { (personal?.debt ?? 0) + (company?.debt ?? 0) }

    /// One per currency, in the order the API lists them, so your own first.
    static func perCurrency(_ totals: [MoneyTotal]) -> [NetWorth] {
        var currencies: [String] = []
        for total in totals where !currencies.contains(total.currency) {
            currencies.append(total.currency)
        }
        return currencies.map { currency in
            NetWorth(
                currency: currency,
                personal: totals.first { $0.owner == "personal" && $0.currency == currency },
                company: totals.first { $0.owner == "company" && $0.currency == currency }
            )
        }
    }
}

extension Array where Element == MoneyAccount {
    /// What a group of accounts adds up to, one figure per currency, counting
    /// only accounts that are in net worth.
    func totalsByCurrency() -> [(currency: String, total: Int)] {
        var order: [String] = []
        var sums: [String: Int] = [:]
        for account in self where account.includeInNetWorth {
            if sums[account.currency] == nil { order.append(account.currency) }
            sums[account.currency, default: 0] += account.value
        }
        return order.map { ($0, sums[$0] ?? 0) }
    }
}

// MARK: - Transactions

extension MoneyTransaction: Identifiable {
    /// A credit adds to the account, a debit takes from it.
    var signedAmount: Int {
        direction == .debit ? -amount : amount
    }

    var displayName: String {
        name ?? description ?? "No description"
    }

    /// The company's money: anything on its accounts, and its costs marked by hand.
    var isCompanyMoney: Bool {
        companyAccount || isBusiness
    }

    /// Filed by being a move or a broker's movement, so there's no category to pick.
    var takesCategory: Bool {
        transferId == nil && investmentKind == nil
    }

    /// How it's filed, in words: a move between accounts, a broker's kind, or its category.
    func filedAs(_ category: MoneyCategory?) -> String {
        if transferId != nil { return "Between your accounts" }
        if let investmentKind { return investmentKind.label }
        return category?.name ?? "No category"
    }
}

extension API.InvestmentKind {
    var label: String {
        switch self {
        case .buy: "Buy"
        case .sell: "Sell"
        case .deposit: "Deposit"
        case .withdrawal: "Withdrawal"
        case .dividend: "Dividend"
        case .interest: "Interest"
        case .tax: "Tax"
        case .fee: "Fee"
        case .unknown: "Investment"
        }
    }
}

extension MoneyCategory: Identifiable {
    /// The category's own colour ("#6B7280"), or a pastel picked from its name.
    var tint: Color {
        Color(hexString: color) ?? Theme.pastel(PastelHue.forName(name))
    }
}

extension MoneyDocument: Identifiable {}

/// A category with the ones filed under it, for a picker.
struct CategoryGroup: Identifiable {
    let parent: MoneyCategory
    let children: [MoneyCategory]

    var id: UUID { parent.id }

    static func tree(_ categories: [MoneyCategory]) -> [CategoryGroup] {
        let sorted = categories.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        return sorted.filter { $0.parentId == nil }.map { parent in
            CategoryGroup(parent: parent, children: sorted.filter { $0.parentId == parent.id })
        }
    }
}

// MARK: - Months

/// A calendar month, as the API's month summary and date filters take it.
struct MonthKey: Hashable, Codable, Comparable {
    let year: Int
    let month: Int

    init(year: Int, month: Int) {
        self.year = year
        self.month = month
    }

    static func containing(_ date: Date, calendar: Calendar = .current) -> MonthKey {
        let parts = calendar.dateComponents([.year, .month], from: date)
        return MonthKey(year: parts.year ?? 2000, month: parts.month ?? 1)
    }

    static var current: MonthKey { containing(.now) }

    func adding(_ months: Int) -> MonthKey {
        let index = year * 12 + (month - 1) + months
        return MonthKey(year: index / 12, month: index % 12 + 1)
    }

    var dayCount: Int {
        switch month {
        case 2:
            let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
            return leap ? 29 : 28
        case 4, 6, 9, 11:
            return 30
        default:
            return 31
        }
    }

    /// The first and last day as the API's `date_from` and `date_to` take them.
    var firstDay: String { String(format: "%04d-%02d-01", year, month) }
    var lastDay: String { String(format: "%04d-%02d-%02d", year, month, dayCount) }

    var date: Date {
        Calendar.current.date(from: DateComponents(year: year, month: month, day: 1)) ?? .now
    }

    /// "October", or "October 2025" when it isn't this year.
    var title: String {
        year == MonthKey.current.year
            ? date.formatted(.dateTime.month(.wide))
            : date.formatted(.dateTime.month(.wide).year())
    }

    static func < (lhs: MonthKey, rhs: MonthKey) -> Bool {
        (lhs.year, lhs.month) < (rhs.year, rhs.month)
    }
}

enum MoneyText {
    /// "12% more than usual", against the average of the six months before.
    static func versusUsual(_ value: Int, usual: Int) -> String? {
        guard usual > 0 else { return nil }
        let change = Int((Double(value - usual) / Double(usual) * 100).rounded())
        if change == 0 { return "Same as usual" }
        return "\(abs(change))% \(change > 0 ? "more" : "less") than usual"
    }

    static func dayTitle(_ day: Date, calendar: Calendar = .current) -> String {
        if calendar.isDateInToday(day) { return "Today" }
        if calendar.isDateInYesterday(day) { return "Yesterday" }
        if calendar.isDate(day, equalTo: .now, toGranularity: .year) {
            return day.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
        }
        return day.formatted(.dateTime.day().month(.abbreviated).year())
    }
}
