import SwiftUI

/// A strip of letters down the right edge: touch it and drag to jump straight
/// to a letter, like the index in Contacts or Messages.
struct LetterIndex: View {
    let letters: [String]
    let onSelect: (String) -> Void

    @State private var current: String?
    @State private var ticks = 0

    private let letterHeight: CGFloat = 16

    var body: some View {
        VStack(spacing: 0) {
            ForEach(letters, id: \.self) { letter in
                Text(letter)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(current == letter ? Theme.primary : Theme.mutedForeground)
                    .frame(width: 20, height: letterHeight)
            }
        }
        .padding(.vertical, 6)
        .background(Theme.card.opacity(0.9), in: Capsule())
        .overlay(Capsule().strokeBorder(Theme.border, lineWidth: 0.5))
        // A wider touch target than the letters themselves.
        .contentShape(Rectangle().inset(by: -12))
        .gesture(
            DragGesture(minimumDistance: 0, coordinateSpace: .local)
                .onChanged { value in select(at: value.location.y) }
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

    private func select(at y: CGFloat) {
        guard !letters.isEmpty else { return }
        let index = min(max(Int((y - 6) / letterHeight), 0), letters.count - 1)
        let letter = letters[index]
        guard letter != current else { return }
        current = letter
        ticks += 1
        onSelect(letter)
    }
}
