import SwiftUI

struct RecipesView: View {
    let auth: AuthSession

    @State private var store: RecipesStore
    @State private var search = ""
    @State private var typeFilter: RecipeType?
    @State private var path: [UUID] = []
    @State private var sheet: RecipeSheet?
    @State private var composing = false
    @State private var draftTitle = ""
    @State private var draftType: RecipeType = .main
    @FocusState private var composerFocused: Bool
    @Environment(ToastCenter.self) private var toasts

    init(auth: AuthSession) {
        self.auth = auth
        _store = State(initialValue: RecipesStore(client: APIClient(auth: auth)))
    }

    private var filtered: [RecipeItem] {
        store.recipes.filter { recipe in
            if let typeFilter, recipe.recipeType != typeFilter { return false }
            guard !search.isEmpty else { return true }
            return recipe.title.localizedCaseInsensitiveContains(search)
                || recipe.body.ingredientGroups.contains { group in
                    group.items.contains { $0.name.localizedCaseInsensitiveContains(search) }
                }
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    searchField
                    filters
                    if store.hasLoaded {
                        if filtered.isEmpty {
                            emptyState
                                .padding(.top, 60)
                        } else {
                            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                                ForEach(filtered) { recipe in
                                    NavigationLink(value: recipe.id) {
                                        RecipeCard(recipe: recipe)
                                    }
                                    .buttonStyle(.plain)
                                    .contextMenu {
                                        Button(role: .destructive) {
                                            store.delete(recipe, toasts: toasts)
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.top, Theme.pageTop)
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.immediately)
            .contentMargins(.bottom, 80, for: .scrollContent)
            .background(Theme.background)
            .overlay {
                if !store.hasLoaded { ProgressView() }
            }
            .overlay {
                // While composing, a tap anywhere outside the card just closes it.
                if composing {
                    Color.clear
                        .contentShape(Rectangle())
                        .onTapGesture {
                            composerFocused = false
                            withAnimation(.snappy) { composing = false }
                        }
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if !composing {
                    FloatingAddButton(label: "New recipe") {
                        withAnimation(.snappy) { composing = true }
                    }
                    .padding(.trailing, 16)
                    .padding(.bottom, 12)
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .safeAreaInset(edge: .bottom) {
                if composing {
                    recipeComposer
                        .padding(.horizontal, 10)
                        .padding(.bottom, 8)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .onChange(of: composerFocused) { _, focused in
                if !focused { withAnimation(.snappy) { composing = false } }
            }
            .navigationTitle("Recipes")
            .toolbarTitleDisplayMode(.inlineLarge)
            .toolbar {
                ProfileToolbarItem(auth: auth)
            }
            .navigationDestination(for: UUID.self) { id in
                RecipeDetailView(store: store, recipeID: id)
            }
            .sheet(item: $sheet) { sheet in
                switch sheet {
                case .paste:
                    RecipePasteView(store: store) { created in path.append(created.id) }
                case .scratch:
                    RecipeEditorView(store: store, recipe: nil, draft: composedDraft) { created in
                        draftTitle = ""
                        path.append(created.id)
                    }
                }
            }
            .alert("Something went wrong", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(store.errorMessage ?? "")
            }
            .task { await store.load() }
            .refreshable { await store.load() }
        }
    }

    /// Name a recipe and pick its type; sending opens the editor to fill it in.
    private var recipeComposer: some View {
        Composer(placeholder: "Recipe name", text: $draftTitle, isFocused: $composerFocused, onSubmit: startRecipe) {
            ForEach(RecipeType.allCases) { type in
                Button {
                    withAnimation(.snappy) { draftType = type }
                } label: {
                    Chip(text: "\(type.emoji) \(type.label)", hue: type.hue, isSelected: draftType == type)
                }
                .buttonStyle(.plain)
            }
            Button {
                composerFocused = false
                sheet = .paste
            } label: {
                Chip(text: "Paste", hue: 235, systemImage: "doc.on.clipboard", isSelected: false)
            }
            .buttonStyle(.plain)
        }
    }

    /// What the editor starts from: the composed name and type, or blank.
    private var composedDraft: RecipeImportResult? {
        let title = draftTitle.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return nil }
        return RecipeImportResult(title: title, recipeType: draftType, body: RecipeBody())
    }

    private func startRecipe() {
        guard composedDraft != nil else { return }
        composerFocused = false
        sheet = .scratch
    }

    /// In the page rather than `.searchable`, whose bar sits flush under the title.
    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Theme.mutedForeground)
            TextField("Search recipes or ingredients", text: $search)
                .submitLabel(.search)
                .autocorrectionDisabled()
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

    private var filters: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                FilterPill(title: "All", isSelected: typeFilter == nil) {
                    withAnimation(.snappy) { typeFilter = nil }
                }
                ForEach(RecipeType.allCases) { type in
                    FilterPill(title: "\(type.emoji) \(type.plural)", isSelected: typeFilter == type) {
                        withAnimation(.snappy) { typeFilter = typeFilter == type ? nil : type }
                    }
                }
                if filtered.count > 1 {
                    FilterPill(title: "🎲 Surprise me", isSelected: false) {
                        if let pick = filtered.randomElement() { path.append(pick.id) }
                    }
                }
            }
        }
        .scrollIndicators(.hidden)
    }

    @ViewBuilder
    private var emptyState: some View {
        if store.recipes.isEmpty {
            VStack(spacing: 16) {
                EmptyState(emoji: "🍳", title: "What are we cooking?", detail: "Paste a recipe from anywhere and Bessel tidies it into ingredients and steps.")
                Button("Paste a recipe") { sheet = .paste }
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 22)
                    .frame(height: 46)
                    .background(Theme.primary, in: Capsule())
            }
        } else {
            EmptyState(emoji: "🔍", title: "No matches", detail: "Try another word or filter.")
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )
    }
}

enum RecipeSheet: String, Identifiable {
    case paste, scratch
    var id: String { rawValue }
}

private struct RecipeCard: View {
    let recipe: RecipeItem

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack {
                LinearGradient(
                    colors: [Theme.pastelWash(recipe.recipeType.hue, strength: 1.6), Theme.pastelWash(recipe.recipeType.hue + 40, strength: 0.8)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Text(recipe.recipeType.emoji)
                    .font(.system(size: 44))
            }
            .frame(height: 104)

            VStack(alignment: .leading, spacing: 4) {
                Text(recipe.title.isEmpty ? "Untitled" : recipe.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.foreground)
                    .lineLimit(2, reservesSpace: true)
                    .multilineTextAlignment(.leading)
                Text(meta)
                    .font(.caption)
                    .foregroundStyle(Theme.mutedForeground)
                    .lineLimit(1)
            }
            .padding(12)
        }
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var meta: String {
        var parts: [String] = []
        if let minutes = recipe.body.totalMinutes {
            parts.append(RecipeDetailView.minutesLabel(minutes))
        }
        if recipe.ingredientCount > 0 {
            parts.append("\(recipe.ingredientCount) ingredients")
        } else if !recipe.body.steps.isEmpty {
            parts.append("\(recipe.body.steps.count) steps")
        }
        return parts.isEmpty ? recipe.recipeType.label : parts.joined(separator: " · ")
    }
}
