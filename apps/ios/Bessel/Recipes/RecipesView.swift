import SwiftUI

struct RecipesView: View {
    let auth: AuthSession

    @State private var store: RecipesStore
    @State private var search = ""
    @State private var path = NavigationPath()

    init(auth: AuthSession) {
        self.auth = auth
        _store = State(initialValue: RecipesStore(client: APIClient(auth: auth)))
    }

    private var filtered: [RecipeItem] {
        guard !search.isEmpty else { return store.recipes }
        return store.recipes.filter { $0.title.localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        NavigationStack(path: $path) {
            content
                .background(Theme.background)
                .navigationTitle("Recipes")
                .navigationBarTitleDisplayMode(.inline)
                .searchable(text: $search, prompt: "Search recipes")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(action: createRecipe) {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("New recipe")
                    }
                }
                .navigationDestination(for: RecipeItem.self) { recipe in
                    RecipeDetailView(store: store, recipe: recipe)
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

    @ViewBuilder
    private var content: some View {
        if !store.hasLoaded {
            ProgressView()
                .tint(Theme.mutedForeground)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            List {
                ForEach(filtered) { recipe in
                    NavigationLink(value: recipe) {
                        row(recipe)
                    }
                    .listRowBackground(Theme.background)
                    .listRowSeparatorTint(Theme.border)
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Task { await store.delete(recipe) }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .overlay {
                if filtered.isEmpty {
                    emptyState
                }
            }
        }
    }

    private func row(_ recipe: RecipeItem) -> some View {
        HStack(spacing: 8) {
            Text(recipe.title.isEmpty ? "Untitled" : recipe.title)
                .font(.subheadline)
                .foregroundStyle(Theme.foreground)
                .lineLimit(1)
            if recipe.recipeType != .other {
                Text(recipe.recipeType.label)
                    .font(.caption2)
                    .foregroundStyle(Theme.mutedForeground)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .overlay(
                        Capsule().stroke(Theme.border, lineWidth: 1)
                    )
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "book")
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(Theme.mutedForeground.opacity(0.4))
            VStack(spacing: 4) {
                Text(search.isEmpty ? "No recipes yet" : "No matches")
                    .font(.body.weight(.medium))
                    .foregroundStyle(Theme.foreground)
                if search.isEmpty {
                    Text("Add one with the + button.")
                        .font(.footnote)
                        .foregroundStyle(Theme.mutedForeground)
                }
            }
        }
        .allowsHitTesting(false)
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )
    }

    private func createRecipe() {
        Task {
            if let created = await store.create(RecipeCreate(title: "Untitled")) {
                path.append(created)
            }
        }
    }
}
