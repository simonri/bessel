import SwiftUI

struct TasksView: View {
    let auth: AuthSession

    @State private var store: TasksStore
    @State private var showingCreate = false
    @State private var editingTask: TaskItem?
    @Namespace private var tabUnderline

    init(auth: AuthSession) {
        self.auth = auth
        _store = State(initialValue: TasksStore(client: APIClient(auth: auth)))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                tabBar
                content
            }
            .background(Theme.background)
            .overlay(alignment: .bottomTrailing) { composeButton }
            .navigationTitle("Tasks")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
            .sheet(isPresented: $showingCreate) {
                TaskFormView(store: store, task: nil)
            }
            .sheet(item: $editingTask) { task in
                TaskFormView(store: store, task: task)
            }
            .alert("Something went wrong", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(store.errorMessage ?? "")
            }
            .task { await store.loadEverything() }
            .refreshable { await store.loadEverything() }
        }
    }

    /// X-style text tabs: colour carries selection, a single primary underline
    /// slides between them. Only the underline animates — content switches instantly.
    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(TasksStore.Tab.allCases) { tab in
                Button {
                    store.tab = tab
                } label: {
                    VStack(spacing: 8) {
                        Text(tab.rawValue)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(store.tab == tab ? Theme.foreground : Theme.mutedForeground)
                        ZStack {
                            Color.clear.frame(height: 2)
                            if store.tab == tab {
                                Capsule()
                                    .fill(Theme.primary)
                                    .frame(width: 40, height: 2)
                                    .matchedGeometryEffect(id: "underline", in: tabUnderline)
                            }
                        }
                    }
                    .padding(.top, 6)
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(store.tab == tab ? [.isSelected] : [])
            }
        }
        .animation(.easeOut(duration: 0.15), value: store.tab)
        .overlay(alignment: .bottom) {
            Theme.border.frame(height: 0.5)
        }
    }

    private var composeButton: some View {
        Button {
            showingCreate = true
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(Theme.primary, in: Circle())
                .shadow(color: .black.opacity(0.3), radius: 10, y: 4)
        }
        .padding(.trailing, 20)
        .padding(.bottom, 16)
        .accessibilityLabel("New task")
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )
    }

    @ViewBuilder
    private var content: some View {
        if !store.hasLoaded {
            Spacer()
            ProgressView()
                .tint(Theme.mutedForeground)
            Spacer()
        } else {
            switch store.tab {
            case .board: boardList
            case .done: doneList
            case .all: allList
            }
        }
    }

    private var boardList: some View {
        List {
            boardSection("To Do", tasks: store.filtered(store.boardTodo), status: .todo)
            boardSection("In Progress", tasks: store.filtered(store.boardInProgress), status: .inProgress)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .overlay {
            if store.filtered(store.board).isEmpty {
                emptyState("No tasks", detail: "Add one with the + button.")
            }
        }
    }

    private func boardSection(_ title: String, tasks: [TaskItem], status: TaskStatus) -> some View {
        Section {
            ForEach(tasks) { task in
                TaskRow(task: task, onComplete: { complete(task) })
                    .contentShape(Rectangle())
                    .onTapGesture { editingTask = task }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Task { await store.delete(task) }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                    .swipeActions(edge: .leading) {
                        Button {
                            complete(task)
                        } label: {
                            Label("Done", systemImage: "checkmark.circle")
                        }
                        .tint(Theme.primary)
                    }
            }
            .onMove { source, destination in
                Task { await store.moveBoardTasks(in: status, from: source, to: destination) }
            }
            .listRowBackground(Theme.background)
            .listRowSeparatorTint(Theme.border)
            .listRowInsets(EdgeInsets(top: 2, leading: 16, bottom: 2, trailing: 16))
        } header: {
            if !tasks.isEmpty {
                sectionLabel(title)
            }
        }
    }

    private var doneList: some View {
        List {
            ForEach(store.filtered(store.done)) { task in
                TaskRow(task: task, onComplete: nil)
                    .contentShape(Rectangle())
                    .onTapGesture { editingTask = task }
                    .swipeActions(edge: .leading) {
                        Button {
                            Task { await store.reopen(task) }
                        } label: {
                            Label("Reopen", systemImage: "arrow.counterclockwise")
                        }
                        .tint(Theme.primary)
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Task { await store.delete(task) }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                    .listRowBackground(Theme.background)
                    .listRowSeparatorTint(Theme.border)
                    .listRowInsets(EdgeInsets(top: 2, leading: 16, bottom: 2, trailing: 16))
            }
            if store.canLoadMoreDone {
                HStack {
                    Spacer()
                    ProgressView()
                        .tint(Theme.mutedForeground)
                    Spacer()
                }
                .listRowBackground(Theme.background)
                .listRowSeparator(.hidden)
                .task { await store.loadMoreDone() }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .overlay {
            if store.filtered(store.done).isEmpty {
                emptyState("No completed tasks", detail: "Completed tasks show up here.")
            }
        }
    }

    private var allList: some View {
        List {
            ForEach(store.filtered(store.all)) { task in
                TaskRow(task: task, onComplete: task.status == .done ? nil : { complete(task) })
                    .contentShape(Rectangle())
                    .onTapGesture { editingTask = task }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Task { await store.delete(task) }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                    .listRowBackground(Theme.background)
                    .listRowSeparatorTint(Theme.border)
                    .listRowInsets(EdgeInsets(top: 2, leading: 16, bottom: 2, trailing: 16))
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .overlay {
            if store.filtered(store.all).isEmpty {
                emptyState("No tasks", detail: "Add one with the + button.")
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button("All projects") { setFilter(nil) }
                ForEach(store.projects, id: \.self) { project in
                    Button {
                        setFilter(project)
                    } label: {
                        if store.projectFilter == project {
                            Label(project, systemImage: "checkmark")
                        } else {
                            Text(project)
                        }
                    }
                }
            } label: {
                Image(systemName: store.projectFilter == nil
                    ? "line.3.horizontal.decrease.circle"
                    : "line.3.horizontal.decrease.circle.fill")
            }
            .accessibilityLabel("Filter by project")
        }
    }

    private func sectionLabel(_ title: String) -> some View {
        Text(title)
            .font(.footnote.weight(.medium))
            .textCase(nil)
            .foregroundStyle(Theme.mutedForeground)
    }

    private func emptyState(_ title: String, detail: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "checklist")
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(Theme.mutedForeground.opacity(0.4))
            VStack(spacing: 4) {
                Text(title)
                    .font(.body.weight(.medium))
                    .foregroundStyle(Theme.foreground)
                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(Theme.mutedForeground)
            }
        }
        .allowsHitTesting(false)
    }

    private func complete(_ task: TaskItem) {
        Task { await store.complete(task) }
    }

    private func setFilter(_ project: String?) {
        store.projectFilter = project
        Task { await store.loadEverything() }
    }
}
