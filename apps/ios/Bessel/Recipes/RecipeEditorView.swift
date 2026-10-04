import SwiftUI

/// Edits a recipe as structure: ingredients one per line, steps one per field.
/// Parts the phone doesn't edit (sections, tips, step titles) are kept as they are.
struct RecipeEditorView: View {
    let store: RecipesStore
    let recipe: RecipeItem?
    let onCreated: (RecipeItem) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var type: RecipeType
    @State private var totalMinutes: String
    @State private var yieldText: String
    @State private var groups: [GroupDraft]
    @State private var steps: [StepDraft]
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let original: RecipeBody

    struct GroupDraft: Identifiable {
        let id = UUID()
        var title: String
        var lines: String
    }

    struct StepDraft: Identifiable {
        let id = UUID()
        var text: String
        /// The step this came from, so its title, time and tips survive editing.
        var source: RecipeBody.Step?
    }

    init(store: RecipesStore, recipe: RecipeItem?, draft: RecipeImportResult? = nil, onCreated: @escaping (RecipeItem) -> Void) {
        self.store = store
        self.recipe = recipe
        self.onCreated = onCreated
        let body = recipe?.body ?? draft?.body ?? RecipeBody()
        original = body
        _title = State(initialValue: recipe?.title ?? draft?.title ?? "")
        _type = State(initialValue: recipe?.recipeType ?? draft?.recipeType ?? .main)
        _totalMinutes = State(initialValue: body.totalMinutes.map(String.init) ?? "")
        _yieldText = State(initialValue: body.yieldText ?? "")
        let groupDrafts = body.ingredientGroups.map {
            GroupDraft(title: $0.title ?? "", lines: $0.items.map(IngredientLine.format).joined(separator: "\n"))
        }
        _groups = State(initialValue: groupDrafts.isEmpty ? [GroupDraft(title: "", lines: "")] : groupDrafts)
        let stepDrafts = body.steps.map { StepDraft(text: $0.text, source: $0) }
        _steps = State(initialValue: stepDrafts.isEmpty ? [StepDraft(text: "", source: nil)] : stepDrafts)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Recipe name", text: $title, axis: .vertical)
                        .font(.title3.weight(.semibold))
                    HStack(spacing: 8) {
                        ForEach(RecipeType.allCases) { option in
                            FilterPill(title: "\(option.emoji) \(option.label)", isSelected: type == option) {
                                withAnimation(.snappy) { type = option }
                            }
                        }
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                }
                .listRowBackground(Theme.card)

                Section {
                    HStack {
                        Label("Total time", systemImage: "clock")
                        Spacer()
                        TextField("0", text: $totalMinutes)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 64)
                        Text("min")
                            .foregroundStyle(Theme.mutedForeground)
                    }
                    HStack {
                        Label("Makes", systemImage: "person.2")
                        Spacer()
                        TextField("4 servings", text: $yieldText)
                            .multilineTextAlignment(.trailing)
                    }
                }
                .listRowBackground(Theme.card)

                ForEach($groups) { $group in
                    Section {
                        if groups.count > 1 || !group.title.isEmpty {
                            TextField("Group name, like Dough", text: $group.title)
                                .font(.subheadline.weight(.semibold))
                        }
                        TextField("2 dl milk\n1 tsk salt", text: $group.lines, axis: .vertical)
                            .lineLimit(4...)
                    } header: {
                        if group.id == groups.first?.id {
                            SectionHeading(title: "Ingredients")
                        }
                    } footer: {
                        if group.id == groups.last?.id {
                            HStack {
                                Text("One per line, like \"2 dl milk, warm\".")
                                Spacer()
                                Button("Add group") {
                                    groups.append(GroupDraft(title: "", lines: ""))
                                }
                                .font(.footnote.weight(.semibold))
                            }
                            .font(.footnote)
                        }
                    }
                    .listRowBackground(Theme.card)
                }

                Section {
                    ForEach(Array($steps.enumerated()), id: \.element.id) { index, $step in
                        HStack(alignment: .top, spacing: 12) {
                            Text("\(index + 1)")
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(Theme.primary)
                                .frame(width: 24, height: 24)
                                .background(Theme.primarySoft, in: Circle())
                            TextField("What to do", text: $step.text, axis: .vertical)
                                .lineLimit(2...)
                        }
                    }
                    .onDelete { steps.remove(atOffsets: $0) }
                    .onMove { steps.move(fromOffsets: $0, toOffset: $1) }
                    Button {
                        steps.append(StepDraft(text: "", source: nil))
                    } label: {
                        Label("Add step", systemImage: "plus")
                    }
                } header: {
                    SectionHeading(title: "Steps")
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
            }
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.background)
            .navigationTitle(recipe == nil ? "New recipe" : "Edit recipe")
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
        }
        .presentationCornerRadius(28)
        .interactiveDismissDisabled(isSaving)
    }

    private var editedBody: RecipeBody {
        var body = original
        let trimmedYield = yieldText.trimmingCharacters(in: .whitespaces)
        body.yieldText = trimmedYield.isEmpty ? nil : trimmedYield
        body.totalMinutes = Int(totalMinutes.trimmingCharacters(in: .whitespaces)).flatMap { $0 > 0 ? $0 : nil }
        body.ingredientGroups = groups.compactMap { group in
            let items = group.lines
                .split(whereSeparator: \.isNewline)
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
                .map(IngredientLine.parse)
            let groupTitle = group.title.trimmingCharacters(in: .whitespaces)
            guard !items.isEmpty || !groupTitle.isEmpty else { return nil }
            return RecipeBody.IngredientGroup(title: groupTitle.isEmpty ? nil : groupTitle, items: items)
        }
        body.steps = steps.compactMap { draft in
            let text = draft.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            var step = draft.source ?? RecipeBody.Step()
            step.text = text
            return step
        }
        return body
    }

    private func save() {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = editedBody
        isSaving = true
        errorMessage = nil
        Task {
            defer { isSaving = false }
            do {
                if let recipe {
                    let update = RecipeUpdate(
                        title: trimmedTitle == recipe.title ? nil : trimmedTitle,
                        recipeType: type == recipe.recipeType ? nil : type,
                        body: body == recipe.body && recipe.structured ? nil : body
                    )
                    if update.title != nil || update.recipeType != nil || update.body != nil {
                        try await store.update(recipe, with: update)
                    }
                    dismiss()
                } else {
                    let created = try await store.create(RecipeCreate(title: trimmedTitle, recipeType: type, body: body))
                    dismiss()
                    onCreated(created)
                }
            } catch {
                errorMessage = "Couldn't save: \(error.localizedDescription)"
            }
        }
    }
}

/// Paste a recipe from anywhere; the API tidies it into ingredients and steps.
struct RecipePasteView: View {
    let store: RecipesStore
    let onCreated: (RecipeItem) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var isWorking = false
    @State private var errorMessage: String?
    @State private var draft: RecipeImportResult?
    @FocusState private var isFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Text("Paste a recipe from a website, a note or a message. We'll tidy it into ingredients and steps for you to check.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedForeground)

                ZStack(alignment: .topLeading) {
                    if text.isEmpty {
                        Text("Paste here…")
                            .foregroundStyle(Theme.faintForeground)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 8)
                    }
                    TextEditor(text: $text)
                        .focused($isFocused)
                        .scrollContentBackground(.hidden)
                }
                .padding(12)
                .frame(maxHeight: .infinity)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))

                if let errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.circle")
                        .font(.footnote)
                        .foregroundStyle(Theme.destructive)
                }

                HStack(spacing: 10) {
                    if text.isEmpty {
                        PasteButton(payloadType: String.self) { strings in
                            text = strings.joined(separator: "\n")
                        }
                        .buttonBorderShape(.capsule)
                        .controlSize(.large)
                        .tint(Theme.foreground)
                    }
                    Button(action: tidy) {
                        ZStack {
                            Text("Tidy it up ✨").opacity(isWorking ? 0 : 1)
                            if isWorking { ProgressView().tint(.white) }
                        }
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(Theme.primary, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWorking)
                    .opacity(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)
                }
            }
            .padding(16)
            .background(Theme.background)
            .navigationTitle("Paste a recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .navigationDestination(item: $draft) { draft in
                RecipeEditorView(store: store, recipe: nil, draft: draft) { created in
                    dismiss()
                    onCreated(created)
                }
                .navigationBarBackButtonHidden()
            }
        }
        .presentationCornerRadius(28)
    }

    private func tidy() {
        isWorking = true
        errorMessage = nil
        isFocused = false
        Task {
            defer { isWorking = false }
            do {
                draft = try await store.structure(text)
            } catch {
                errorMessage = "Couldn't tidy this one right now. Try again, or start from scratch."
            }
        }
    }
}

extension RecipeImportResult: Hashable, Identifiable {
    var id: String { title }

    static func == (lhs: RecipeImportResult, rhs: RecipeImportResult) -> Bool {
        lhs.title == rhs.title && lhs.body == rhs.body
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(title)
    }
}
