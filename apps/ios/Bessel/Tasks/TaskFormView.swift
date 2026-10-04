import SwiftUI

struct TaskFormView: View {
    let store: TasksStore
    let task: TaskItem

    @Environment(\.dismiss) private var dismiss
    @Environment(ToastCenter.self) private var toasts

    @State private var title = ""
    @State private var taskDescription = ""
    @State private var status: TaskStatus = .todo
    @State private var priority = 0
    @State private var dueDate: Date?
    @State private var project = ""
    @State private var area = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showingDatePicker = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title, axis: .vertical)
                        .font(.title3.weight(.semibold))
                        .lineLimit(1...4)
                    TextField("Notes", text: $taskDescription, axis: .vertical)
                        .lineLimit(2...8)
                        .foregroundStyle(Theme.foreground)
                }
                .listRowBackground(Theme.card)

                Section {
                    HStack(spacing: 8) {
                        statusPill("To do", .todo)
                        statusPill("Doing", .inProgress)
                        statusPill("Done", .done)
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                } header: {
                    SectionHeading(title: "Status")
                }

                Section {
                    dueChips
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                    if showingDatePicker {
                        DatePicker("Due", selection: dueBinding, displayedComponents: .date)
                            .datePickerStyle(.graphical)
                            .listRowBackground(Theme.card)
                    }
                } header: {
                    SectionHeading(title: "When")
                }

                Section {
                    HStack(spacing: 8) {
                        priorityPill("None", 0)
                        priorityPill("Low", 1)
                        priorityPill("Medium", 2)
                        priorityPill("High", 3)
                        priorityPill("Urgent", 4)
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                } header: {
                    SectionHeading(title: "Priority")
                }

                Section {
                    suggestingField("Project", text: $project, suggestions: store.projects)
                    suggestingField("Area", text: $area, suggestions: store.areas)
                } header: {
                    SectionHeading(title: "Organise")
                }
                .listRowBackground(Theme.card)

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.circle")
                            .font(.footnote)
                            .foregroundStyle(Theme.destructive)
                    }
                    .listRowBackground(Theme.card)
                }

                Section {
                    Button("Delete task", role: .destructive) {
                        dismiss()
                        store.delete(task, toasts: toasts)
                    }
                    .frame(maxWidth: .infinity)
                }
                .listRowBackground(Theme.card)
            }
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .listSectionSpacing(16)
            .background(Theme.background)
            .navigationTitle("Edit task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Save", action: save)
                            .fontWeight(.semibold)
                            .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .onAppear(perform: populate)
        }
        .presentationDetents([.large])
        .presentationCornerRadius(28)
        .presentationDragIndicator(.hidden)
        .interactiveDismissDisabled(isSaving)
    }

    // MARK: - Pieces

    private func statusPill(_ label: String, _ value: TaskStatus) -> some View {
        FilterPill(title: label, isSelected: status == value) {
            withAnimation(.snappy) { status = value }
        }
    }

    private func priorityPill(_ label: String, _ value: Int) -> some View {
        Button {
            withAnimation(.snappy) { priority = value }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: value == 0 ? "flag.slash" : "flag.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(value == 0 ? Theme.faintForeground : Theme.priorityColor(value))
                Text(label)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(priority == value ? Theme.foreground : Theme.mutedForeground)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(priority == value ? Theme.card : Theme.fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(priority == value ? Theme.primary.opacity(0.6) : .clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }

    private var dueChips: some View {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        let options: [(String, Date?)] = [
            ("Today", today),
            ("Tomorrow", calendar.date(byAdding: .day, value: 1, to: today)),
            ("Next week", QuickTask.parse("next week", projects: []).dueDate),
            ("No date", nil),
        ]
        return ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(options, id: \.0) { label, date in
                    FilterPill(title: label, isSelected: !showingDatePicker && sameDay(dueDate, date)) {
                        withAnimation(.snappy) {
                            dueDate = date
                            showingDatePicker = false
                        }
                    }
                }
                FilterPill(title: customDateLabel, isSelected: showingDatePicker || isCustomDate) {
                    withAnimation(.snappy) {
                        if dueDate == nil { dueDate = today }
                        showingDatePicker.toggle()
                    }
                }
            }
        }
        .sidewaysOnly()
    }

    private var isCustomDate: Bool {
        guard let dueDate else { return false }
        let days = TaskItem.daysUntil(dueDate)
        let nextWeek = QuickTask.parse("next week", projects: []).dueDate
        return days != 0 && days != 1 && !sameDay(dueDate, nextWeek)
    }

    private var customDateLabel: String {
        if isCustomDate, let dueDate { return dueDate.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()) }
        return "Pick a date"
    }

    private var dueBinding: Binding<Date> {
        Binding(get: { dueDate ?? .now }, set: { dueDate = Calendar.current.startOfDay(for: $0) })
    }

    private func sameDay(_ lhs: Date?, _ rhs: Date?) -> Bool {
        switch (lhs, rhs) {
        case (nil, nil): true
        case let (lhs?, rhs?): Calendar.current.isDate(lhs, inSameDayAs: rhs)
        default: false
        }
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
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Choose \(label.lowercased())")
            }
        }
    }

    // MARK: - Actions

    private func populate() {
        title = task.title
        taskDescription = task.description ?? ""
        status = task.status
        priority = task.priority
        dueDate = task.dueDate
        project = task.project ?? ""
        area = task.area ?? ""
        showingDatePicker = isCustomDate
    }

    private func save() {
        let trimmed = { (value: String) -> String? in
            let result = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return result.isEmpty ? nil : result
        }
        let update = TaskUpdate(
            title: trimmed(title) ?? task.title,
            description: trimmed(taskDescription),
            status: status,
            priority: priority,
            dueDate: dueDate,
            project: trimmed(project),
            area: trimmed(area)
        )
        isSaving = true
        errorMessage = nil
        Task {
            defer { isSaving = false }
            do {
                try await store.update(task, with: update)
                dismiss()
            } catch {
                errorMessage = "Couldn't save: \(error.localizedDescription)"
            }
        }
    }
}
