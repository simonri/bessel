import SwiftUI

struct TaskRow: View {
    let task: TaskItem
    let onComplete: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if let onComplete {
                Button(action: onComplete) {
                    Image(systemName: "circle")
                        .font(.system(size: 20, weight: .light))
                        .foregroundStyle(Theme.mutedForeground.opacity(0.6))
                }
                .buttonStyle(.plain)
                .padding(.top, 1)
            } else if task.status == .done {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 20, weight: .light))
                    .foregroundStyle(Theme.mutedForeground.opacity(0.5))
                    .padding(.top, 1)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(task.title)
                    .font(.subheadline)
                    .foregroundStyle(task.status == .done ? Theme.mutedForeground : Theme.foreground)
                    .strikethrough(task.status == .done, color: Theme.mutedForeground.opacity(0.5))
                    .lineLimit(2)

                if hasMetadata {
                    HStack(spacing: 8) {
                        if task.status == .done, let completedAt = task.completedAt {
                            metaText(completedAt.formatted(.relative(presentation: .named)), color: Theme.dueLater)
                        } else if let dueDate = task.dueDate {
                            metaText(Self.dueLabel(for: dueDate), color: dueColor(for: dueDate))
                        }
                        if let recurrence = task.recurrenceLabel {
                            HStack(spacing: 3) {
                                Image(systemName: "repeat")
                                    .font(.system(size: 10))
                                Text(recurrence)
                            }
                            .font(.caption)
                            .foregroundStyle(Theme.mutedForeground)
                        }
                        if let project = task.project {
                            metaText(project, color: Theme.mutedForeground)
                        }
                        if let area = task.area {
                            metaText(area, color: Theme.mutedForeground.opacity(0.7))
                        }
                    }
                    .lineLimit(1)
                }
            }

            Spacer(minLength: 0)

            if task.priority > 0 {
                Image(systemName: "flag.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.priorityColor(task.priority))
                    .padding(.top, 4)
            }
        }
        .padding(.vertical, 6)
    }

    private var hasMetadata: Bool {
        task.dueDate != nil || task.completedAt != nil || task.project != nil
            || task.area != nil || task.recurrenceLabel != nil
    }

    private func metaText(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(color)
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
