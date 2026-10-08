import SwiftUI

struct TasksView: View {
    let auth: AuthSession
    let isActive: Bool

    @State private var store: TasksStore
    @State private var editingTask: TaskItem?
    @State private var confirmingDelete: TaskItem?
    @State private var composing = false
    @State private var draft = ""
    @FocusState private var composerFocused: Bool
    @Environment(ToastCenter.self) private var toasts

    init(auth: AuthSession, services: AppServices, isActive: Bool) {
        self.auth = auth
        self.isActive = isActive
        _store = State(initialValue: TasksStore(services: services))
    }

    var body: some View {
        NavigationStack {
            List {
                if store.hasLoaded {
                    switch store.mode {
                    case .today: todayContent
                    case .board: boardContent
                    case .done: doneContent
                    }
                }
            }
            .listStyle(.insetGrouped)
            .refreshable { await store.load() }
            .listSectionSpacing(18)
            .contentMargins(.top, 0, for: .scrollContent)
            .contentMargins(.bottom, 80, for: .scrollContent)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.immediately)
            .stickyHeader { filters }
            .background(Theme.background)
            .overlay {
                if !store.hasLoaded {
                    ProgressView()
                }
            }
            .overlay {
                // While composing, a tap anywhere outside the card just closes it.
                if composing {
                    Color.clear
                        .contentShape(Rectangle())
                        .onTapGesture {
                            composerFocused = false
                            withAnimation(.snappy) { composing = false }
                        }
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if !composing {
                    FloatingAddButton(label: "New task") {
                        withAnimation(.snappy) { composing = true }
                    }
                    .padding(.trailing, 16)
                    .padding(.bottom, 12)
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .safeAreaInset(edge: .bottom) {
                if composing {
                    TaskComposer(store: store, text: $draft, isFocused: $composerFocused)
                        .padding(.horizontal, 10)
                        .padding(.bottom, 8)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .onChange(of: composerFocused) { _, focused in
                if !focused { withAnimation(.snappy) { composing = false } }
            }
            .navigationTitle("Tasks")
            .toolbarTitleDisplayMode(.inlineLarge)
            .toolbar {
                ProfileToolbarItem(auth: auth)
            }
            .sheet(item: $editingTask) { task in
                TaskFormView(store: store, task: task)
            }
            .alert(
                "Delete this task?",
                isPresented: Binding(get: { confirmingDelete != nil }, set: { if !$0 { confirmingDelete = nil } }),
                presenting: confirmingDelete
            ) { task in
                Button("Delete", role: .destructive) {
                    store.delete(task, toasts: toasts)
                }
                Button("Cancel", role: .cancel) {}
            } message: { task in
                Text(task.title)
            }
            .alert("Something went wrong", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(store.errorMessage ?? "")
            }
            .refreshWhileVisible(isActive) { await store.loadIfStale() }
            .loadErrorToast($store.loadError, isActive: isActive) { await store.load() }
            .haptic(.selection, trigger: store.mode)
        }
    }

    // MARK: - Filters

    /// Pinned above the list, so switching views is always in reach.
    private var filters: some View {
        HStack(spacing: 8) {
            ForEach(TasksStore.Mode.allCases) { mode in
                FilterPill(title: mode.rawValue, isSelected: store.mode == mode) {
                    withAnimation(.snappy) { store.mode = mode }
                }
            }
            Spacer(minLength: 0)
            if !store.projects.isEmpty {
                projectFilterMenu
            }
        }
    }

    /// One button that opens a checklist of projects; pick as many as you like.
    private var projectFilterMenu: some View {
        Menu {
            Button {
                withAnimation(.snappy) { store.projectFilter = [] }
            } label: {
                if store.projectFilter.isEmpty {
                    Label("All projects", systemImage: "checkmark")
                } else {
                    Text("All projects")
                }
            }
            Divider()
            ForEach(store.projects, id: \.self) { project in
                Toggle(project, isOn: Binding(
                    get: { store.projectFilter.contains(project) },
                    set: { isOn in
                        withAnimation(.snappy) {
                            if isOn { store.projectFilter.insert(project) } else { store.projectFilter.remove(project) }
                        }
                    }
                ))
            }
        } label: {
            let filter = store.projectFilter
            HStack(spacing: 5) {
                Image(systemName: "line.3.horizontal.decrease")
                    .font(.system(size: 13, weight: .semibold))
                Text(filter.isEmpty ? "Projects" : filter.count == 1 ? filter.first! : "\(filter.count) projects")
                    .lineLimit(1)
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(filter.isEmpty ? Theme.foreground : Theme.background)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(filter.isEmpty ? Theme.fill : Theme.foreground, in: Capsule())
        }
        .menuActionDismissBehavior(.disabled)
        .accessibilityLabel("Filter by project")
    }

    // MARK: - Today

    @ViewBuilder
    private var todayContent: some View {
        if !store.routines.isEmpty {
            Section {
            } header: {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Routines", systemImage: "repeat")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.mutedForeground)
                    ChipRow(inset: 16) {
                        ForEach(store.routines) { task in
                            RoutineChip(task: task, onSelect: { editingTask = task }) {
                                Task { await store.complete(task, toasts: toasts) }
                            }
                            .contextMenu { taskMenu(task) }
                        }
                    }
                    .padding(.horizontal, -32)
                }
                .textCase(nil)
            }
        }

        let groups = store.whenGroups()
        if groups.isEmpty {
            Section {
                EmptyState(emoji: "🌷", title: "All clear", detail: "Enjoy your day. Add something below whenever you're ready.")
                    .padding(.vertical, 40)
                    .listRowBackground(Color.clear)
            }
        }
        ForEach(groups) { group in
            Section {
                ForEach(group.tasks) { task in
                    openRow(task)
                }
            } header: {
                SectionHeading(
                    title: group.title,
                    count: group.tasks.count,
                    tint: group.key == .overdue ? Theme.dueOverdue : Theme.mutedForeground
                )
            }
        }
    }

    // MARK: - Board

    @ViewBuilder
    private var boardContent: some View {
        if store.boardTodo.isEmpty && store.boardDoing.isEmpty {
            Section {
                EmptyState(emoji: "🫧", title: "Nothing on the board", detail: "Add a task below to get started.")
                    .padding(.vertical, 40)
                    .listRowBackground(Color.clear)
            }
        }
        boardSection("Doing", tasks: store.boardDoing, status: .inProgress)
        boardSection("To do", tasks: store.boardTodo, status: .todo)
    }

    @ViewBuilder
    private func boardSection(_ title: String, tasks: [TaskItem], status: TaskStatus) -> some View {
        if !tasks.isEmpty {
            Section {
                ForEach(tasks) { task in
                    openRow(task)
                }
                .onMove { source, destination in
                    Task { await store.move(in: status, from: source, to: destination) }
                }
            } header: {
                SectionHeading(title: title, count: tasks.count)
            } footer: {
                if status == .todo, tasks.count > 1 {
                    Text("Touch and hold a task to reorder.")
                        .font(.caption)
                        .foregroundStyle(Theme.faintForeground)
                }
            }
        }
    }

    // MARK: - Done

    @ViewBuilder
    private var doneContent: some View {
        let thisWeek = store.progress.thisWeek
        Section {
            Text(thisWeek > 0
                ? "You finished \(thisWeek) \(thisWeek == 1 ? "thing" : "things") this week ✨"
                : "Nothing finished this week yet. You've got this.")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(thisWeek > 0 ? Theme.primary : Theme.mutedForeground)
                .listRowBackground(thisWeek > 0 ? Theme.primarySoft : Theme.card)
        }

        if !store.visibleDone.isEmpty {
            Section {
                ForEach(store.visibleDone) { task in
                    TaskRow(task: task, onComplete: nil)
                        .contentShape(Rectangle())
                        .onTapGesture { editingTask = task }
                        .contextMenu { taskMenu(task) }
                        .listRowBackground(Theme.card)
                        .swipeActions(edge: .leading) {
                            Button {
                                Task { await store.reopen(task) }
                            } label: {
                                Label("Reopen", systemImage: "arrow.uturn.backward")
                            }
                            .tint(Theme.info)
                        }
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                store.delete(task, toasts: toasts)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                }
                if store.canLoadMoreDone {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                    .listRowBackground(Color.clear)
                    .task { await store.loadMoreDone() }
                }
            }
        }
    }

    // MARK: - Rows

    private func openRow(_ task: TaskItem) -> some View {
        TaskRow(task: task) {
            Task { await store.complete(task, toasts: toasts) }
        }
        .contentShape(Rectangle())
        .onTapGesture { editingTask = task }
        .contextMenu { taskMenu(task) }
        .listRowBackground(Theme.card)
        .listRowSeparatorTint(Theme.border)
        .swipeActions(edge: .leading) {
            Button {
                Task { await store.complete(task, toasts: toasts) }
            } label: {
                Label("Done", systemImage: "checkmark")
            }
            .tint(Theme.primary)
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                store.delete(task, toasts: toasts)
            } label: {
                Label("Delete", systemImage: "trash")
            }
            if task.status == .todo {
                Button {
                    Task { try? await store.update(task, with: .status(.inProgress, for: task)) }
                } label: {
                    Label("Start", systemImage: "play")
                }
                .tint(Theme.info)
            }
        }
    }

    /// Press and hold a task: copy it as a prompt for Claude, or delete it.
    @ViewBuilder
    private func taskMenu(_ task: TaskItem) -> some View {
        Button {
            UIPasteboard.general.string = task.claudePrompt
            toasts.show("Copied for Claude")
        } label: {
            Label("Copy task", systemImage: "doc.on.doc")
        }
        Button(role: .destructive) {
            confirmingDelete = task
        } label: {
            Label("Delete", systemImage: "trash")
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )
    }
}

/// A repeating task as a small capsule you can tick off in place.
private struct RoutineChip: View {
    let task: TaskItem
    let onSelect: () -> Void
    let onComplete: () -> Void

    @State private var isTicked = false

    var body: some View {
        HStack(spacing: 8) {
            Button {
                guard !isTicked else { return }
                isTicked = true
                Task {
                    try? await Task.sleep(for: .milliseconds(450))
                    onComplete()
                }
            } label: {
                CheckCircle(isChecked: isTicked, size: 18)
            }
            .buttonStyle(.plain)
            .haptic(.success, trigger: isTicked) { _, new in new }
            .accessibilityLabel("Complete \(task.title)")

            Button(action: onSelect) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(task.title)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(isTicked ? Theme.mutedForeground : Theme.foreground)
                        .strikethrough(isTicked, color: Theme.faintForeground)
                    if let recurrence = task.recurrenceLabel {
                        Text(recurrence)
                            .font(.caption)
                            .foregroundStyle(Theme.faintForeground)
                    }
                }
                .lineLimit(1)
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 10)
        .padding(.trailing, 14)
        .padding(.vertical, 9)
        .background(Theme.card, in: Capsule())
    }
}

/// Quick add for tasks. Understands "fri", "#project" and "!".
private struct TaskComposer: View {
    let store: TasksStore
    @Binding var text: String
    var isFocused: FocusState<Bool>.Binding

    @State private var isSaving = false
    /// The project picked from the chip; a "#project" in the text wins over it.
    @State private var chosenProject: String?

    init(store: TasksStore, text: Binding<String>, isFocused: FocusState<Bool>.Binding) {
        self.store = store
        _text = text
        self.isFocused = isFocused
        _chosenProject = State(initialValue: store.projectFilter.count == 1 ? store.projectFilter.first : nil)
    }

    private var parsed: QuickTask {
        QuickTask.parse(text, projects: store.projects)
    }

    var body: some View {
        Composer(placeholder: "Task name", text: $text, isFocused: isFocused, isSending: isSaving, onSubmit: submit) {
            let tokens = parsed.tokens
            if parsed.project == nil {
                projectMenu
            }
            if tokens.isEmpty {
                Chip(text: "Try \"fri\" or \"!\"", hue: 32, systemImage: "calendar", isSelected: false)
            }
            ForEach(Array(tokens.enumerated()), id: \.offset) { _, token in
                switch token.kind {
                case .due:
                    Chip(text: token.label, hue: 32, systemImage: "calendar")
                case .project:
                    Chip(text: token.label, hue: PastelHue.forName(token.label), systemImage: "number")
                case .priority:
                    Chip(text: token.label, hue: 15, systemImage: "flag.fill")
                }
            }
        }
    }

    private var projectMenu: some View {
        Menu {
            Picker("Project", selection: $chosenProject) {
                Text("No project").tag(String?.none)
                ForEach(store.projects, id: \.self) { project in
                    Text(project).tag(Optional(project))
                }
            }
        } label: {
            Chip(text: chosenProject ?? "No project", hue: PastelHue.forName(chosenProject ?? ""), systemImage: "number", isSelected: chosenProject != nil)
        }
        .menuOrder(.fixed)
        .accessibilityLabel("Project")
    }

    private func submit() {
        let task = parsed
        guard !task.title.isEmpty, !isSaving else { return }
        isSaving = true
        let draft = TaskCreate(
            title: task.title,
            description: nil,
            status: .todo,
            priority: task.priority,
            dueDate: task.dueDate,
            project: task.project ?? chosenProject
        )
        Task {
            defer { isSaving = false }
            do {
                try await store.create(draft)
                text = ""
                isFocused.wrappedValue = false
            } catch {
                store.errorMessage = error.userMessage
            }
        }
    }
}
