import SwiftUI

/// Full-screen cooking: one step at a time in large type, with the
/// ingredients pinned underneath so both are visible while you cook.
struct CookingModeView: View {
    let recipe: RecipeItem
    @Binding var ticked: Set<String>

    @Environment(\.dismiss) private var dismiss
    @State private var stepIndex = 0

    private var steps: [RecipeBody.Step] { recipe.body.steps }
    private var isLastStep: Bool { stepIndex == steps.count - 1 }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                progress
                TabView(selection: $stepIndex) {
                    ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                        ScrollView {
                            stepContent(step, number: index + 1)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 16)
                        }
                        .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .frame(maxHeight: .infinity)

                navigation
                ingredients
            }
            .background(Theme.background)
            .navigationTitle(recipe.title.isEmpty ? "Cooking" : recipe.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .haptic(.selection, trigger: stepIndex)
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
    }

    // MARK: - Step

    private var progress: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Step \(stepIndex + 1) of \(steps.count)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.mutedForeground)
            ProgressView(value: Double(stepIndex + 1), total: Double(max(steps.count, 1)))
                .tint(Theme.primary)
                .animation(.snappy, value: stepIndex)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    private func stepContent(_ step: RecipeBody.Step, number: Int) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if let title = step.title, !title.isEmpty {
                Text(title)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Theme.foreground)
            }
            if !step.text.isEmpty {
                MarkdownText(step.text)
                    .font(.title3)
                    .foregroundStyle(Theme.foreground)
            }
            if let time = step.timeLabel {
                Chip(text: time, hue: 235, systemImage: "timer")
            }
            ForEach(Array(step.callouts.enumerated()), id: \.offset) { _, callout in
                CalloutCard(callout: callout)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var navigation: some View {
        HStack(spacing: 12) {
            Button {
                withAnimation(.snappy) { stepIndex -= 1 }
            } label: {
                Label("Back", systemImage: "chevron.left")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(stepIndex == 0)

            Button {
                if isLastStep {
                    dismiss()
                } else {
                    withAnimation(.snappy) { stepIndex += 1 }
                }
            } label: {
                Label(isLastStep ? "Finish" : "Next", systemImage: isLastStep ? "checkmark" : "chevron.right")
                    .labelStyle(TrailingIconLabelStyle())
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.primary)
        }
        .controlSize(.large)
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    // MARK: - Ingredients

    @ViewBuilder
    private var ingredients: some View {
        let groups = recipe.body.ingredientGroups
        if !groups.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Ingredients")
                        .font(.headline)
                        .foregroundStyle(Theme.foreground)
                    Spacer()
                    Text("\(ticked.count) of \(recipe.ingredientCount) used")
                        .font(.caption)
                        .foregroundStyle(Theme.mutedForeground)
                }
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(groups.enumerated()), id: \.offset) { groupIndex, group in
                            VStack(alignment: .leading, spacing: 0) {
                                if let title = group.title, !title.isEmpty {
                                    Text(title)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(Theme.mutedForeground)
                                        .padding(.bottom, 2)
                                }
                                ForEach(Array(group.items.enumerated()), id: \.offset) { index, item in
                                    IngredientRow(item: item, key: "\(groupIndex)-\(index)", ticked: $ticked)
                                }
                            }
                        }
                    }
                }
                .scrollIndicators(.visible)
            }
            .padding([.top, .horizontal], 16)
            .frame(maxHeight: 280)
            .background {
                UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24, style: .continuous)
                    .fill(Theme.card)
                    .ignoresSafeArea(edges: .bottom)
            }
            // The list runs to the bottom edge; the scroll view keeps its last
            // row clear of the home indicator on its own.
            .ignoresSafeArea(.container, edges: .bottom)
        }
    }
}

/// Puts the icon after the title, for a "Next ›" button.
private struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.title
            configuration.icon
        }
    }
}
