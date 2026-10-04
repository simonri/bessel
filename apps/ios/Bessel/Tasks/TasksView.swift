import SwiftUI

struct TasksView: View {
    let auth: AuthSession

    @State private var store: TasksStore
    @State private var editingTask: TaskItem?
    @Environment(ToastCenter.self) private var toasts

    init(auth: AuthSession) {
        self.auth = auth
        _store = State(initialValue: TasksStore(client: APIClient(auth: auth)))
    }

    var body: some View {
        NavigationStack {
            List {
                filters
                if store.hasLoaded {
                    switch store.mode {
                    case .today: todayContent
                    case .board: boardContent
                    case .done: doneContent
                    }
                }
            }
            .listStyle(.insetGrouped)
            .listSectionSpacing(18)
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .overlay {
                if !store.hasLoaded {
                    ProgressView()
                }
            }
            .safeAreaInset(edge: .bottom) {
                if store.mode != .done {
                    QuickAddBar(store: store)
                        .padding(.horizontal, 16)
                        .padding(.top, 20)
                        .padding(.bottom, 8)
                        .background(
                            LinearGradient(colors: [Theme.background.opacity(0), Theme.background], startPoint: .top, endPoint: .center)
                                .ignoresSafeArea()
                        )
                }
            }
            .navigationTitle("Tasks")
            .toolbarTitleDisplayMode(.inlineLarge)
            .toolbar {
                ProfileToolbarItem(auth: auth)
            }
            .sheet(item: $editingTask) { task in
                TaskFormView(store: store, task: task)
            }
            .alert("Something went wrong", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(store.errorMessage ?? "")
            }
            .task { await store.load() }
            .refreshable { await store.load() }
            .sensoryFeedback(.selection, trigger: store.mode)
        }
    }

    // MARK: - Filters

    /// Lives in a section header: list rows are clipped to the rounded
    /// section shape, which cut the pills off at the edges.
    private var filters: some View {
        Section {
        } header: {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    ForEach(TasksStore.Mode.allCases) { mode in
                        FilterPill(title: mode.rawValue, isSelected: store.mode == mode) {
                            withAnimation(.snappy) { store.mode = mode }
                        }
                    }
                }
                if !store.projects.isEmpty {
                    ScrollView(.horizontal) {
                        HStack(spacing: 6) {
                            ForEach(store.projects, id: \.self) { project in
                                let isSelected = store.projectFilter == project
                                Button {
                                    withAnimation(.snappy) {
                                        store.projectFilter = isSelected ? nil : project
                                    }
                                } label: {
                                    Chip(text: project, hue: PastelHue.forName(project), systemImage: isSelected ? "checkmark" : nil, isSelected: store.projectFilter == nil || isSelected)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                    .scrollClipDisabled()
                }
            }
            .textCase(nil)
            .padding(.horizontal, -16)
            .padding(.bottom, 4)
        }
    }

    // MARK: - Today

    @ViewBuilder
    private var todayContent: some View {
        let progress = store.progress
        if progress.total > 0 {
            Section {
                ProgressCard(done: progress.done, total: progress.total)
            }
        }

        if !store.routines.isEmpty {
            Section {
            } header: {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Routines", systemImage: "repeat")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.mutedForeground)
                    ScrollView(.horizontal) {
                        HStack(spacing: 8) {
                            ForEach(store.routines) { task in
                                RoutineChip(task: task, onSelect: { editingTask = task }) {
                                    Task { await store.complete(task, toasts: toasts) }
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    .scrollIndicators(.hidden)
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

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )
    }
}

/// Today's progress as a ring and a friendly line.
private struct ProgressCard: View {
    let done: Int
    let total: Int

    private var fraction: Double { total == 0 ? 0 : min(1, Double(done) / Double(total)) }
    private var isComplete: Bool { total > 0 && done >= total }

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .stroke(Theme.fill, lineWidth: 5)
                Circle()
                    .trim(from: 0, to: fraction)
                    .stroke(Theme.primary, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.easeOut(duration: 0.6), value: fraction)
                if isComplete {
                    Image(systemName: "sparkles")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.primary)
                }
            }
            .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(isComplete ? "All done for today ✨" : "\(done) of \(total) done today")
                    .font(.headline)
                    .foregroundStyle(Theme.foreground)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedForeground)
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }

    private var subtitle: String {
        if isComplete { return "Go enjoy the rest of your day." }
        let remaining = total - done
        if done == 0 { return "\(Greeting.now()). Let's start small." }
        return remaining == 1 ? "Just one more to go." : "\(remaining) more to go, you're doing great."
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
            .sensoryFeedback(.success, trigger: isTicked) { _, new in new }
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

/// The always-there "Add a task" field. Understands "fri", "#project" and "!".
private struct QuickAddBar: View {
    let store: TasksStore

    @State private var text = ""
    @State private var isSaving = false
    @FocusState private var isFocused: Bool

    private var parsed: QuickTask {
        QuickTask.parse(text, projects: store.projects)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if isFocused {
                hint
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
            HStack(spacing: 10) {
                Image(systemName: "plus")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.primary)
                TextField("Add a task", text: $text)
                    .focused($isFocused)
                    .submitLabel(.done)
                    .onSubmit(submit)
                if !text.trimmingCharacters(in: .whitespaces).isEmpty {
                    Button(action: submit) {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 30, height: 30)
                            .background(Theme.primary, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .disabled(isSaving)
                    .accessibilityLabel("Add task")
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.leading, 16)
            .padding(.trailing, 8)
            .frame(height: 50)
            .background(Theme.card, in: Capsule())
            .shadow(color: .black.opacity(0.08), radius: 14, y: 4)
        }
        .animation(.snappy, value: isFocused)
        .animation(.snappy, value: text.isEmpty)
    }

    @ViewBuilder
    private var hint: some View {
        let tokens = parsed.tokens
        HStack(spacing: 6) {
            if tokens.isEmpty {
                Text("Try \"Call mum fri #home !\"")
                    .font(.caption)
                    .foregroundStyle(Theme.mutedForeground)
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
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.thinMaterial, in: Capsule())
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
            project: task.project ?? store.projectFilter,
            area: nil
        )
        Task {
            defer { isSaving = false }
            do {
                try await store.create(draft)
                text = ""
            } catch {
                store.errorMessage = error.localizedDescription
            }
        }
    }
}
