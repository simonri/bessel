import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class RecipesStore {
    private(set) var recipes: [RecipeItem] = []
    private(set) var hasLoaded = false
    var errorMessage: String?

    private let client: APIClient
    private var pendingDeletes: [UUID: Task<Void, Never>] = [:]

    init(client: APIClient) {
        self.client = client
    }

    func recipe(_ id: UUID) -> RecipeItem? {
        recipes.first { $0.id == id }
    }

    func load() async {
        defer { hasLoaded = true }
        do {
            let response: RecipeListResponse = try await client.get(
                "/v1/recipes",
                query: [
                    URLQueryItem(name: "sorting", value: "title"),
                    URLQueryItem(name: "limit", value: "200"),
                ]
            )
            recipes = response.items.filter { pendingDeletes[$0.id] == nil }
        } catch {
            report(error)
        }
    }

    func create(_ draft: RecipeCreate) async throws -> RecipeItem {
        let created: RecipeItem = try await client.post("/v1/recipes", body: draft)
        withAnimation(.snappy) {
            recipes.append(created)
            recipes.sort { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        }
        return created
    }

    func update(_ recipe: RecipeItem, with update: RecipeUpdate) async throws {
        let updated: RecipeItem = try await client.patch("/v1/recipes/\(recipe.id)", body: update)
        if let index = recipes.firstIndex(where: { $0.id == updated.id }) {
            recipes[index] = updated
        }
    }

    /// Turns pasted text from anywhere into a structured recipe draft.
    func structure(_ text: String) async throws -> RecipeImportResult {
        try await client.post("/v1/recipes/import", body: RecipeImportRequest(text: text))
    }

    /// Hides the recipe now and deletes it after the undo window.
    func delete(_ recipe: RecipeItem, toasts: ToastCenter) {
        withAnimation(.snappy) { recipes.removeAll { $0.id == recipe.id } }
        pendingDeletes[recipe.id] = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4.5))
            guard !Task.isCancelled, let self else { return }
            pendingDeletes[recipe.id] = nil
            do {
                try await client.deleteNoContent("/v1/recipes/\(recipe.id)")
            } catch {
                report(error)
                await load()
            }
        }
        toasts.show("Recipe deleted") { [weak self] in
            guard let self else { return }
            pendingDeletes.removeValue(forKey: recipe.id)?.cancel()
            withAnimation(.snappy) {
                self.recipes.append(recipe)
                self.recipes.sort { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
            }
        }
    }

    private func report(_ error: Error) {
        if error is CancellationError { return }
        errorMessage = error.localizedDescription
    }
}
