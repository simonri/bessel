import SwiftUI

/// Net worth per currency, the accounts that need you, then every account by
/// what it's for. Tapping one opens its transactions.
struct AccountsPage<Header: View>: View {
    let store: MoneyStore
    let isActive: Bool
    @ViewBuilder let header: Header
    let onOpen: (MoneyAccount) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if !store.hasLoadedOverview {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                } else if store.accounts.isEmpty {
                    EmptyState(emoji: "🏦", title: "No accounts yet", detail: "Add your bank on the web or desktop app and your balances show up here.")
                        .padding(.top, 40)
                } else {
                    ForEach(store.netWorth) { worth in
                        NetWorthCard(worth: worth)
                    }
                    NeedsAttentionCard(accounts: store.accountsNeedingYou)
                    ForEach(AccountKind.allCases) { kind in
                        let accounts = store.accounts.filter { $0.kind == kind }
                        if !accounts.isEmpty {
                            AccountGroup(kind: kind, accounts: accounts, onOpen: onOpen)
                        }
                    }
                }
            }
            .padding(.top, Theme.pageTop)
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
            .animation(.snappy, value: store.overview)
        }
        .contentMargins(.bottom, 80, for: .scrollContent)
        .refreshable { await store.loadOverview() }
        .refreshWhileVisible(isActive) { await store.loadOverviewIfStale() }
    }
}

/// One currency's net worth, split into the company's, your own and what's owed.
private struct NetWorthCard: View {
    let worth: NetWorth

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                CardTitle(title: worth.currency == "SEK" ? "Net worth" : "Net worth in \(worth.currency)")
                AmountText(minor: worth.net, currency: worth.currency)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(Theme.foreground)
            }
            VStack(spacing: 10) {
                if let company = worth.company {
                    share("Company", total: company)
                }
                if let personal = worth.personal {
                    share("You", total: personal)
                }
                if worth.owed > 0 {
                    HStack {
                        Text("Owed")
                            .foregroundStyle(Theme.mutedForeground)
                        Spacer()
                        AmountText(minor: -worth.owed, currency: worth.currency, compact: true)
                            .foregroundStyle(Theme.destructive)
                    }
                    .font(.subheadline)
                }
            }
        }
        .card(padding: 18)
    }

    private func share(_ label: String, total: MoneyTotal) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(label)
                    .foregroundStyle(Theme.mutedForeground)
                Spacer()
                AmountText(minor: total.cash + total.investments, currency: total.currency, compact: true)
                    .fontWeight(.medium)
                    .foregroundStyle(Theme.foreground)
            }
            .font(.subheadline)
            if total.investments != 0 {
                HStack(spacing: 4) {
                    AmountText(minor: total.cash, currency: total.currency, compact: true)
                    Text("cash -")
                    AmountText(minor: total.investments, currency: total.currency, compact: true)
                    Text("invested")
                }
                .font(.caption)
                .foregroundStyle(Theme.faintForeground)
            }
        }
    }
}

/// Accounts with a sync problem, or a line saying all is well. Fixing one
/// means signing in to the bank, which happens on the web or desktop.
private struct NeedsAttentionCard: View {
    let accounts: [MoneyAccount]

    var body: some View {
        if accounts.isEmpty {
            HStack(spacing: 12) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(Theme.positive)
                VStack(alignment: .leading, spacing: 2) {
                    Text("All up to date")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.foreground)
                    Text("Every account is importing as it should.")
                        .font(.caption)
                        .foregroundStyle(Theme.mutedForeground)
                }
            }
            .card()
        } else {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading(title: "Needs attention", count: accounts.count, tint: Theme.warning)
                ForEach(accounts) { account in
                    HStack(spacing: 12) {
                        AccountLogo(account: account, size: 32)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(account.name)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(Theme.foreground)
                                .lineLimit(1)
                            Text(account.problemTitle ?? "")
                                .font(.caption)
                                .foregroundStyle(Theme.warning)
                            if let issue = account.source.issue, issue.kind == "balance_mismatch", let sourceBalance = issue.sourceBalance {
                                HStack(spacing: 4) {
                                    Text("\(account.source.label) says")
                                    AmountText(minor: sourceBalance, currency: account.currency)
                                }
                                .font(.caption)
                                .foregroundStyle(Theme.mutedForeground)
                            }
                        }
                    }
                }
                Text("Open Bessel on the web or desktop to fix these.")
                    .font(.caption)
                    .foregroundStyle(Theme.faintForeground)
            }
            .card()
        }
    }
}

/// One kind of account with what they add up to, per currency.
private struct AccountGroup: View {
    let kind: AccountKind
    let accounts: [MoneyAccount]
    let onOpen: (MoneyAccount) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                SectionHeading(title: kind.label)
                Spacer()
                HStack(spacing: 4) {
                    ForEach(Array(accounts.totalsByCurrency().enumerated()), id: \.offset) { index, total in
                        if index > 0 { Text("+") }
                        AmountText(minor: total.total, currency: total.currency)
                    }
                }
                .font(.caption)
                .foregroundStyle(Theme.mutedForeground)
            }
            .padding(.horizontal, 4)
            VStack(spacing: 0) {
                ForEach(accounts) { account in
                    Button { onOpen(account) } label: {
                        AccountRow(account: account)
                    }
                    .buttonStyle(.plain)
                    if account.id != accounts.last?.id {
                        Divider()
                            .overlay(Theme.border)
                            .padding(.leading, 68)
                    }
                }
            }
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }
}

private struct AccountRow: View {
    let account: MoneyAccount

    private var needsYou: Bool { account.source.issue != nil }

    var body: some View {
        HStack(spacing: 12) {
            AccountLogo(account: account)
            VStack(alignment: .leading, spacing: 3) {
                Text(account.name)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Theme.foreground)
                    .lineLimit(1)
                HStack(spacing: 5) {
                    Text(account.typeLabel)
                        .lineLimit(1)
                    Text("-")
                    Circle()
                        .fill(needsYou ? Theme.warning : Theme.positive)
                        .frame(width: 6, height: 6)
                    Text(needsYou ? "Needs you" : "Up to date")
                        .foregroundStyle(needsYou ? Theme.warning : Theme.mutedForeground)
                }
                .font(.caption)
                .foregroundStyle(Theme.mutedForeground)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                AmountText(minor: account.value, currency: account.currency)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(account.includeInNetWorth ? Theme.foreground : Theme.mutedForeground)
                if !account.includeInNetWorth {
                    Text("Not in net worth")
                        .font(.caption2)
                        .foregroundStyle(Theme.faintForeground)
                }
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.faintForeground)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}
