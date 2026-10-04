import Foundation

enum PlaceStatus: String, Codable, CaseIterable, Identifiable {
    case wantToGo = "want_to_go"
    case visited

    var id: String { rawValue }

    var label: String {
        switch self {
        case .wantToGo: "Want to go"
        case .visited: "Been there"
        }
    }
}

struct PlaceItem: Decodable, Identifiable, Hashable {
    let id: UUID
    let createdAt: Date
    var name: String
    var address: String?
    var country: String?
    var latitude: Double
    var longitude: Double
    var status: PlaceStatus
    var rating: Int?
    var visitedAt: Date?
    var review: String?
    var category: String?
    var website: String?
    var phone: String?

    /// "Copenhagen" out of "Refshalevej 96, Copenhagen".
    var city: String? {
        address?.split(separator: ",").last.map { $0.trimmingCharacters(in: .whitespaces) }
    }
}

struct PlaceListResponse: Decodable {
    let items: [PlaceItem]
}

struct PlaceCreate: Encodable {
    var name: String
    var address: String?
    var country: String?
    var latitude: Double
    var longitude: Double
    var status: PlaceStatus
    var category: String?
    var website: String?
    var phone: String?
}

/// The personal part of a place. Always sent whole, with explicit nulls, so
/// moving a place back to "Want to go" clears its rating and visit date.
struct PlaceVisitUpdate: Encodable {
    var status: PlaceStatus
    var rating: Int?
    var visitedAt: Date?
    var review: String?

    enum CodingKeys: String, CodingKey {
        case status, rating, review
        case visitedAt = "visited_at"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(status, forKey: .status)
        try container.encode(rating, forKey: .rating)
        try container.encode(visitedAt, forKey: .visitedAt)
        try container.encode(review, forKey: .review)
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
