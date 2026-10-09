import Charts
import SwiftUI

/// The gym log: every exercise with its last and best top set, today's ones
/// at the top. Tap one to log today's top set in a couple of taps.
struct GymPage<Header: View>: View {
    let store: GymStore
    @ViewBuilder let header: Header

    @State private var logging: GymExercise?
    @State private var search = ""
    @State private var composing = false
    @State private var draft = ""
    @State private var confirmingDelete: GymExercise?
    @State private var renaming: GymExercise?
    @State private var newName = ""
    @FocusState private var composerFocused: Bool

    /// From this many exercises on, a search field helps find one.
    private static var searchFrom: Int { 7 }

    private var filtered: [GymExercise] {
        guard !search.isEmpty else { return store.exercises }
        return store.exercises.filter { $0.name.localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        List {
            if store.hasLoaded && store.exercises.isEmpty {
                EmptyState(
                    emoji: "🏋️‍♀️",
                    title: "Your gym log",
                    detail: "Add the exercises you do. Each time, log your heaviest set and watch your best go up."
                )
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
                .listRowBackground(Color.clear)
            }
            ForEach(filtered) { exercise in
                Button { logging = exercise } label: {
                    GymExerciseRow(exercise: exercise)
                }
                .buttonStyle(.plain)
                .listRowBackground(Theme.card)
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button("Delete", role: .destructive) { confirmingDelete = exercise }
                }
                .contextMenu {
                    Button("Rename", systemImage: "pencil") {
                        newName = exercise.name
                        renaming = exercise
                    }
                    Button("Delete", systemImage: "trash", role: .destructive) { confirmingDelete = exercise }
                }
            }
        }
        .listStyle(.insetGrouped)
        .contentMargins(.top, 0, for: .scrollContent)
        .contentMargins(.bottom, 80, for: .scrollContent)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.immediately)
        .stickyHeader {
            VStack(alignment: .leading, spacing: 12) {
                header
                if store.exercises.count >= Self.searchFrom {
                    searchField
                }
            }
        }
        .background(Theme.background)
        .overlay {
            if !store.hasLoaded { ProgressView() }
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
                FloatingAddButton(label: "New exercise") {
                    withAnimation(.snappy) { composing = true }
                }
                .padding(.trailing, 16)
                .padding(.bottom, 12)
                .transition(.scale.combined(with: .opacity))
            }
        }
        .safeAreaInset(edge: .bottom) {
            if composing {
                Composer(placeholder: "Exercise name", text: $draft, isFocused: $composerFocused, onSubmit: addExercise) {
                    EmptyView()
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 8)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .onChange(of: composing) { _, isComposing in
            if isComposing { composerFocused = true }
        }
        .onChange(of: composerFocused) { _, focused in
            if !focused { withAnimation(.snappy) { composing = false } }
        }
        .sheet(item: $logging) { exercise in
            LogTopSetSheet(store: store, exerciseID: exercise.id)
        }
        .alert(
            "Delete this exercise?",
            isPresented: Binding(get: { confirmingDelete != nil }, set: { if !$0 { confirmingDelete = nil } }),
            presenting: confirmingDelete
        ) { exercise in
            Button("Delete", role: .destructive) { store.delete(exercise) }
            Button("Cancel", role: .cancel) {}
        } message: { exercise in
            Text("\(exercise.name) and all its top sets will be gone.")
        }
        .alert(
            "Rename exercise",
            isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } }),
            presenting: renaming
        ) { exercise in
            TextField("Name", text: $newName)
            Button("Save") { store.rename(exercise, to: newName) }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Something went wrong", isPresented: errorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(store.errorMessage ?? "")
        }
    }

    private func addExercise() {
        guard let exercise = store.addExercise(named: draft) else { return }
        draft = ""
        composerFocused = false
        withAnimation(.snappy) { composing = false }
        logging = exercise
    }

    /// In the page rather than `.searchable`, like Recipes.
    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Theme.mutedForeground)
            TextField("Search exercises", text: $search)
                .submitLabel(.search)
                .autocorrectionDisabled()
            if !search.isEmpty {
                Button {
                    search = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(Theme.faintForeground)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 44)
        .background(Theme.fill, in: Capsule())
    }

    private var errorBinding: Binding<Bool> {
        Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })
    }
}

// MARK: - Row

private struct GymExerciseRow: View {
    let exercise: GymExercise

    private var today: GymSet? { exercise.set(on: GymStore.today()) }

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(exercise.name)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Theme.foreground)
                Text(subtitle)
                    .font(.subheadline)
                    .monospacedDigit()
                    .foregroundStyle(Theme.mutedForeground)
            }
            Spacer(minLength: 8)
            if exercise.recentSets.count > 1 {
                Sparkline(sets: exercise.recentSets)
                    .frame(width: 54, height: 26)
                    .accessibilityHidden(true)
            }
            if let today {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark")
                        .font(.caption.weight(.bold))
                    Text(GymFormat.weight(today.weightKg))
                }
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.pastel(GymTheme.hue))
                    .padding(.horizontal, 10)
                    .frame(height: 30)
                    .background(Theme.pastelWash(GymTheme.hue, strength: 1.4), in: Capsule())
            }
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Log today's top set")
    }

    /// "Last 60 kg · Tue · Best 65 kg", or a nudge for a new one.
    private var subtitle: String {
        guard let last = exercise.lastSet else { return "Tap to log your first top set" }
        var parts = ["\(GymFormat.weight(last.weightKg)) · \(GymFormat.day(last))"]
        if let best = exercise.bestSet, best != last {
            parts.append("Best \(GymFormat.weight(best.weightKg))")
        }
        return parts.joined(separator: " · ")
    }
}

/// The last few top sets as a tiny line, rising when you're getting stronger.
private struct Sparkline: View {
    let sets: [GymSet]

    var body: some View {
        Chart(Array(sets.enumerated()), id: \.offset) { index, set in
            LineMark(x: .value("Session", index), y: .value("Weight", set.weightKg))
                .interpolationMethod(.monotone)
                .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
                .foregroundStyle(Theme.pastelSolid(GymTheme.hue))
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartYScale(domain: .automatic(includesZero: false))
    }
}

enum GymTheme {
    static let hue: Double = 25
}

// MARK: - Logging

/// Today's top set in a couple of taps: the last weight is already there,
/// big buttons nudge it, Save. Below, how the exercise has gone over time.
struct LogTopSetSheet: View {
    let store: GymStore
    let exerciseID: UUID

    @Environment(\.dismiss) private var dismiss
    @AppStorage("gym.step") private var step = 2.5
    @State private var weight: Double = 0
    @State private var weightText = ""
    @State private var history: [GymSet] = []
    @State private var celebrating = false
    @State private var savedTrigger = 0
    @FocusState private var editingWeight: Bool

    private static let steps: [Double] = [1, 2.5, 5]

    private var exercise: GymExercise? { store.exercise(exerciseID) }
    private var today: String { GymStore.today() }

    var body: some View {
        NavigationStack {
            ScrollView {
                if let exercise {
                    VStack(spacing: 22) {
                        context(exercise)
                        weightPicker
                        saveButton(exercise)
                        ProgressCard(sets: history, best: exercise.bestSet)
                        HistoryCard(sets: history) { set in
                            store.deleteSet(of: exercise, on: set.performedOn)
                            history.removeAll { $0.performedOn == set.performedOn }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 4)
                    .padding(.bottom, 24)
                }
            }
            .scrollDismissesKeyboard(.immediately)
            .background(Theme.background)
            .navigationTitle(exercise?.name ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .overlay {
                if celebrating {
                    NewBestBanner()
                        .transition(.scale(scale: 0.8).combined(with: .opacity))
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Theme.background)
        .presentationCornerRadius(28)
        .presentationDragIndicator(.hidden)
        .sensoryFeedback(.success, trigger: savedTrigger)
        .onAppear(perform: prefill)
        .task { await loadHistory() }
    }

    private func context(_ exercise: GymExercise) -> some View {
        Text(contextLine(exercise))
            .font(.subheadline)
            .monospacedDigit()
            .foregroundStyle(Theme.mutedForeground)
            .frame(maxWidth: .infinity)
    }

    /// "Best 65 kg · Last 60 kg on Tue"
    private func contextLine(_ exercise: GymExercise) -> String {
        var parts: [String] = []
        if let best = exercise.bestSet { parts.append("Best \(GymFormat.weight(best.weightKg))") }
        if let last = exercise.lastSet {
            let when = GymFormat.day(last)
            parts.append("Last \(GymFormat.weight(last.weightKg)) \(when == "Today" ? "today" : "on \(when)")")
        }
        return parts.isEmpty ? "Your heaviest set today" : parts.joined(separator: " · ")
    }

    // MARK: Weight

    private var weightPicker: some View {
        VStack(spacing: 14) {
            HStack(spacing: 14) {
                stepButton("minus", label: "Less") { nudge(-step) }
                VStack(spacing: 0) {
                    TextField("0", text: $weightText)
                        .keyboardType(.decimalPad)
                        .focused($editingWeight)
                        .multilineTextAlignment(.center)
                        .font(.system(size: 56, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Theme.foreground)
                        .minimumScaleFactor(0.5)
                        .onChange(of: weightText) { _, text in
                            if let value = GymFormat.parse(text) { weight = value }
                        }
                        .accessibilityLabel("Weight in kilograms")
                    Text("kg")
                        .font(.headline)
                        .foregroundStyle(Theme.mutedForeground)
                }
                .frame(maxWidth: .infinity)
                stepButton("plus", label: "More") { nudge(step) }
            }
            HStack(spacing: 8) {
                ForEach(Self.steps, id: \.self) { value in
                    FilterPill(title: "± \(GymFormat.number(value))", isSelected: step == value) {
                        step = value
                    }
                }
            }
        }
        .padding(18)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func stepButton(_ systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(Theme.pastel(GymTheme.hue))
                .frame(width: 64, height: 64)
                .background(Theme.pastelWash(GymTheme.hue, strength: 1.4), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(label), \(GymFormat.number(step)) kilograms")
        .buttonRepeatBehavior(.enabled)
        .sensoryFeedback(.selection, trigger: weight)
    }

    private func nudge(_ delta: Double) {
        editingWeight = false
        weight = max(0, ((weight + delta) * 100).rounded() / 100)
        weightText = GymFormat.number(weight)
    }

    private func saveButton(_ exercise: GymExercise) -> some View {
        let alreadyToday = exercise.set(on: today) != nil
        return Button {
            save(exercise)
        } label: {
            Text(alreadyToday ? "Update today's top set" : "Save top set")
                .font(.body.weight(.semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 56)
                .background(Theme.primary, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(GymFormat.parse(weightText) == nil)
        .opacity(GymFormat.parse(weightText) == nil ? 0.5 : 1)
    }

    private func save(_ exercise: GymExercise) {
        guard let value = GymFormat.parse(weightText), value >= 0 else { return }
        editingWeight = false
        let isNewBest = store.logTopSet(exercise, weightKg: value)
        history.removeAll { $0.performedOn == today }
        history.append(GymSet(performedOn: today, weightKg: (value * 100).rounded() / 100))
        savedTrigger += 1
        guard isNewBest else {
            dismiss()
            return
        }
        withAnimation(.bouncy) { celebrating = true }
        Task {
            try? await Task.sleep(for: .seconds(1.6))
            dismiss()
        }
    }

    /// Today's top set if there is one, else the last, so most days it's just Save.
    private func prefill() {
        guard let exercise else { return }
        let start = exercise.set(on: today)?.weightKg ?? exercise.lastSet?.weightKg ?? 20
        weight = start
        weightText = GymFormat.number(start)
        history = exercise.recentSets
    }

    private func loadHistory() async {
        guard let exercise else { return }
        history = await store.history(of: exercise)
    }
}

private struct NewBestBanner: View {
    var body: some View {
        VStack(spacing: 6) {
            Text("🎉")
                .font(.system(size: 54))
            Text("New best!")
                .font(.title2.weight(.bold))
                .foregroundStyle(Theme.foreground)
            Text("Heaviest top set yet")
                .font(.subheadline)
                .foregroundStyle(Theme.mutedForeground)
        }
        .padding(28)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: .black.opacity(0.15), radius: 24, y: 8)
    }
}

/// Top-set weight over time, with the best marked.
private struct ProgressCard: View {
    let sets: [GymSet]
    let best: GymSet?

    private var points: [(date: Date, weight: Double)] {
        sets.compactMap { set in set.day.map { ($0, set.weightKg) } }
    }

    var body: some View {
        if points.count > 1 {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Progress")
                        .font(.headline)
                        .foregroundStyle(Theme.foreground)
                    Spacer()
                    if let change {
                        Text(change)
                            .font(.subheadline)
                            .monospacedDigit()
                            .foregroundStyle(Theme.mutedForeground)
                    }
                }
                Chart {
                    ForEach(points, id: \.date) { point in
                        LineMark(x: .value("Day", point.date), y: .value("kg", point.weight))
                            .interpolationMethod(.monotone)
                            .foregroundStyle(Theme.pastelSolid(GymTheme.hue))
                            .lineStyle(StrokeStyle(lineWidth: 3, lineCap: .round))
                        PointMark(x: .value("Day", point.date), y: .value("kg", point.weight))
                            .foregroundStyle(Theme.pastelSolid(GymTheme.hue))
                            .symbolSize(30)
                    }
                    if let best {
                        RuleMark(y: .value("Best", best.weightKg))
                            .foregroundStyle(Theme.faintForeground)
                            .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                            .annotation(position: .top, alignment: .leading) {
                                Text("Best \(GymFormat.weight(best.weightKg))")
                                    .font(.caption2)
                                    .foregroundStyle(Theme.faintForeground)
                            }
                    }
                }
                .chartYScale(domain: .automatic(includesZero: false))
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                    }
                }
                .frame(height: 180)
            }
            .padding(18)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
    }

    /// "+7.5 kg since Aug 4"
    private var change: String? {
        guard let first = sets.first, let last = sets.last, first != last, let since = first.day else { return nil }
        let diff = last.weightKg - first.weightKg
        let sign = diff > 0 ? "+" : diff < 0 ? "−" : "±"
        return "\(sign)\(GymFormat.number(abs(diff))) kg since \(since.formatted(.dateTime.month(.abbreviated).day()))"
    }
}

/// Every top set, newest first; touch and hold one to remove it.
private struct HistoryCard: View {
    let sets: [GymSet]
    let onDelete: (GymSet) -> Void

    var body: some View {
        if !sets.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("History")
                    .font(.headline)
                    .foregroundStyle(Theme.foreground)
                    .padding(.leading, 4)
                VStack(spacing: 0) {
                    ForEach(Array(sets.reversed().enumerated()), id: \.element.performedOn) { index, set in
                        if index > 0 {
                            Theme.border.frame(height: 0.5).padding(.leading, 16)
                        }
                        HStack {
                            Text(set.day?.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()) ?? set.performedOn)
                                .foregroundStyle(Theme.mutedForeground)
                            Spacer()
                            Text(GymFormat.weight(set.weightKg))
                                .monospacedDigit()
                                .foregroundStyle(Theme.foreground)
                        }
                        .font(.subheadline)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 46)
                        .contentShape(Rectangle())
                        .contextMenu {
                            Button("Remove", systemImage: "trash", role: .destructive) { onDelete(set) }
                        }
                    }
                }
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                Text("Touch and hold a day to remove it.")
                    .font(.caption)
                    .foregroundStyle(Theme.faintForeground)
                    .padding(.leading, 4)
            }
        }
    }
}
