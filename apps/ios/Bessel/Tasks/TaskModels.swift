import Foundation

enum TaskStatus: String, Codable, CaseIterable, Identifiable, LenientEnum {
    case todo
    case inProgress = "in_progress"
    /// Finished work (often an agent's) waiting for the user to check it.
    case inReview = "in_review"
    case done
    case cancelled
    /// A status added on the server after this build; such tasks aren't listed.
    case unknown

    static let allCases: [TaskStatus] = [.todo, .inProgress, .inReview, .done, .cancelled]

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

struct TaskItem: Codable, Identifiable, Hashable {
    let id: UUID
    let createdAt: Date
    let modifiedAt: Date?
    var title: String
    var description: String?
    var status: TaskStatus
    var priority: Int
    var dueDate: Date?
    var completedAt: Date?
    var project: String?
    var tags: [String]?
    var position: Double
    var isRecurring: Bool
    var rruleFrequency: String?
    var rruleInterval: Int?
    var rruleDayOfWeek: Int?
    var rruleDayOfMonth: Int?
    var parentTaskId: UUID?
}

struct TaskCreate: Encodable {
    var title: String
    var description: String?
    var status: TaskStatus
    var priority: Int
    var dueDate: Date?
    var project: String?

    enum CodingKeys: String, CodingKey {
        case title, description, status, priority, project
        case dueDate = "due_date"
    }
}

/// Partial update. Clearable fields encode explicit nulls so the backend's
/// exclude_unset PATCH semantics actually clear them.
struct TaskUpdate: Encodable {
    var title: String
    var description: String?
    var status: TaskStatus
    var priority: Int
    var dueDate: Date?
    var project: String?

    enum CodingKeys: String, CodingKey {
        case title, description, status, priority, project
        case dueDate = "due_date"
    }

    /// The task as it is, with only its status changed.
    static func status(_ status: TaskStatus, for task: TaskItem) -> TaskUpdate {
        TaskUpdate(
            title: task.title,
            description: task.description,
            status: status,
            priority: task.priority,
            dueDate: task.dueDate,
            project: task.project
        )
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(title, forKey: .title)
        try container.encode(status, forKey: .status)
        try container.encode(priority, forKey: .priority)
        try container.encode(description, forKey: .description)
        try container.encode(dueDate, forKey: .dueDate)
        try container.encode(project, forKey: .project)
    }
}

struct TaskReorderItem: Encodable {
    let id: UUID
    let position: Double
}

struct TaskCompleteResponse: Decodable {
    let completedTask: TaskItem
    let nextTask: TaskItem?
}

struct TaskListResponse: Decodable {
    @Lossy var items: [TaskItem]
    let pagination: Pagination

    struct Pagination: Decodable {
        let totalCount: Int
        let maxPage: Int
    }
}

struct Project: Decodable, Identifiable {
    let id: UUID
    let name: String
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
        let unit: String = switch frequency {
        case "daily": "day"
        case "weekly": "week"
        case "monthly": "month"
        case "yearly": "year"
        default: frequency
        }
        return interval == 1 ? "Every \(unit)" : "Every \(interval) \(unit)s"
    }
}
