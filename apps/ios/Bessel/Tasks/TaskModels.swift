import Foundation

// The API's task types, generated from its spec (Bessel/API/Generated).
typealias TaskStatus = API.TaskStatus
typealias TaskItem = API.TaskSchema
typealias TaskCreate = API.TaskCreate
typealias TaskUpdate = API.TaskUpdate
typealias TaskReorderItem = API.TaskReorderItem
typealias TaskCompleteResponse = API.TaskCompleteResponse
typealias TaskListResponse = API.TaskListResponse
typealias Project = API.ProjectSchema

extension TaskStatus: Identifiable {
    var id: String { rawValue }

    var label: String {
        switch self {
        case .todo: "To Do"
        case .inProgress: "In Progress"
        case .inReview: "In Review"
        case .done: "Done"
        case .cancelled: "Cancelled"
        case .unknown: "Other"
        }
    }
}

extension TaskItem: Identifiable {}
extension Project: Identifiable {}

extension TaskUpdate {
    /// The task as it is, with only its status changed. The fields it sends are
    /// replaced as a whole, so a cleared one goes as an explicit null.
    static func status(_ status: TaskStatus, for task: TaskItem) -> TaskUpdate {
        TaskUpdate(
            title: task.title,
            description: .some(task.description),
            status: status,
            priority: task.priority,
            dueDate: .some(task.dueDate),
            project: .some(task.project)
        )
    }
}

extension TaskItem {
    static func daysUntil(_ date: Date, now: Date = .now) -> Int {
        let calendar = Calendar.current
        return calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: date)).day ?? 0
    }

    /// The task as a prompt for Claude, same text as the desktop app's copy
    /// (apps/web/src/lib/task-format.ts buildTaskPrompt).
    var claudePrompt: String {
        var parts = ["Implement this task:\nTitle: \(title)"]
        if let description, !description.isEmpty {
            parts.append("Description: \(description)")
        }
        return parts.joined(separator: "\n\n")
    }

    var priorityLabel: String? {
        switch priority {
        case 1: "Low"
        case 2: "Medium"
        case 3: "High"
        case 4: "Urgent"
        default: nil
        }
    }

    var recurrenceLabel: String? {
        guard isRecurring, let frequency = rruleFrequency else { return nil }
        let interval = rruleInterval ?? 1
        let unit: String
        switch frequency {
        case .daily: unit = "day"
        case .weekly: unit = "week"
        case .monthly: unit = "month"
        case .yearly: unit = "year"
        case .unknown: return nil
        }
        return interval == 1 ? "Every \(unit)" : "Every \(interval) \(unit)s"
    }
}
