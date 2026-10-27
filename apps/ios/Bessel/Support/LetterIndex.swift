import SwiftUI

/// A strip of letters down the right edge: touch it and drag to jump straight
/// to a letter, like the index in Contacts or Messages. Each letter gets as
/// tall a row as the space allows, so few letters are easy to hit.
struct LetterIndex: View {
    let letters: [String]
    let onSelect: (String) -> Void

    @State private var current: String?
    @State private var ticks = 0

    private static let rowHeights: ClosedRange<CGFloat> = 16...30
    private static let inset: CGFloat = 8

    var body: some View {
        GeometryReader { geometry in
            let rowHeight = rowHeight(in: geometry.size.height)
            strip(rowHeight: rowHeight)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
        }
    }

    private func rowHeight(in available: CGFloat) -> CGFloat {
        guard !letters.isEmpty else { return Self.rowHeights.lowerBound }
        let fit = (available - Self.inset * 2) / CGFloat(letters.count)
        return min(max(fit, Self.rowHeights.lowerBound), Self.rowHeights.upperBound)
    }

    private func strip(rowHeight: CGFloat) -> some View {
        VStack(spacing: 0) {
            ForEach(letters, id: \.self) { letter in
                Text(letter)
                    .font(.system(size: rowHeight > 22 ? 13 : 11, weight: .semibold))
                    .foregroundStyle(current == letter ? Theme.primary : Theme.mutedForeground)
                    .frame(width: 24, height: rowHeight)
            }
        }
        .padding(.vertical, Self.inset)
        .background(Theme.card.opacity(0.9), in: Capsule())
        .overlay(Capsule().strokeBorder(Theme.border, lineWidth: 0.5))
        // A wider touch target than the letters themselves.
        .contentShape(Rectangle().inset(by: -12))
        .gesture(
            DragGesture(minimumDistance: 0, coordinateSpace: .local)
                .onChanged { value in select(at: value.location.y, rowHeight: rowHeight) }
                .onEnded { _ in current = nil }
        )
        .sensoryFeedback(.selection, trigger: ticks)
        .accessibilityElement()
        .accessibilityLabel("Jump to letter")
        .accessibilityAdjustableAction { direction in
            let index = letters.firstIndex(of: current ?? "") ?? (direction == .increment ? -1 : letters.count)
            let next = min(max(index + (direction == .increment ? 1 : -1), 0), letters.count - 1)
            current = letters[next]
            onSelect(letters[next])
        }
    }

    private func select(at y: CGFloat, rowHeight: CGFloat) {
        guard !letters.isEmpty else { return }
        let index = min(max(Int((y - Self.inset) / rowHeight), 0), letters.count - 1)
        let letter = letters[index]
        guard letter != current else { return }
        current = letter
        ticks += 1
        onSelect(letter)
    }
}
