import Foundation
import Observation

@MainActor
@Observable
final class RecipesStore {
    private(set) var recipes: [RecipeItem] = []
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    var errorMessage: String?

    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func load() async {
        isLoading = true
        defer {
            isLoading = false
            hasLoaded = true
        }
        do {
            let response: RecipeListResponse = try await client.get(
                "/v1/recipes",
                query: [
                    URLQueryItem(name: "sorting", value: "title"),
                    URLQueryItem(name: "limit", value: "200"),
                ]
            )
            recipes = response.items
        } catch {
            report(error)
        }
    }

    @discardableResult
    func create(_ draft: RecipeCreate) async -> RecipeItem? {
        do {
            let created: RecipeItem = try await client.post("/v1/recipes", body: draft)
            recipes.append(created)
            recipes.sort { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
            return created
        } catch {
            report(error)
            return nil
        }
    }

    func update(_ recipe: RecipeItem, with update: RecipeUpdate) async {
        do {
            let updated: RecipeItem = try await client.patch("/v1/recipes/\(recipe.id)", body: update)
            if let index = recipes.firstIndex(where: { $0.id == updated.id }) {
                recipes[index] = updated
            }
        } catch {
            report(error)
        }
    }

    func delete(_ recipe: RecipeItem) async {
        recipes.removeAll { $0.id == recipe.id }
        do {
            try await client.deleteNoContent("/v1/recipes/\(recipe.id)")
        } catch {
            report(error)
            await load()
        }
    }

    private func report(_ error: Error) {
        if error is CancellationError { return }
        errorMessage = error.localizedDescription
    }
}
