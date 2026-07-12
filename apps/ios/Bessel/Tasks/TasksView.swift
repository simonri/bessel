import SwiftUI

struct TasksView: View {
    let auth: AuthSession

    @State private var store: TasksStore
    @State private var showingCreate = false
    @State private var editingTask: TaskItem?

    init(auth: AuthSession) {
        self.auth = auth
        _store = State(initialValue: TasksStore(client: APIClient(auth: auth)))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("View", selection: $store.tab) {
                    ForEach(TasksStore.Tab.allCases) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)

                content
            }
            .background(Theme.background)
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
        ToolbarItem(placement: .topBarLeading) {
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
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button {
                showingCreate = true
            } label: {
                Image(systemName: "plus")
            }
            Menu {
                if let email = auth.userEmail {
                    Text(email)
                }
                Button("Sign out", role: .destructive) { auth.signOut() }
            } label: {
                Image(systemName: "person.circle")
            }
        }
    }

    private func sectionLabel(_ title: String) -> some View {
        Text(title)
            .font(.caption)
            .fontWeight(.medium)
            .kerning(1.5)
            .textCase(.uppercase)
            .foregroundStyle(Theme.mutedForeground)
    }

    private func emptyState(_ title: String, detail: String) -> some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.body.weight(.medium))
                .foregroundStyle(Theme.foreground)
            Text(detail)
                .font(.footnote)
                .foregroundStyle(Theme.mutedForeground)
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
