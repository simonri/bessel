import Foundation

// The API's place types, generated from its spec (Bessel/API/Generated).
typealias PlaceStatus = API.PlaceStatus
typealias PlaceItem = API.PlaceSchema
typealias PlaceListResponse = API.PlaceListResponse
typealias PlaceCreate = API.PlaceCreate
typealias PlaceUpdate = API.PlaceUpdate

extension PlaceStatus: Identifiable {
    var id: String { rawValue }

    var label: String {
        switch self {
        case .wantToGo: "Want to go"
        case .visited: "Been there"
        case .unknown: "Other"
        }
    }
}

extension PlaceItem: Identifiable {
    /// "Copenhagen" out of "Refshalevej 96, Copenhagen".
    var city: String? {
        address?.split(separator: ",").last.map { $0.trimmingCharacters(in: .whitespaces) }
    }
}

extension PlaceUpdate {
    /// The personal part of a place. Always sent whole, with explicit nulls, so
    /// moving a place back to "Want to go" clears its rating and visit date.
    static func visit(status: PlaceStatus, rating: Int?, visitedAt: Date?, review: String?) -> PlaceUpdate {
        PlaceUpdate(status: status, rating: .some(rating), visitedAt: .some(visitedAt), review: .some(review))
    }
}

/// Friendly emoji and pastel hue per place category (the API's canonical
/// categories, e.g. restaurant, cafe, museum).
enum PlaceCategory {
    static func emoji(_ category: String?) -> String {
        switch category {
        case "restaurant": "🍽️"
        case "cafe": "☕️"
        case "bakery": "🥐"
        case "bar": "🍸"
        case "nightclub": "🪩"
        case "museum": "🖼️"
        case "gallery": "🎨"
        case "theater": "🎭"
        case "park": "🌳"
        case "beach": "🏖️"
        case "hotel": "🛏️"
        case "market": "🧺"
        case "shopping": "🛍️"
        case "church", "temple": "⛪️"
        case "landmark": "🗼"
        case "spa", "gym": "🧖‍♀️"
        default: "📍"
        }
    }

    static func hue(_ category: String?) -> Double {
        PastelHue.forName(category ?? "place")
    }

    static func label(_ category: String?) -> String? {
        category.map { $0.replacingOccurrences(of: "_", with: " ").capitalized }
    }
}
