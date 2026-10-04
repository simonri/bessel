import SwiftUI

struct TaskRow: View {
    let task: TaskItem
    /// Nil for finished tasks, which show a static tick.
    let onComplete: (() -> Void)?

    @State private var isTicked = false

    private var isDone: Bool { task.status == .done || isTicked }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Button(action: tick) {
                CheckCircle(isChecked: isDone)
                    .padding(.top, 1)
                    .contentShape(Rectangle().inset(by: -8))
            }
            .buttonStyle(.plain)
            .disabled(onComplete == nil)
            .haptic(.success, trigger: isTicked) { _, new in new }
            .accessibilityLabel(isDone ? "Completed" : "Complete \(task.title)")

            VStack(alignment: .leading, spacing: 6) {
                Text(task.title)
                    .font(.body)
                    .foregroundStyle(isDone ? Theme.mutedForeground : Theme.foreground)
                    .strikethrough(isDone, color: Theme.faintForeground)
                    .lineLimit(3)
                    .animation(.easeOut(duration: 0.2), value: isDone)

                if hasMeta {
                    meta
                }
            }

            Spacer(minLength: 0)

            if task.priority >= 2, !isDone {
                Image(systemName: "flag.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.priorityColor(task.priority))
                    .padding(.top, 5)
                    .accessibilityLabel("\(task.priorityLabel ?? "") priority")
            }
        }
        .padding(.vertical, 4)
    }

    private func tick() {
        guard let onComplete, !isTicked else { return }
        isTicked = true
        Task {
            try? await Task.sleep(for: .milliseconds(450))
            onComplete()
        }
    }

    private var hasMeta: Bool {
        task.dueDate != nil || task.completedAt != nil || task.project != nil || task.recurrenceLabel != nil || task.area != nil
    }

    private var meta: some View {
        HStack(spacing: 8) {
            if task.status == .done, let completedAt = task.completedAt {
                Text(completedAt.formatted(.relative(presentation: .named)))
                    .font(.caption)
                    .foregroundStyle(Theme.faintForeground)
            } else if let due = task.dueDate {
                Label(QuickTask.dueLabel(due), systemImage: "calendar")
                    .labelStyle(CompactLabelStyle())
                    .font(.caption.weight(.medium))
                    .foregroundStyle(dueColor(due))
            }
            if let recurrence = task.recurrenceLabel {
                Label(recurrence, systemImage: "repeat")
                    .labelStyle(CompactLabelStyle())
                    .font(.caption)
                    .foregroundStyle(Theme.mutedForeground)
            }
            if let project = task.project {
                Chip(text: project, hue: PastelHue.forName(project))
            } else if let area = task.area {
                Text(area)
                    .font(.caption)
                    .foregroundStyle(Theme.faintForeground)
            }
        }
        .lineLimit(1)
    }

    private func dueColor(_ date: Date) -> Color {
        let days = TaskItem.daysUntil(date)
        if days < 0 { return Theme.dueOverdue }
        if days == 0 { return Theme.dueToday }
        return Theme.mutedForeground
    }
}

struct CompactLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 3) {
            configuration.icon
                .imageScale(.small)
            configuration.title
        }
    }
}
