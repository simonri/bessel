import SwiftUI

struct TaskFormView: View {
    let store: TasksStore
    let task: TaskItem?

    @Environment(\.dismiss) private var dismiss
    @FocusState private var titleFocused: Bool

    @State private var title = ""
    @State private var notes = ""
    @State private var status: TaskStatus = .todo
    @State private var priority = 0
    @State private var hasDueDate = false
    @State private var dueDate = Date.now
    @State private var project = ""
    @State private var area = ""
    @State private var confirmingDelete = false

    private var isEditing: Bool { task != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title)
                        .focused($titleFocused)
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                        .foregroundStyle(Theme.foreground)
                }
                .listRowBackground(Theme.card)

                Section {
                    if isEditing {
                        Picker("Status", selection: $status) {
                            ForEach(TaskStatus.allCases) { status in
                                Text(status.label).tag(status)
                            }
                        }
                    }
                    Picker("Priority", selection: $priority) {
                        Text("None").tag(0)
                        Text("Low").tag(1)
                        Text("Medium").tag(2)
                        Text("High").tag(3)
                        Text("Urgent").tag(4)
                    }
                    Toggle("Due date", isOn: $hasDueDate.animation())
                    if hasDueDate {
                        DatePicker("Due", selection: $dueDate, displayedComponents: .date)
                    }
                }
                .listRowBackground(Theme.card)

                Section {
                    suggestingField("Project", text: $project, suggestions: store.projects)
                    suggestingField("Area", text: $area, suggestions: store.areas)
                }
                .listRowBackground(Theme.card)

                if isEditing {
                    Section {
                        Button("Delete task", role: .destructive) {
                            confirmingDelete = true
                        }
                    }
                    .listRowBackground(Theme.card)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle(isEditing ? "Edit Task" : "New Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .confirmationDialog("Delete this task?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let task {
                        Task { await store.delete(task) }
                    }
                    dismiss()
                }
            }
            .onAppear(perform: populate)
        }
        .presentationDetents([.large])
    }

    private func suggestingField(_ label: String, text: Binding<String>, suggestions: [String]) -> some View {
        HStack {
            TextField(label, text: text)
            if !suggestions.isEmpty {
                Menu {
                    ForEach(suggestions, id: \.self) { suggestion in
                        Button(suggestion) { text.wrappedValue = suggestion }
                    }
                } label: {
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.caption)
                        .foregroundStyle(Theme.mutedForeground)
                }
            }
        }
    }

    private func populate() {
        guard let task else {
            titleFocused = true
            return
        }
        title = task.title
        notes = task.description ?? ""
        status = task.status
        priority = task.priority
        hasDueDate = task.dueDate != nil
        dueDate = task.dueDate ?? .now
        project = task.project ?? ""
        area = task.area ?? ""
    }

    private func save() {
        let trimmedTitle = title.trimmingCharacters(in: .whitespaces)
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedProject = project.trimmingCharacters(in: .whitespaces)
        let trimmedArea = area.trimmingCharacters(in: .whitespaces)

        if let task {
            let update = TaskUpdate(
                title: trimmedTitle,
                description: trimmedNotes.isEmpty ? nil : trimmedNotes,
                status: status,
                priority: priority,
                dueDate: hasDueDate ? dueDate : nil,
                project: trimmedProject.isEmpty ? nil : trimmedProject,
                area: trimmedArea.isEmpty ? nil : trimmedArea
            )
            Task { await store.update(task, with: update) }
        } else {
            let draft = TaskCreate(
                title: trimmedTitle,
                description: trimmedNotes.isEmpty ? nil : trimmedNotes,
                status: .todo,
                priority: priority,
                dueDate: hasDueDate ? dueDate : nil,
                project: trimmedProject.isEmpty ? nil : trimmedProject,
                area: trimmedArea.isEmpty ? nil : trimmedArea
            )
            Task { await store.create(draft) }
        }
        dismiss()
    }
}
