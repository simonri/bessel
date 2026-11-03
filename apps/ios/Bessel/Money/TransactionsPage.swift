import SwiftUI

/// A month's transactions by day, or every month's while searching, for all
/// accounts or one. Tapping one opens it, where its category can be changed.
struct TransactionsPage<Header: View>: View {
    let money: MoneyStore
    @Bindable var store: TransactionsStore
    let isActive: Bool
    @Binding var accountID: UUID?
    @ViewBuilder let header: Header

    @State private var search = ""
    /// The search once typing pauses, so each key doesn't send a request.
    @State private var appliedSearch = ""
    @State private var selected: SelectedTransaction?

    private var filter: TransactionFilter {
        TransactionFilter(month: money.month, accountID: accountID, search: appliedSearch)
    }

    private var isSearching: Bool { !filter.trimmedSearch.isEmpty }

    var body: some View {
        List {
            if store.failedFilter == filter, !store.hasLoaded(filter) {
                Section {
                    EmptyState(emoji: "📡", title: "Couldn't load transactions", detail: "Pull down to try again.")
                        .padding(.vertical, 40)
                        .listRowBackground(Color.clear)
                }
            }
            if store.hasLoaded(filter) {
                if store.transactions.isEmpty {
                    Section {
                        emptyState
                            .padding(.vertical, 40)
                            .listRowBackground(Color.clear)
                    }
                }
                ForEach(store.days) { day in
                    Section {
                        ForEach(day.transactions) { transaction in
                            Button {
                                selected = SelectedTransaction(id: transaction.id)
                            } label: {
                                TransactionRow(
                                    transaction: transaction,
                                    category: money.category(transaction.categoryId),
                                    accountName: accountID == nil ? money.account(transaction.bankAccountId)?.name : nil
                                )
                            }
                            .buttonStyle(.plain)
                            .listRowBackground(Theme.card)
                            .listRowSeparatorTint(Theme.border)
                        }
                    } header: {
                        SectionHeading(title: MoneyText.dayTitle(day.day))
                    }
                }
                if store.transactions.count >= 300, isSearching {
                    Section {
                    } footer: {
                        Text("Showing the newest matches. Narrow the search to find older ones.")
                            .font(.footnote)
                            .foregroundStyle(Theme.faintForeground)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(18)
        .contentMargins(.top, 0, for: .scrollContent)
        .contentMargins(.bottom, 80, for: .scrollContent)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.immediately)
        .refreshable { await store.load(filter) }
        .stickyHeader {
            VStack(alignment: .leading, spacing: 12) {
                header
                if !isSearching {
                    MonthPager(month: money.month) { money.step($0) }
                }
                HStack(spacing: 8) {
                    searchField
                    accountMenu
                }
                if let accountID {
                    Chip(text: money.account(accountID)?.name ?? "One account", hue: PastelHue.forName("account"), systemImage: "xmark")
                        .onTapGesture { withAnimation(.snappy) { self.accountID = nil } }
                        .accessibilityAddTraits(.isButton)
                        .accessibilityLabel("Show all accounts")
                }
            }
        }
        .background(Theme.background)
        .overlay {
            if !store.hasLoaded(filter), store.failedFilter != filter { ProgressView() }
        }
        .sheet(item: $selected) { selection in
            TransactionDetailView(store: store, money: money, transactionID: selection.id)
        }
        .task(id: search) {
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            appliedSearch = search
        }
        .onChange(of: filter) { _, new in
            Task { await store.loadIfStale(new) }
        }
        .refreshWhileVisible(isActive) {
            await money.loadOverviewIfStale()
            await store.loadIfStale(filter)
        }
        .loadErrorToast($store.loadError, isActive: isActive) { await store.retry() }
    }

    /// In the page rather than `.searchable`, like Contacts.
    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Theme.mutedForeground)
            TextField("Search all months", text: $search)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !search.isEmpty {
                Button {
                    search = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(Theme.faintForeground)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 44)
        .background(Theme.fill, in: Capsule())
    }

    private var accountMenu: some View {
        Menu {
            Button {
                accountID = nil
            } label: {
                if accountID == nil {
                    Label("All accounts", systemImage: "checkmark")
                } else {
                    Text("All accounts")
                }
            }
            ForEach(money.accounts) { account in
                Button {
                    accountID = account.id
                } label: {
                    if accountID == account.id {
                        Label(account.name, systemImage: "checkmark")
                    } else {
                        Text(account.name)
                    }
                }
            }
        } label: {
            Image(systemName: accountID == nil ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.foreground)
                .frame(width: 44, height: 44)
                .background(Theme.fill, in: Circle())
        }
        .accessibilityLabel("Filter by account")
    }

    @ViewBuilder
    private var emptyState: some View {
        if isSearching {
            EmptyState(emoji: "🔍", title: "No matches", detail: "Try part of a shop's name as the bank writes it.")
        } else {
            EmptyState(emoji: "🧾", title: "Nothing in \(money.month.title)", detail: "Transactions show up here once your banks have sent them.")
        }
    }
}

private struct SelectedTransaction: Identifiable {
    let id: UUID
}

private struct TransactionRow: View {
    let transaction: MoneyTransaction
    let category: MoneyCategory?
    let accountName: String?

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(category?.tint ?? Theme.faintForeground)
                .frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 3) {
                Text(transaction.displayName)
                    .font(.body.weight(.medium))
                    .foregroundStyle(Theme.foreground)
                    .lineLimit(1)
                HStack(spacing: 5) {
                    Text(transaction.filedAs(category))
                        .lineLimit(1)
                    if let accountName {
                        Text("-")
                        Text(accountName)
                            .lineLimit(1)
                    }
                    if transaction.documentCount > 0 {
                        Image(systemName: "paperclip")
                            .accessibilityLabel("Has a receipt")
                    }
                }
                .font(.caption)
                .foregroundStyle(Theme.mutedForeground)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                AmountText(minor: transaction.signedAmount, currency: transaction.currency, sign: true, exact: true)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(transaction.direction == .credit ? Theme.positive : Theme.foreground)
                if transaction.isCompanyMoney {
                    Text("Company")
                        .font(.caption2)
                        .foregroundStyle(Theme.faintForeground)
                }
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }
}

// MARK: - Detail

struct TransactionDetailView: View {
    @Bindable var store: TransactionsStore
    let money: MoneyStore
    let transactionID: UUID

    @Environment(\.dismiss) private var dismiss
    @State private var documents: [MoneyDocument] = []

    var body: some View {
        NavigationStack {
            if let transaction = store.transaction(transactionID) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        header(transaction)
                        details(transaction)
                        if !documents.isEmpty {
                            receipts
                        }
                    }
                    .padding(16)
                }
                .background(Theme.background)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                            .fontWeight(.semibold)
                    }
                }
                .task { documents = await store.documents(for: transaction) }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationCornerRadius(28)
        .alert("Something went wrong", isPresented: errorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(store.errorMessage ?? "")
        }
    }

    private func header(_ transaction: MoneyTransaction) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            AmountText(minor: transaction.signedAmount, currency: transaction.currency, sign: true, exact: true)
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(transaction.direction == .credit ? Theme.positive : Theme.foreground)
            Text(transaction.displayName)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Theme.foreground)
            Text(transaction.transactionDate.formatted(.dateTime.weekday(.wide).day().month(.wide).year()))
                .font(.subheadline)
                .foregroundStyle(Theme.mutedForeground)
        }
    }

    private func details(_ transaction: MoneyTransaction) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            row("Category") {
                if transaction.takesCategory {
                    categoryMenu(transaction)
                } else {
                    Text(transaction.filedAs(nil))
                        .foregroundStyle(Theme.foreground)
                }
            }
            if let account = money.account(transaction.bankAccountId) {
                divider
                row("Account") {
                    Text(account.name)
                        .foregroundStyle(Theme.foreground)
                        .lineLimit(1)
                }
            }
            if transaction.isCompanyMoney {
                divider
                row("Belongs to") {
                    Text("The company")
                        .foregroundStyle(Theme.foreground)
                }
            }
            if let description = transaction.description, description != transaction.displayName {
                divider
                row("From the bank") {
                    Text(description)
                        .foregroundStyle(Theme.foreground)
                        .multilineTextAlignment(.trailing)
                }
            }
            if let note = transaction.note, !note.isEmpty {
                divider
                VStack(alignment: .leading, spacing: 4) {
                    Text("Note")
                        .foregroundStyle(Theme.mutedForeground)
                    Text(note)
                        .foregroundStyle(Theme.foreground)
                }
                .font(.subheadline)
                .padding(.vertical, 12)
            }
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func row<Value: View>(_ label: String, @ViewBuilder value: () -> Value) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label)
                .foregroundStyle(Theme.mutedForeground)
            Spacer(minLength: 8)
            value()
        }
        .font(.subheadline)
        .padding(.vertical, 12)
    }

    private var divider: some View {
        Divider().overlay(Theme.border)
    }

    private func categoryMenu(_ transaction: MoneyTransaction) -> some View {
        Menu {
            categoryButton("No category", id: nil, transaction: transaction)
            ForEach(CategoryGroup.tree(money.categories)) { group in
                if group.children.isEmpty {
                    categoryButton(group.parent.name, id: group.parent.id, transaction: transaction)
                } else {
                    Menu(group.parent.name) {
                        categoryButton(group.parent.name, id: group.parent.id, transaction: transaction)
                        ForEach(group.children) { child in
                            categoryButton(child.name, id: child.id, transaction: transaction)
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 6) {
                if let category = money.category(transaction.categoryId) {
                    Circle()
                        .fill(category.tint)
                        .frame(width: 8, height: 8)
                }
                Text(transaction.filedAs(money.category(transaction.categoryId)))
                    .foregroundStyle(Theme.foreground)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Theme.faintForeground)
            }
        }
        .accessibilityLabel("Change category")
    }

    private func categoryButton(_ title: String, id: UUID?, transaction: MoneyTransaction) -> some View {
        Button {
            guard id != transaction.categoryId else { return }
            Task {
                if await store.setCategory(transaction, to: id) {
                    money.transactionsChanged()
                }
            }
        } label: {
            if id == transaction.categoryId {
                Label(title, systemImage: "checkmark")
            } else {
                Text(title)
            }
        }
    }

    private var receipts: some View {
        VStack(alignment: .leading, spacing: 10) {
            CardTitle(title: documents.count == 1 ? "Receipt" : "Receipts")
            ScrollView(.horizontal) {
                HStack(spacing: 10) {
                    ForEach(documents) { document in
                        DocumentThumbnail(store: store, document: document)
                    }
                }
            }
            .scrollIndicators(.hidden)
            .contentMargins(.all, 0, for: .scrollContent)
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )
    }
}

/// A receipt's first page, small. Blurred with the amounts, since it shows them too.
private struct DocumentThumbnail: View {
    let store: TransactionsStore
    let document: MoneyDocument

    @State private var image: UIImage?
    @AppStorage(Preferences.hideAmountsKey) private var amountsHidden = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Group {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .blur(radius: amountsHidden ? 8 : 0)
                } else {
                    Image(systemName: document.contentType == "application/pdf" ? "doc.text" : "photo")
                        .font(.system(size: 26))
                        .foregroundStyle(Theme.faintForeground)
                }
            }
            .frame(width: 96, height: 128)
            .background(Theme.fill)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            Text(document.filename)
                .font(.caption2)
                .foregroundStyle(Theme.mutedForeground)
                .lineLimit(1)
                .frame(width: 96, alignment: .leading)
        }
        .task { image = await store.thumbnail(document) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(document.filename)
    }
}
