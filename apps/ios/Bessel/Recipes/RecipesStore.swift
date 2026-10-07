import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class RecipesStore {
    private(set) var recipes: [RecipeItem] = []
    private(set) var hasLoaded = false
    /// A change that didn't go through; shown as an alert.
    var errorMessage: String?
    /// A refresh that didn't go through; shown quietly over what's already there.
    var loadError: String?

    private let client: APIClient
    private let outbox: DeleteOutbox
    private let cache: ResponseCache
    @ObservationIgnored private var loads = LoadGeneration()
    @ObservationIgnored private let changes = SerialQueues<UUID>()
    private static let cacheKey = "recipes.v1"

    init(services: AppServices) {
        client = services.client
        outbox = services.outbox
        cache = services.cache
        if let saved = cache.load([RecipeItem].self, key: Self.cacheKey) {
            recipes = saved.filter { !outbox.pendingIDs.contains($0.id) }
            hasLoaded = true
        }
    }

    func recipe(_ id: UUID) -> RecipeItem? {
        recipes.first { $0.id == id }
    }

    func loadIfStale() async {
        guard loads.isStale(maxAge: AppServices.freshFor) else { return }
        await load()
    }

    func load() async {
        let ticket = loads.begin()
        defer { hasLoaded = true }
        do {
            let items: [RecipeItem] = try await client.getAllPages(
                "/v1/recipes",
                query: [URLQueryItem(name: "sorting", value: "title")]
            )
            guard loads.isCurrent(ticket) else { return }
            let pending = outbox.pendingIDs
            recipes = items.filter { !pending.contains($0.id) }
            loadError = nil
            loads.finish(ticket)
            cache.save(items, as: Self.cacheKey)
        } catch {
            guard loads.isCurrent(ticket), !error.isCancellation else { return }
            loadError = error.userMessage
        }
    }

    func create(_ draft: RecipeCreate) async throws -> RecipeItem {
        loads.invalidate()
        let created: RecipeItem = try await client.post("/v1/recipes", body: draft)
        withAnimation(.snappy) {
            recipes.append(created)
            recipes.sort { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        }
        return created
    }

    func update(_ recipe: RecipeItem, with update: RecipeUpdate) async throws {
        loads.invalidate()
        let updated: RecipeItem = try await changes.run(recipe.id) { [client] in
            try await client.patch("/v1/recipes/\(recipe.id)", body: update)
        }
        if let index = recipes.firstIndex(where: { $0.id == updated.id }) {
            recipes[index] = updated
        }
    }

    /// Turns pasted text from anywhere into a structured recipe draft. A model
    /// call on the server, so it gets longer than usual to answer.
    func structure(_ text: String) async throws -> RecipeImportResult {
        try await client.post("/v1/recipes/import", body: RecipeImportRequest(text: text), timeout: APIClient.slowRequestTimeout)
    }

    /// Hides the recipe now and deletes it after the undo window.
    func delete(_ recipe: RecipeItem, toasts: ToastCenter) {
        loads.invalidate()
        withAnimation(.snappy) { recipes.removeAll { $0.id == recipe.id } }
        outbox.schedule(recipe.id, path: "/v1/recipes/\(recipe.id)")
        toasts.show("Recipe deleted") { [weak self] in
            guard let self, outbox.cancel(recipe.id) else { return }
            withAnimation(.snappy) {
                self.recipes.append(recipe)
                self.recipes.sort { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
            }
        }
    }
}
