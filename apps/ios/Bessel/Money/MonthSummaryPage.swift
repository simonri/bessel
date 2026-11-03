import Charts
import SwiftUI

/// What came in, what went out and what was saved in a month, against the
/// year before it, then where the money went. Your own money only: moves
/// between your accounts and the company's money stay out, as on the web.
struct MonthSummaryPage<Header: View>: View {
    let store: MoneyStore
    let isActive: Bool
    @ViewBuilder let header: Header

    private var summary: MoneySummary? {
        guard let summary = store.summary, MonthKey(year: summary.year, month: summary.month) == store.month else { return nil }
        return summary
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                MonthPager(month: store.month) { store.step($0) }
                if let summary {
                    if summary.currencies.isEmpty {
                        EmptyState(emoji: "🗓️", title: "Nothing in \(store.month.title)", detail: "Once your banks send this month's transactions, the summary shows up here.")
                            .padding(.top, 40)
                    }
                    ForEach(summary.currencies, id: \.currency) { currency in
                        MonthFiguresCard(summary: currency, ongoing: store.month == .current, month: store.month)
                        if !currency.categories.isEmpty {
                            CategoriesCard(summary: currency)
                        }
                        if !currency.merchants.isEmpty {
                            MerchantsCard(summary: currency)
                        }
                    }
                    if summary.uncategorized > 0 {
                        Label(
                            summary.uncategorized == 1 ? "1 transaction needs a category" : "\(summary.uncategorized) transactions need a category",
                            systemImage: "tag"
                        )
                        .font(.footnote)
                        .foregroundStyle(Theme.mutedForeground)
                        .frame(maxWidth: .infinity)
                    }
                } else if store.summaryFailedFor == store.month {
                    EmptyState(emoji: "📡", title: "Couldn't load \(store.month.title)", detail: "Pull down to try again.")
                        .padding(.top, 40)
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                }
            }
            .padding(.top, Theme.pageTop)
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
            .animation(.snappy, value: store.summary)
        }
        .contentMargins(.bottom, 80, for: .scrollContent)
        .refreshable { await store.loadSummary() }
        .refreshWhileVisible(isActive) { await store.loadSummaryIfStale() }
        .onChange(of: store.month) {
            Task { await store.loadSummaryIfStale() }
        }
    }
}

/// Money in, money out and saved, with the last twelve months as bars.
private struct MonthFiguresCard: View {
    let summary: CurrencySummary
    let ongoing: Bool
    let month: MonthKey

    @AppStorage(Preferences.hideAmountsKey) private var amountsHidden = false

    private var usual: Int { summary.averageIncome - summary.averageSpending }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                figure(
                    "Money in",
                    value: summary.income,
                    hint: ongoing ? "So far" : MoneyText.versusUsual(summary.income, usual: summary.averageIncome) ?? "Salary, Swish and more"
                )
                figure(
                    "Money out",
                    value: summary.spending,
                    hint: ongoing ? "So far" : MoneyText.versusUsual(summary.spending, usual: summary.averageSpending) ?? "Less refunds"
                )
                VStack(alignment: .leading, spacing: 4) {
                    Text(summary.net >= 0 ? "Saved" : "Overspent")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Theme.mutedForeground)
                    AmountText(minor: abs(summary.net), currency: summary.currency, compact: true)
                        .font(.headline)
                        .foregroundStyle(summary.net >= 0 ? Theme.positive : Theme.destructive)
                    HStack(spacing: 3) {
                        Text(usual >= 0 ? "Usually saves" : "Usually overspends")
                        AmountText(minor: abs(usual), currency: summary.currency, compact: true)
                    }
                    .font(.caption2)
                    .foregroundStyle(Theme.faintForeground)
                    .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if summary.months.count > 1 {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("The last 12 months")
                        Spacer()
                        legend("In", color: Theme.positive)
                        legend("Out", color: Theme.primary)
                    }
                    .font(.caption)
                    .foregroundStyle(Theme.mutedForeground)
                    bars
                        .frame(height: 120)
                        // The bars' heights would give the amounts away.
                        .blur(radius: amountsHidden ? 6 : 0)
                }
            }
        }
        .card(padding: 18)
    }

    private func figure(_ label: String, value: Int, hint: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption.weight(.medium))
                .foregroundStyle(Theme.mutedForeground)
            AmountText(minor: value, currency: summary.currency, compact: true)
                .font(.headline)
                .foregroundStyle(Theme.foreground)
            Text(hint)
                .font(.caption2)
                .foregroundStyle(Theme.faintForeground)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func legend(_ label: String, color: Color) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(label)
        }
    }

    /// Amounts stay off the axis, so nothing shows while they're hidden.
    private var bars: some View {
        Chart {
            ForEach(summary.months, id: \.self) { point in
                let key = MonthKey(year: point.year, month: point.month)
                let label = key.date.formatted(.dateTime.month(.narrow))
                BarMark(x: .value("Month", "\(point.year)-\(point.month)"), y: .value("Amount", point.income))
                    .position(by: .value("Kind", "In"))
                    .foregroundStyle(Theme.positive.opacity(key == month ? 1 : 0.4))
                    .annotation(position: .bottom, spacing: 4) {
                        if point == summary.months.first || key == month || point.month == 1 {
                            Text(label)
                                .font(.caption2)
                                .foregroundStyle(Theme.faintForeground)
                        }
                    }
                BarMark(x: .value("Month", "\(point.year)-\(point.month)"), y: .value("Amount", point.spending))
                    .position(by: .value("Kind", "Out"))
                    .foregroundStyle(Theme.primary.opacity(key == month ? 1 : 0.4))
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .accessibilityHidden(true)
    }
}

/// Where the money went, biggest first, the rest added up so the list stays short.
private struct CategoriesCard: View {
    let summary: CurrencySummary

    private static let shown = 6

    private var top: (shown: [API.SummaryCategory], rest: Int) {
        let categories = summary.categories
        guard categories.count > Self.shown + 1 else { return (categories, 0) }
        return (Array(categories.prefix(Self.shown)), categories.dropFirst(Self.shown).reduce(0) { $0 + $1.total })
    }

    var body: some View {
        let rows = top
        let largest = max(1, rows.shown.map(\.total).max() ?? 1)
        VStack(alignment: .leading, spacing: 12) {
            CardTitle(title: "Spending by category")
            ForEach(Array(rows.shown.enumerated()), id: \.offset) { _, category in
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        Circle()
                            .fill(Color(hexString: category.color) ?? Theme.faintForeground)
                            .frame(width: 8, height: 8)
                        Text(category.name)
                            .foregroundStyle(Theme.foreground)
                            .lineLimit(1)
                        Text("\(category.count)")
                            .monospacedDigit()
                            .foregroundStyle(Theme.faintForeground)
                        Spacer()
                        AmountText(minor: category.total, currency: summary.currency)
                            .fontWeight(.medium)
                            .foregroundStyle(Theme.foreground)
                    }
                    .font(.subheadline)
                    GeometryReader { proxy in
                        Capsule()
                            .fill(Color(hexString: category.color) ?? Theme.primary)
                            .frame(width: max(4, proxy.size.width * CGFloat(max(0, category.total)) / CGFloat(largest)))
                    }
                    .frame(height: 5)
                    .background(Theme.fill, in: Capsule())
                }
            }
            if rows.rest > 0 {
                HStack {
                    Text("Everything else")
                        .foregroundStyle(Theme.mutedForeground)
                    Spacer()
                    AmountText(minor: rows.rest, currency: summary.currency)
                        .foregroundStyle(Theme.mutedForeground)
                }
                .font(.subheadline)
            }
        }
        .card(padding: 18)
    }
}

/// The shops the most went to.
private struct MerchantsCard: View {
    let summary: CurrencySummary

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            CardTitle(title: "Biggest spending")
            ForEach(Array(summary.merchants.prefix(5).enumerated()), id: \.offset) { _, merchant in
                HStack(spacing: 8) {
                    Text(merchant.description)
                        .foregroundStyle(Theme.foreground)
                        .lineLimit(1)
                    Text(merchant.count == 1 ? "1 time" : "\(merchant.count) times")
                        .foregroundStyle(Theme.faintForeground)
                    Spacer()
                    AmountText(minor: merchant.total, currency: summary.currency)
                        .fontWeight(.medium)
                        .foregroundStyle(Theme.foreground)
                }
                .font(.subheadline)
            }
        }
        .card(padding: 18)
    }
}
