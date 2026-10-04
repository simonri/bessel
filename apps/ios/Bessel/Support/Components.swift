import Observation
import SwiftUI

/// A small pastel capsule: project, recipe type, place category.
struct Chip: View {
    let text: String
    let hue: Double
    var systemImage: String?
    var isSelected = true

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 10, weight: .semibold))
            }
            Text(text)
                .lineLimit(1)
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(isSelected ? Theme.pastel(hue) : Theme.mutedForeground)
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .background(isSelected ? Theme.pastelWash(hue) : Theme.fill, in: Capsule())
    }
}

/// A selectable filter pill for horizontal chip rows.
struct FilterPill: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(isSelected ? Theme.background : Theme.foreground)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(isSelected ? Theme.foreground : Theme.fill, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

/// The round tick used for tasks and ingredients. Fills with the primary
/// colour and a soft spring when checked.
struct CheckCircle: View {
    let isChecked: Bool
    var tint: Color = Theme.primary
    var size: CGFloat = 22

    var body: some View {
        ZStack {
            Circle()
                .strokeBorder(isChecked ? tint : Theme.faintForeground, lineWidth: 1.5)
            Circle()
                .fill(tint)
                .scaleEffect(isChecked ? 1 : 0.2)
                .opacity(isChecked ? 1 : 0)
            Image(systemName: "checkmark")
                .font(.system(size: size * 0.45, weight: .bold))
                .foregroundStyle(.white)
                .scaleEffect(isChecked ? 1 : 0.4)
                .opacity(isChecked ? 1 : 0)
        }
        .frame(width: size, height: size)
        .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isChecked)
    }
}

/// Friendly empty state: an emoji, a line, and an optional hint.
struct EmptyState: View {
    let emoji: String
    let title: String
    var detail: String?

    var body: some View {
        VStack(spacing: 8) {
            Text(emoji)
                .font(.system(size: 40))
            Text(title)
                .font(.headline)
                .foregroundStyle(Theme.foreground)
            if let detail {
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedForeground)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 40)
        .frame(maxWidth: .infinity)
    }
}

/// Sentence-case section heading with an optional count.
struct SectionHeading: View {
    let title: String
    var count: Int?
    var tint: Color = Theme.mutedForeground

    var body: some View {
        HStack(spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(tint)
            if let count {
                Text("\(count)")
                    .font(.subheadline)
                    .monospacedDigit()
                    .foregroundStyle(Theme.faintForeground)
            }
        }
        .textCase(nil)
    }
}

extension View {
    /// A rounded card on the page background.
    func card(padding: CGFloat = 16) -> some View {
        self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// A short message at the bottom of the screen, with an optional Undo.
@MainActor
@Observable
final class ToastCenter {
    struct Toast: Identifiable {
        let id = UUID()
        let message: String
        let undo: (() -> Void)?
    }

    private(set) var current: Toast?
    private var dismissTask: Task<Void, Never>?

    func show(_ message: String, undo: (() -> Void)? = nil) {
        dismissTask?.cancel()
        let toast = Toast(message: message, undo: undo)
        withAnimation(.snappy) { current = toast }
        dismissTask = Task {
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled else { return }
            dismiss(toast.id)
        }
    }

    func dismiss(_ id: UUID? = nil) {
        guard id == nil || current?.id == id else { return }
        withAnimation(.snappy) { current = nil }
    }
}

struct ToastOverlay: View {
    let center: ToastCenter

    var body: some View {
        if let toast = center.current {
            HStack(spacing: 12) {
                Text(toast.message)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.background)
                    .lineLimit(2)
                Spacer(minLength: 0)
                if let undo = toast.undo {
                    Button("Undo") {
                        undo()
                        center.dismiss(toast.id)
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.primary)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .background(Theme.foreground, in: Capsule())
            .shadow(color: .black.opacity(0.15), radius: 16, y: 6)
            .padding(.horizontal, 16)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .id(toast.id)
        }
    }
}

/// A friendly line depending on the time of day.
enum Greeting {
    static func now(_ date: Date = .now) -> String {
        switch Calendar.current.component(.hour, from: date) {
        case 5..<12: "Good morning"
        case 12..<17: "Good afternoon"
        case 17..<22: "Good evening"
        default: "Hey night owl"
        }
    }
}
