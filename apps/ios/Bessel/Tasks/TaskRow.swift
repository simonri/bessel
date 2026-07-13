import SwiftUI

struct TaskRow: View {
    let task: TaskItem
    let onComplete: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if let onComplete {
                Button(action: onComplete) {
                    Image(systemName: "circle")
                        .font(.system(size: 18, weight: .light))
                        .foregroundStyle(Theme.mutedForeground.opacity(0.5))
                }
                .buttonStyle(.plain)
                .padding(.top, 1)
            } else if task.status == .done {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 18, weight: .light))
                    .foregroundStyle(Theme.mutedForeground.opacity(0.5))
                    .padding(.top, 1)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(task.title)
                    .font(.subheadline)
                    .foregroundStyle(task.status == .done ? Theme.mutedForeground : Theme.foreground)
                    .strikethrough(task.status == .done, color: Theme.mutedForeground.opacity(0.5))
                    .lineLimit(2)

                if !metaItems.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(Array(metaItems.enumerated()), id: \.offset) { index, item in
                            if index > 0 {
                                Text("·")
                                    .font(.caption)
                                    .foregroundStyle(Theme.mutedForeground.opacity(0.5))
                            }
                            metaView(item)
                        }
                    }
                    .lineLimit(1)
                }
            }

            Spacer(minLength: 0)

            // Low priority is near-default — a flag for it is decoration, not signal.
            if task.priority >= 2 {
                Image(systemName: "flag.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.priorityColor(task.priority))
                    .padding(.top, 4)
            }
        }
        .padding(.vertical, 6)
        .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
    }

    private enum MetaItem {
        case text(String, Color)
        case recurrence(String)
    }

    private var metaItems: [MetaItem] {
        var items: [MetaItem] = []
        if task.status == .done, let completedAt = task.completedAt {
            items.append(.text(completedAt.formatted(.relative(presentation: .named)), Theme.dueLater))
        } else if let dueDate = task.dueDate {
            items.append(.text(Self.dueLabel(for: dueDate), dueColor(for: dueDate)))
        }
        if let recurrence = task.recurrenceLabel {
            items.append(.recurrence(recurrence))
        }
        if let project = task.project {
            items.append(.text(project, Theme.mutedForeground))
        }
        if let area = task.area {
            items.append(.text(area, Theme.mutedForeground.opacity(0.7)))
        }
        return items
    }

    @ViewBuilder
    private func metaView(_ item: MetaItem) -> some View {
        switch item {
        case .text(let text, let color):
            Text(text)
                .font(.caption)
                .foregroundStyle(color)
        case .recurrence(let label):
            HStack(spacing: 3) {
                Image(systemName: "repeat")
                    .font(.system(size: 10))
                Text(label)
            }
            .font(.caption)
            .foregroundStyle(Theme.mutedForeground)
        }
    }

    private func dueColor(for date: Date) -> Color {
        if Calendar.current.isDateInToday(date) { return Theme.dueToday }
        if date < Calendar.current.startOfDay(for: .now) { return Theme.dueOverdue }
        return Theme.dueLater
    }

    private static func dueLabel(for date: Date) -> String {
        if Calendar.current.isDateInToday(date) { return "Today" }
        if Calendar.current.isDateInTomorrow(date) { return "Tomorrow" }
        if Calendar.current.isDateInYesterday(date) { return "Yesterday" }
        return date.formatted(.dateTime.day().month(.abbreviated))
    }
}
