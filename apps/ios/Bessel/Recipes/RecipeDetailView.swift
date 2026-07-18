import SwiftUI

struct RecipeDetailView: View {
    let store: RecipesStore
    let recipe: RecipeItem

    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var content: String
    @State private var recipeType: RecipeType
    @State private var mode: Mode = .edit
    @State private var confirmingDelete = false
    @State private var saveTask: Task<Void, Never>?

    private enum Mode: String, CaseIterable, Identifiable {
        case edit, preview
        var id: String { rawValue }
    }

    init(store: RecipesStore, recipe: RecipeItem) {
        self.store = store
        self.recipe = recipe
        _title = State(initialValue: recipe.title)
        _content = State(initialValue: recipe.content)
        _recipeType = State(initialValue: recipe.recipeType)
    }

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Divider().overlay(Theme.border)
            if mode == .edit {
                TextEditor(text: $content)
                    .font(.system(.subheadline, design: .monospaced))
                    .foregroundStyle(Theme.foreground)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                    .onChange(of: content) { scheduleSave() }
            } else {
                ScrollView {
                    Text(preview)
                        .font(.subheadline)
                        .foregroundStyle(Theme.foreground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }
            }
        }
        .background(Theme.background)
        .navigationTitle("Recipe")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Delete this recipe?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task { await store.delete(recipe) }
                dismiss()
            }
        }
    }

    private var toolbar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                TextField("Recipe title", text: $title)
                    .font(.headline)
                    .foregroundStyle(Theme.foreground)
                    .onChange(of: title) { scheduleSave() }
                Menu {
                    ForEach(RecipeType.allCases) { type in
                        Button {
                            recipeType = type
                            scheduleSave(immediate: true)
                        } label: {
                            if recipeType == type {
                                Label(type.label, systemImage: "checkmark")
                            } else {
                                Text(type.label)
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(recipeType.label)
                        Image(systemName: "chevron.up.chevron.down")
                    }
                    .font(.caption)
                    .foregroundStyle(Theme.mutedForeground)
                }
            }
            HStack {
                Picker("Mode", selection: $mode) {
                    Text("Edit").tag(Mode.edit)
                    Text("Preview").tag(Mode.preview)
                }
                .pickerStyle(.segmented)
                .frame(width: 160)
                Spacer()
                Button {
                    confirmingDelete = true
                } label: {
                    Image(systemName: "trash")
                        .foregroundStyle(Theme.destructive)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private var preview: AttributedString {
        (try? AttributedString(markdown: content, options: .init(interpretedSyntax: .full)))
            ?? AttributedString(content)
    }

    private func scheduleSave(immediate: Bool = false) {
        saveTask?.cancel()
        let update = RecipeUpdate(title: title, content: content, recipeType: recipeType)
        saveTask = Task {
            if !immediate {
                try? await Task.sleep(for: .seconds(1))
            }
            guard !Task.isCancelled else { return }
            await store.update(recipe, with: update)
        }
    }
}
