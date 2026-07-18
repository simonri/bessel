import Foundation

/// Groups a parsed markdown `AttributedString` into block-level elements.
/// SwiftUI's `Text` only honors inline markdown attributes (bold, italic,
/// links) — it silently drops `PresentationIntent` block structure, so a
/// bare `Text(attributedString)` renders headings, lists, code blocks, and
/// blockquotes as flat paragraphs. This walks the presentation intents so
/// each block can be rendered with its own layout.
struct MarkdownBlock: Identifiable {
    let id: Int
    let text: AttributedString
    let kind: Kind

    enum Kind: Equatable {
        case paragraph
        case heading(level: Int)
        case listItem(ordinal: Int?, indentationLevel: Int) // ordinal nil = unordered
        case codeBlock
        case blockQuote
        case thematicBreak
    }

    static func parse(_ markdown: String) -> [MarkdownBlock] {
        let options = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .full,
            failurePolicy: .returnPartiallyParsedIfPossible
        )
        guard let attributed = try? AttributedString(markdown: markdown, options: options) else {
            return markdown.isEmpty ? [] : [MarkdownBlock(id: 0, text: AttributedString(markdown), kind: .paragraph)]
        }

        var blocks: [MarkdownBlock] = []
        var currentIntent: PresentationIntent?
        var currentText = AttributedString()
        var hasCurrent = false

        func flush() {
            guard hasCurrent else { return }
            blocks.append(MarkdownBlock(id: blocks.count, text: currentText, kind: kind(for: currentIntent)))
            currentText = AttributedString()
            hasCurrent = false
        }

        // Consecutive runs sharing the same presentation intent belong to the
        // same block (e.g. a bold span inside a list item's paragraph).
        for run in attributed.runs {
            let intent = run.presentationIntent
            if hasCurrent, intent != currentIntent {
                flush()
            }
            currentIntent = intent
            currentText.append(AttributedString(attributed[run.range]))
            hasCurrent = true
        }
        flush()
        return blocks
    }

    private static func kind(for intent: PresentationIntent?) -> Kind {
        guard let intent else { return .paragraph }

        for component in intent.components {
            if case let .header(level) = component.kind {
                return .heading(level: level)
            }
        }
        if let listItemComponent = intent.components.first(where: {
            if case .listItem = $0.kind { return true }
            return false
        }), case let .listItem(ordinal) = listItemComponent.kind {
            let isOrdered = intent.components.contains {
                if case .orderedList = $0.kind { return true }
                return false
            }
            return .listItem(ordinal: isOrdered ? ordinal : nil, indentationLevel: intent.indentationLevel)
        }
        if intent.components.contains(where: {
            if case .codeBlock = $0.kind { return true }
            return false
        }) {
            return .codeBlock
        }
        if intent.components.contains(where: { $0.kind == .blockQuote }) {
            return .blockQuote
        }
        if intent.components.contains(where: { $0.kind == .thematicBreak }) {
            return .thematicBreak
        }
        return .paragraph
    }
}
