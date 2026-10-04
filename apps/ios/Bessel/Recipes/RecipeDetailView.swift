import SwiftUI

/// Cook view: ingredients you tick off as you go, numbered steps and tip cards.
struct RecipeDetailView: View {
    let store: RecipesStore
    let recipeID: UUID

    @Environment(\.dismiss) private var dismiss
    @Environment(ToastCenter.self) private var toasts
    @State private var ticked: Set<String> = []
    @State private var editing = false

    var body: some View {
        Group {
            if let recipe = store.recipe(recipeID) {
                content(recipe)
                    .toolbar { toolbar(recipe) }
                    .sheet(isPresented: $editing) {
                        RecipeEditorView(store: store, recipe: recipe) { _ in }
                    }
            } else {
                EmptyState(emoji: "🍽️", title: "This recipe is gone")
            }
        }
        .background(Theme.background)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    private func content(_ recipe: RecipeItem) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header(recipe)
                let body = recipe.body
                if !body.ingredientGroups.isEmpty {
                    ingredients(body.ingredientGroups)
                }
                if !body.steps.isEmpty {
                    steps(body.steps)
                }
                ForEach(Array(body.sections.enumerated()), id: \.offset) { _, section in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(section.title)
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(Theme.foreground)
                        MarkdownText(section.text)
                    }
                }
                if body.ingredientGroups.isEmpty && body.steps.isEmpty && body.sections.isEmpty && !recipe.content.isEmpty {
                    MarkdownText(recipe.content)
                        .card()
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 32)
        }
    }

    // MARK: - Header

    private func header(_ recipe: RecipeItem) -> some View {
        let type = recipe.recipeType
        return VStack(alignment: .leading, spacing: 12) {
            Text(type.emoji)
                .font(.system(size: 34))
                .frame(width: 64, height: 64)
                .background(Theme.pastelWash(type.hue, strength: 1.5), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            Text(recipe.title.isEmpty ? "Untitled" : recipe.title)
                .font(.largeTitle.weight(.bold))
                .foregroundStyle(Theme.foreground)
            HStack(spacing: 6) {
                Chip(text: type.label, hue: type.hue)
                if let minutes = recipe.body.totalMinutes {
                    Chip(text: Self.minutesLabel(minutes), hue: 235, systemImage: "clock")
                }
                if let yield = recipe.body.yieldText {
                    Chip(text: yield, hue: 165, systemImage: "person.2")
                }
            }
            if let intro = recipe.body.intro, !intro.isEmpty {
                MarkdownText(intro)
                    .foregroundStyle(Theme.mutedForeground)
            }
        }
        .padding(.top, 8)
    }

    // MARK: - Ingredients

    private func ingredients(_ groups: [RecipeBody.IngredientGroup]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Ingredients")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Theme.foreground)
                Spacer()
                if !ticked.isEmpty {
                    Button("Reset") {
                        withAnimation(.snappy) { ticked.removeAll() }
                    }
                    .font(.subheadline.weight(.medium))
                }
            }
            VStack(alignment: .leading, spacing: 16) {
                ForEach(Array(groups.enumerated()), id: \.offset) { groupIndex, group in
                    VStack(alignment: .leading, spacing: 2) {
                        if let title = group.title, !title.isEmpty {
                            Text(title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.mutedForeground)
                                .padding(.bottom, 4)
                        }
                        ForEach(Array(group.items.enumerated()), id: \.offset) { index, item in
                            ingredientRow(item, key: "\(groupIndex)-\(index)")
                        }
                    }
                }
            }
            .card()
        }
    }

    private func ingredientRow(_ item: RecipeBody.Ingredient, key: String) -> some View {
        let isTicked = ticked.contains(key)
        return Button {
            withAnimation(.snappy) {
                if isTicked { ticked.remove(key) } else { ticked.insert(key) }
            }
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                CheckCircle(isChecked: isTicked, tint: Theme.positive, size: 20)
                    .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 5 }
                VStack(alignment: .leading, spacing: 1) {
                    (Text(quantity(item)).fontWeight(.semibold) + Text(item.name))
                        .foregroundStyle(isTicked ? Theme.faintForeground : Theme.foreground)
                        .strikethrough(isTicked, color: Theme.faintForeground)
                    if let note = item.note {
                        Text(note)
                            .font(.caption)
                            .foregroundStyle(Theme.faintForeground)
                    }
                }
                Spacer(minLength: 0)
            }
            .font(.body)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .haptic(.selection, trigger: isTicked)
    }

    private func quantity(_ item: RecipeBody.Ingredient) -> String {
        let parts = [item.amount.map(IngredientLine.formatAmount), item.unit].compactMap { $0 }
        return parts.isEmpty ? "" : parts.joined(separator: " ") + " "
    }

    // MARK: - Steps

    private func steps(_ steps: [RecipeBody.Step]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Steps")
                .font(.title3.weight(.semibold))
                .foregroundStyle(Theme.foreground)
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .top, spacing: 14) {
                    Text("\(index + 1)")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Theme.primary)
                        .frame(width: 30, height: 30)
                        .background(Theme.primarySoft, in: Circle())
                    VStack(alignment: .leading, spacing: 8) {
                        if let title = step.title, !title.isEmpty {
                            Text(title)
                                .font(.headline)
                                .foregroundStyle(Theme.foreground)
                        }
                        if !step.text.isEmpty {
                            MarkdownText(step.text)
                        }
                        if let time = step.timeLabel {
                            Chip(text: time, hue: 235, systemImage: "timer")
                        }
                        ForEach(Array(step.callouts.enumerated()), id: \.offset) { _, callout in
                            CalloutCard(callout: callout)
                        }
                    }
                    .padding(.top, 4)
                }
                .card()
            }
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private func toolbar(_ recipe: RecipeItem) -> some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button("Edit") { editing = true }
        }
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                ShareLink(item: recipe.content.isEmpty ? recipe.title : recipe.content) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                Button(role: .destructive) {
                    dismiss()
                    store.delete(recipe, toasts: toasts)
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis")
            }
            .accessibilityLabel("More")
        }
    }

    static func minutesLabel(_ minutes: Int) -> String {
        minutes >= 60
            ? (minutes % 60 == 0 ? "\(minutes / 60) h" : "\(minutes / 60) h \(minutes % 60) min")
            : "\(minutes) min"
    }
}

private struct CalloutCard: View {
    let callout: RecipeBody.Callout

    private var isWarning: Bool { callout.kind == "warning" }

    var body: some View {
        let hue: Double = isWarning ? 15 : 75
        HStack(alignment: .top, spacing: 8) {
            Text(isWarning ? "⚠️" : "💡")
            VStack(alignment: .leading, spacing: 2) {
                Text(callout.label ?? (isWarning ? "Watch out" : "Tip"))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.pastel(hue))
                MarkdownText(callout.text)
                    .font(.subheadline)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.pastelWash(hue), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// Light markdown (bold, italic, links, lists, headings) for recipe text fields.
struct MarkdownText: View {
    let markdown: String

    init(_ markdown: String) {
        self.markdown = markdown
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(MarkdownBlock.parse(markdown)) { block in
                switch block.kind {
                case .heading:
                    Text(block.text).font(.headline)
                case .listItem(let ordinal, let indentationLevel):
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(ordinal.map { "\($0)." } ?? "•")
                            .foregroundStyle(Theme.mutedForeground)
                        Text(block.text)
                    }
                    .padding(.leading, CGFloat(max(indentationLevel - 1, 0)) * 16)
                case .blockQuote:
                    Text(block.text).foregroundStyle(Theme.mutedForeground).italic()
                case .codeBlock:
                    Text(block.text).font(.system(.subheadline, design: .monospaced))
                case .thematicBreak:
                    Divider()
                case .paragraph:
                    Text(block.text)
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
