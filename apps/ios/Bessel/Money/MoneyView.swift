import SwiftUI

/// The four money pages, switched with pills under the More tab's own.
enum MoneyPage: String, CaseIterable, Identifiable {
    case accounts
    case transactions
    case month
    case investments

    var id: String { rawValue }

    var title: String {
        switch self {
        case .accounts: "Accounts"
        case .transactions: "Transactions"
        case .month: "Month"
        case .investments: "Investments"
        }
    }
}

/// Money on the phone, to look at: balances and net worth, the month's
/// transactions, what came in and went out, and investments. Changes beyond
/// filing a transaction under a category happen on the web or desktop.
struct MoneyView<Header: View>: View {
    let money: MoneyStore
    let transactions: TransactionsStore
    let isActive: Bool
    @ViewBuilder let header: Header

    /// Remembered, so the page used last is the one that opens.
    @AppStorage("money.page") private var page: MoneyPage = .accounts
    @State private var accountID: UUID?

    var body: some View {
        Group {
            switch page {
            case .accounts:
                AccountsPage(store: money, isActive: isActive && page == .accounts, header: { pageHeader }) { account in
                    accountID = account.id
                    withAnimation(.snappy) { page = .transactions }
                }
            case .transactions:
                TransactionsPage(money: money, store: transactions, isActive: isActive && page == .transactions, accountID: $accountID) { pageHeader }
            case .month:
                MonthSummaryPage(store: money, isActive: isActive && page == .month) { pageHeader }
            case .investments:
                InvestmentsPage(store: money, isActive: isActive && page == .investments) { pageHeader }
            }
        }
        .background(Theme.background)
        .refreshWhileVisible(isActive) { await money.loadCategoriesIfStale() }
        .loadErrorToast(errorBinding, isActive: isActive) { await retry() }
        .haptic(.selection, trigger: page)
    }

    private var pageHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            ChipRow(bleed: 16) {
                ForEach(MoneyPage.allCases) { option in
                    FilterPill(title: option.title, isSelected: page == option) {
                        withAnimation(.snappy) { page = option }
                    }
                }
            }
        }
    }

    /// The money store's and the transactions' refresh errors, one toast for both.
    private var errorBinding: Binding<String?> {
        Binding(
            get: { money.loadError ?? transactions.loadError },
            set: { value in
                if value == nil {
                    money.loadError = nil
                    transactions.loadError = nil
                }
            }
        )
    }

    private func retry() async {
        switch page {
        case .accounts: await money.loadOverview()
        case .month: await money.loadSummary()
        case .investments: await money.loadInvestments()
        case .transactions:
            if let filter = transactions.shownFilter { await transactions.load(filter) }
        }
    }
}

/// "‹ October ›", stepping a month at a time and never past this one.
struct MonthPager: View {
    let month: MonthKey
    let onStep: (Int) -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text(month.title)
                .font(.headline)
                .foregroundStyle(Theme.foreground)
                .contentTransition(.numericText())
            Spacer()
            pagerButton("chevron.left", label: "Previous month") { onStep(-1) }
            pagerButton("chevron.right", label: "Next month") { onStep(1) }
                .disabled(month >= .current)
                .opacity(month >= .current ? 0.35 : 1)
        }
        .animation(.snappy, value: month)
    }

    private func pagerButton(_ systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.foreground)
                .frame(width: 34, height: 34)
                .background(Theme.fill, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// The logo of the bank or app an account comes from, or its initials.
struct AccountLogo: View {
    let account: MoneyAccount
    var size: CGFloat = 40

    var body: some View {
        ContactAvatar(name: account.source.kind == "manual" ? account.name : account.source.label, photoURL: account.source.logo, size: size)
    }
}

/// Up or down against what went in: "+1 234 kr +5,2%".
struct GrowthText: View {
    let value: Int
    let of: Int
    let currency: String

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: value >= 0 ? "arrow.up.right" : "arrow.down.right")
                .font(.system(size: 10, weight: .bold))
            AmountText(minor: value, currency: currency, sign: true)
            if let percent = MoneyFormat.percent(value, of: of) {
                Text(percent)
                    .opacity(0.8)
            }
        }
        .foregroundStyle(value >= 0 ? Theme.positive : Theme.destructive)
    }
}

/// A rounded card's heading.
struct CardTitle: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Theme.mutedForeground)
    }
}
