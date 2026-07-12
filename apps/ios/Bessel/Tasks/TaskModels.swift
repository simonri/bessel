import Foundation

enum TaskStatus: String, Codable, CaseIterable, Identifiable {
    case todo
    case inProgress = "in_progress"
    case done
    case cancelled

    var id: String { rawValue }

    var label: String {
        switch self {
        case .todo: "To Do"
        case .inProgress: "In Progress"
        case .done: "Done"
        case .cancelled: "Cancelled"
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
    var area: String?
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
    var area: String?

    enum CodingKeys: String, CodingKey {
        case title, description, status, priority, project, area
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
    var area: String?

    enum CodingKeys: String, CodingKey {
        case title, description, status, priority, project, area
        case dueDate = "due_date"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(title, forKey: .title)
        try container.encode(status, forKey: .status)
        try container.encode(priority, forKey: .priority)
        try container.encode(description, forKey: .description)
        try container.encode(dueDate, forKey: .dueDate)
        try container.encode(project, forKey: .project)
        try container.encode(area, forKey: .area)
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
    let items: [TaskItem]
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
