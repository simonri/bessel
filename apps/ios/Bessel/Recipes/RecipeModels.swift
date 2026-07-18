import Foundation

enum RecipeType: String, Codable, CaseIterable, Identifiable {
    case dessert
    case main
    case other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .dessert: "Dessert"
        case .main: "Main"
        case .other: "Other"
        }
    }
}

struct RecipeItem: Codable, Identifiable, Hashable {
    let id: UUID
    let createdAt: Date
    let modifiedAt: Date?
    var title: String
    var content: String
    var recipeType: RecipeType
}

struct RecipeCreate: Encodable {
    var title: String
    var content: String = ""
    var recipeType: RecipeType = .other

    enum CodingKeys: String, CodingKey {
        case title, content
        case recipeType = "recipe_type"
    }
}

struct RecipeUpdate: Encodable {
    var title: String?
    var content: String?
    var recipeType: RecipeType?

    enum CodingKeys: String, CodingKey {
        case title, content
        case recipeType = "recipe_type"
    }
}

struct RecipeListResponse: Decodable {
    let items: [RecipeItem]
    let pagination: Pagination

    struct Pagination: Decodable {
        let totalCount: Int
        let maxPage: Int
    }
}
