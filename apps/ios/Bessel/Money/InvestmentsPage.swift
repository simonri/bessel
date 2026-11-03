import SwiftUI

/// Investment accounts with what they're worth and how they've grown against
/// what went in, then every holding by value. Tapping an account shows only
/// its holdings.
struct InvestmentsPage<Header: View>: View {
    let store: MoneyStore
    let isActive: Bool
    @ViewBuilder let header: Header

    @State private var scope: UUID?

    private var holdings: [MoneyHolding] {
        store.holdings
            .filter { scope == nil || $0.bankAccountId == scope }
            .sorted { ($0.currentValue ?? 0) > ($1.currentValue ?? 0) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if !store.hasLoadedInvestments {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                } else if store.investmentAccounts.isEmpty {
                    EmptyState(emoji: "📈", title: "No investment accounts yet", detail: "Connect Avanza from the desktop app, or Montrose on the web, to see your holdings here.")
                        .padding(.top, 40)
                } else {
                    ForEach(InvestmentTotal.perCurrency(shownAccounts)) { total in
                        InvestmentTotalCard(total: total)
                    }
                    accountsCard
                    if !holdings.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionHeading(title: "Holdings", count: holdings.count)
                                .padding(.horizontal, 4)
                            holdingList
                        }
                    }
                }
            }
            .padding(.top, Theme.pageTop)
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
            .animation(.snappy, value: scope)
        }
        .contentMargins(.bottom, 80, for: .scrollContent)
        .refreshable { await store.loadInvestments() }
        .refreshWhileVisible(isActive) { await store.loadInvestmentsIfStale() }
    }

    private var shownAccounts: [InvestmentAccount] {
        store.investmentAccounts.filter { scope == nil || $0.bankAccountId == scope }
    }

    private var accountsCard: some View {
        VStack(alignment: .leading, spacing: 4) {
            CardTitle(title: "Accounts")
                .padding(.horizontal, 4)
                .padding(.bottom, 4)
            ForEach(store.investmentAccounts, id: \.bankAccountId) { account in
                let picked = scope == account.bankAccountId
                Button {
                    scope = picked ? nil : account.bankAccountId
                } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(account.name)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Theme.foreground)
                                    .lineLimit(1)
                                if account.isBusiness {
                                    Chip(text: "Company", hue: PastelHue.forName("company"))
                                }
                            }
                            HStack(spacing: 4) {
                                Text(account.netDeposits >= 0 ? "Put in" : "Taken out")
                                AmountText(minor: abs(account.netDeposits), currency: account.currency)
                            }
                            .font(.caption)
                            .foregroundStyle(Theme.mutedForeground)
                        }
                        Spacer(minLength: 8)
                        VStack(alignment: .trailing, spacing: 3) {
                            AmountText(minor: account.total, currency: account.currency)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.foreground)
                            GrowthText(value: account.growth, of: account.netDeposits, currency: account.currency)
                                .font(.caption)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(picked ? Theme.fill : Color.clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(picked ? [.isSelected] : [])
            }
        }
        .card(padding: 8)
    }

    private var holdingList: some View {
        let names = Dictionary(store.investmentAccounts.map { ($0.bankAccountId, $0.name) }, uniquingKeysWith: { first, _ in first })
        let showAccount = scope == nil && store.investmentAccounts.count > 1
        return VStack(spacing: 0) {
            ForEach(Array(holdings.enumerated()), id: \.offset) { index, holding in
                HoldingRow(holding: holding, accountName: showAccount ? holding.bankAccountId.flatMap { names[$0] } : nil)
                if index < holdings.count - 1 {
                    Divider()
                        .overlay(Theme.border)
                        .padding(.leading, 16)
                }
            }
        }
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// The investment accounts shown, added up per currency.
struct InvestmentTotal: Identifiable, Equatable {
    let currency: String
    var total = 0
    var holdings = 0
    var cash = 0
    var netDeposits = 0
    var growth = 0

    var id: String { currency }

    static func perCurrency(_ accounts: [InvestmentAccount]) -> [InvestmentTotal] {
        var totals: [InvestmentTotal] = []
        for account in accounts {
            if !totals.contains(where: { $0.currency == account.currency }) {
                totals.append(InvestmentTotal(currency: account.currency))
            }
            guard let index = totals.firstIndex(where: { $0.currency == account.currency }) else { continue }
            totals[index].total += account.total
            totals[index].holdings += account.holdingsValue
            totals[index].cash += account.cash
            totals[index].netDeposits += account.netDeposits
            totals[index].growth += account.growth
        }
        return totals
    }
}

private struct InvestmentTotalCard: View {
    let total: InvestmentTotal

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            CardTitle(title: total.currency == "SEK" ? "Invested" : "Invested in \(total.currency)")
            AmountText(minor: total.total, currency: total.currency)
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(Theme.foreground)
            GrowthText(value: total.growth, of: total.netDeposits, currency: total.currency)
                .font(.subheadline.weight(.medium))
            HStack(spacing: 4) {
                AmountText(minor: total.holdings, currency: total.currency, compact: true)
                Text("in holdings -")
                AmountText(minor: total.cash, currency: total.currency, compact: true)
                Text("cash")
            }
            .font(.caption)
            .foregroundStyle(Theme.faintForeground)
        }
        .card(padding: 18)
    }
}

private struct HoldingRow: View {
    let holding: MoneyHolding
    let accountName: String?

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(holding.securityName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.foreground)
                    .lineLimit(1)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Theme.mutedForeground)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                if let value = holding.currentValue {
                    AmountText(minor: value, currency: holding.currency)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.foreground)
                } else {
                    Text("No price")
                        .font(.subheadline)
                        .foregroundStyle(Theme.faintForeground)
                }
                if let gainLoss = holding.gainLoss {
                    GrowthText(value: gainLoss, of: holding.costBasis, currency: holding.currency)
                        .font(.caption)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    /// "12,5 shares - ISK"; quantities say nothing about amounts, so they stay visible.
    private var detail: String {
        let units = "\(MoneyFormat.quantity(holding.quantity)) \(holding.assetType == .stock ? "shares" : "units")"
        guard let accountName else { return units }
        return "\(units) - \(accountName)"
    }
}
