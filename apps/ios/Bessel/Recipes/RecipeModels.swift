import Foundation

// The API's recipe types, generated from its spec (Bessel/API/Generated).
typealias RecipeType = API.RecipeType
typealias RecipeItem = API.RecipeSchema
typealias RecipeBody = API.RecipeBody
typealias RecipeCreate = API.RecipeCreate
/// Partial update. Only set fields are sent, and never `content`: sending
/// markdown would make the API drop the structured body the web built.
typealias RecipeUpdate = API.RecipeUpdate
typealias RecipeImportRequest = API.RecipeImportRequest
typealias RecipeImportResult = API.RecipeImportResult
typealias RecipeListResponse = API.RecipeListResponse

extension RecipeBody {
    typealias IngredientGroup = API.RecipeIngredientGroup
    typealias Ingredient = API.RecipeIngredient
    typealias Callout = API.RecipeCallout
    typealias Step = API.RecipeStep
    typealias Section = API.RecipeSection
}

extension RecipeType: Identifiable {
    var id: String { rawValue }

    /// Kinds added on the server after this build file under Other, and are
    /// saved as Other: the server wouldn't take back a value it no longer has.
    var known: RecipeType { self == .unknown ? .other : self }

    var label: String {
        switch known {
        case .main: "Main"
        case .dessert: "Dessert"
        default: "Other"
        }
    }

    var plural: String {
        switch known {
        case .main: "Mains"
        case .dessert: "Desserts"
        default: "Other"
        }
    }

    /// Same emoji and hues as the web cookbook (apps/web recipe-style.ts).
    var emoji: String {
        switch known {
        case .main: "🍝"
        case .dessert: "🧁"
        default: "🥗"
        }
    }

    var hue: Double {
        switch known {
        case .main: 45
        case .dessert: 0
        default: 160
        }
    }
}

extension RecipeItem: Identifiable {
    var ingredientCount: Int { body.ingredientGroups.map(\.items.count).reduce(0, +) }
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

        // ASCII only: "¾".isNumber is true, and the glyphs are handled below.
        let digits = rest.prefix { $0.isASCII && ($0.isNumber || $0 == "." || $0 == ",") }
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
