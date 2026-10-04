import Foundation

enum RecipeType: String, Codable, CaseIterable, Identifiable {
    case main
    case dessert
    case other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .main: "Main"
        case .dessert: "Dessert"
        case .other: "Other"
        }
    }

    var plural: String {
        switch self {
        case .main: "Mains"
        case .dessert: "Desserts"
        case .other: "Other"
        }
    }

    /// Same emoji and hues as the web cookbook (apps/web recipe-style.ts).
    var emoji: String {
        switch self {
        case .main: "🍝"
        case .dessert: "🧁"
        case .other: "🥗"
        }
    }

    var hue: Double {
        switch self {
        case .main: 45
        case .dessert: 0
        case .other: 160
        }
    }
}

struct RecipeItem: Decodable, Identifiable, Hashable {
    let id: UUID
    let createdAt: Date
    let modifiedAt: Date?
    var title: String
    var content: String
    var recipeType: RecipeType
    /// Always present: the API derives it from `content` when no structure was saved.
    var body: RecipeBody
    var structured: Bool

    var ingredientCount: Int { body.ingredientGroups.map(\.items.count).reduce(0, +) }
}

/// The structured shape of a recipe, mirroring services/api recipes/body.py.
struct RecipeBody: Codable, Hashable {
    var intro: String?
    var yieldText: String?
    var totalMinutes: Int?
    var activeMinutes: Int?
    var ingredientGroups: [IngredientGroup] = []
    var steps: [Step] = []
    var sections: [Section] = []

    struct IngredientGroup: Codable, Hashable {
        var title: String?
        var items: [Ingredient] = []
    }

    struct Ingredient: Codable, Hashable {
        var amount: Double?
        var unit: String?
        var name: String
        var note: String?
    }

    struct Callout: Codable, Hashable {
        var kind: String = "tip"
        var label: String?
        var text: String
    }

    struct Step: Codable, Hashable {
        var title: String?
        var text: String = ""
        var timeLabel: String?
        var callouts: [Callout] = []
    }

    struct Section: Codable, Hashable {
        var title: String
        var text: String = ""
    }
}

// Decoding is synthesized (the shared decoder converts snake_case keys);
// encoding spells the API's snake_case keys out, since the shared encoder
// leaves keys alone.
extension RecipeBody {
    private enum EncodingKeys: String, CodingKey {
        case intro, steps, sections
        case yieldText = "yield_text"
        case totalMinutes = "total_minutes"
        case activeMinutes = "active_minutes"
        case ingredientGroups = "ingredient_groups"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: EncodingKeys.self)
        try container.encode(intro, forKey: .intro)
        try container.encode(yieldText, forKey: .yieldText)
        try container.encode(totalMinutes, forKey: .totalMinutes)
        try container.encode(activeMinutes, forKey: .activeMinutes)
        try container.encode(ingredientGroups, forKey: .ingredientGroups)
        try container.encode(steps, forKey: .steps)
        try container.encode(sections, forKey: .sections)
    }
}

extension RecipeBody.Step {
    private enum EncodingKeys: String, CodingKey {
        case title, text, callouts
        case timeLabel = "time_label"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: EncodingKeys.self)
        try container.encode(title, forKey: .title)
        try container.encode(text, forKey: .text)
        try container.encode(timeLabel, forKey: .timeLabel)
        try container.encode(callouts, forKey: .callouts)
    }
}

struct RecipeCreate: Encodable {
    var title: String
    var recipeType: RecipeType
    var body: RecipeBody

    enum CodingKeys: String, CodingKey {
        case title, body
        case recipeType = "recipe_type"
    }
}

/// Partial update. Only set fields are sent, and never `content`: sending
/// markdown would make the API drop the structured body the web built.
struct RecipeUpdate: Encodable {
    var title: String?
    var recipeType: RecipeType?
    var body: RecipeBody?

    enum CodingKeys: String, CodingKey {
        case title, body
        case recipeType = "recipe_type"
    }
}

struct RecipeImportRequest: Encodable {
    let text: String
}

struct RecipeImportResult: Decodable {
    let title: String
    let recipeType: RecipeType
    let body: RecipeBody
}

struct RecipeListResponse: Decodable {
    let items: [RecipeItem]
}

/// Ingredient lines as text and back, matching the API's own parser
/// (recipes/body.py parse_ingredient_line / format_ingredient), so editing
/// "0.5 dl cashewnötter, grovhackade" round-trips into amount, unit, name and note.
enum IngredientLine {
    private static let fractions: [Character: Double] = ["½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1.0 / 3, "⅔": 2.0 / 3]
    private static let units: Set<String> = [
        "dl", "cl", "ml", "l", "msk", "tsk", "krm", "g", "kg", "hg", "st", "skiva", "skivor", "nypa", "nypor",
        "burk", "burkar", "paket", "förp", "klyfta", "klyftor", "kvist", "kvistar", "knippe", "påse",
        "tbsp", "tsp", "cup", "cups", "oz", "lb",
    ]

    static func format(_ item: RecipeBody.Ingredient) -> String {
        let parts = [item.amount.map(formatAmount), item.unit, item.name].compactMap { $0 }.filter { !$0.isEmpty }
        let line = parts.joined(separator: " ")
        if let note = item.note, !note.isEmpty { return "\(line), \(note)" }
        return line
    }

    static func formatAmount(_ amount: Double) -> String {
        let whole = Int(amount)
        let remainder = amount - Double(whole)
        let glyphs: [(Double, String)] = [(0.5, "½"), (0.25, "¼"), (0.75, "¾")]
        if let glyph = glyphs.first(where: { abs($0.0 - remainder) < 0.01 })?.1 {
            return whole == 0 ? glyph : "\(whole)\(glyph)"
        }
        if remainder.magnitude < 0.0001 { return String(whole) }
        return amount.formatted(.number.precision(.fractionLength(0...2)))
    }

    static func parse(_ line: String) -> RecipeBody.Ingredient {
        let text = line.trimmingCharacters(in: .whitespaces)
        var rest = Substring(text)
        var amount: Double?

        let digits = rest.prefix { $0.isNumber || $0 == "." || $0 == "," }
        var cursor = rest.dropFirst(digits.count)
        let fraction = cursor.first.flatMap { fractions[$0] }
        if fraction != nil { cursor = cursor.dropFirst() }
        let endsWord = cursor.isEmpty || cursor.first?.isWhitespace == true
        if (!digits.isEmpty || fraction != nil), endsWord {
            let whole = Double(digits.replacingOccurrences(of: ",", with: ".")) ?? 0
            if digits.isEmpty || Double(digits.replacingOccurrences(of: ",", with: ".")) != nil {
                amount = whole + (fraction ?? 0)
                rest = cursor.drop { $0.isWhitespace }
            }
        }

        var unit: String?
        if amount != nil, let space = rest.firstIndex(of: " ") {
            let first = rest[..<space]
            let candidate = first.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
            if units.contains(candidate) {
                unit = String(first)
                rest = rest[space...].drop { $0.isWhitespace }
            }
        }

        var note: String?
        var name = String(rest)
        if name.hasSuffix(")"), let open = name.lastIndex(of: "(") {
            note = String(name[name.index(after: open)..<name.index(before: name.endIndex)]).trimmingCharacters(in: .whitespaces)
            name = String(name[..<open]).trimmingCharacters(in: .whitespaces)
        }
        if let comma = name.range(of: ", ") {
            let after = String(name[comma.upperBound...]).trimmingCharacters(in: .whitespaces)
            note = note.map { "\(after); \($0)" } ?? after
            name = String(name[..<comma.lowerBound])
        }
        name = name.trimmingCharacters(in: .whitespaces)
        return RecipeBody.Ingredient(
            amount: amount,
            unit: unit,
            name: name.isEmpty ? text : name,
            note: (note?.isEmpty ?? true) ? nil : note
        )
    }
}
