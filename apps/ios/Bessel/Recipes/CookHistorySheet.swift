import SwiftUI

/// The days a recipe was cooked: log another day, or swipe one away.
struct CookHistorySheet: View {
    let store: RecipesStore
    let recipe: RecipeItem

    @Environment(\.dismiss) private var dismiss
    @Environment(ToastCenter.self) private var toasts
    @State private var days: [Date]?
    @State private var loadError: String?
    @State private var pickedDay = Date.now

    var body: some View {
        NavigationStack {
            List {
                Section {
                    DatePicker("Day", selection: $pickedDay, in: ...Date.now, displayedComponents: .date)
                    Button {
                        let day = pickedDay
                        Task {
                            await store.logCooked(recipe, on: day, toasts: toasts)
                            await reload()
                        }
                    } label: {
                        Label(Calendar.current.isDateInToday(pickedDay) ? "Log today" : "Log this day", systemImage: "frying.pan")
                    }
                    .disabled(days?.contains { Calendar.current.isDate($0, inSameDayAs: pickedDay) } ?? false)
                } header: {
                    Text("Cooked it")
                }

                Section {
                    if let days {
                        if days.isEmpty {
                            Text("Not cooked yet")
                                .foregroundStyle(Theme.mutedForeground)
                        }
                        ForEach(days, id: \.self) { day in
                            Text(day.formatted(.dateTime.weekday(.wide).day().month(.wide).year()))
                                .swipeActions {
                                    Button(role: .destructive) {
                                        withAnimation(.snappy) { self.days?.removeAll { $0 == day } }
                                        Task { await store.removeCooked(recipe, on: day) }
                                    } label: {
                                        Label("Remove", systemImage: "trash")
                                    }
                                }
                        }
                    } else if let loadError {
                        Text(loadError)
                            .foregroundStyle(Theme.mutedForeground)
                    } else {
                        ProgressView()
                    }
                } header: {
                    Text(days.map { $0.count == 1 ? "1 time" : "\($0.count) times" } ?? "History")
                }
            }
            .navigationTitle(recipe.title.isEmpty ? "Cooked" : recipe.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task { await reload() }
        }
        .presentationDetents([.medium, .large])
    }

    private func reload() async {
        do {
            days = try await store.cookHistory(recipe)
            loadError = nil
        } catch {
            if days == nil { loadError = error.userMessage }
        }
    }
}
