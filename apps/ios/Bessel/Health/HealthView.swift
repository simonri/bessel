import SwiftUI

/// Where a tap on the Health page leads.
enum HealthDestination: Hashable {
    case ring(HealthRing)
    case workouts
}

/// One glance at the day: sleep, movement and energy as rings against your
/// usual, a sentence about what that means, then last night, the week and the
/// day's timeline. Everything follows the day picked at the top.
struct HealthView: View {
    let auth: AuthSession
    let isActive: Bool

    @State private var store: HealthStore
    @State private var timeline: DayTimeline
    @State private var path: [HealthDestination] = []

    init(auth: AuthSession, services: AppServices, isActive: Bool) {
        self.auth = auth
        self.isActive = isActive
        _store = State(initialValue: HealthStore(client: services.client, cache: services.cache))
        _timeline = State(initialValue: DayTimeline(client: services.client))
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if store.isConnected {
                        DayPager(day: store.day, isToday: store.isToday) { offset in
                            Task { await store.step(offset) }
                        }
                        RingsCard(summary: store.summary, hasLoaded: store.hasLoaded) { ring in
                            path.append(.ring(ring))
                        }
                        .gesture(swipeDays)
                        if let sleep = store.summary?.sleep {
                            NavigationLink(value: HealthDestination.ring(.sleep)) {
                                LastNightCard(sleep: sleep, day: store.day)
                            }
                            .buttonStyle(.plain)
                        }
                        if let summary = store.summary, !summary.week.isEmpty {
                            WeekCard(summary: summary, latestWorkout: store.latestWorkout) {
                                path.append(.workouts)
                            }
                        }
                    } else {
                        ConnectHealthCard(isSyncing: store.isSyncing) {
                            Task { await store.connect() }
                        }
                    }
                    TimelineCard(timeline: timeline)
                    syncFooter
                }
                .padding(.top, Theme.pageTop)
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
                .animation(.snappy, value: store.summary)
            }
            .refreshable {
                await store.syncNow()
                await timeline.load()
            }
            .background(Theme.background)
            .navigationTitle("Health")
            .toolbarTitleDisplayMode(.inlineLarge)
            .toolbar {
                ProfileToolbarItem(auth: auth)
            }
            .navigationDestination(for: HealthDestination.self) { destination in
                switch destination {
                case .ring(.sleep): SleepDetailView(store: store)
                case .ring(.move): MoveDetailView(store: store) { path.append(.workouts) }
                case .ring(.energy): EnergyDetailView(store: store)
                case .workouts: AllWorkoutsView(store: store)
                }
            }
            .alert("Something went wrong", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(store.errorMessage ?? "")
            }
            .refreshWhileVisible(isActive) {
                await store.syncIfNeeded()
                await store.loadIfStale()
                await timeline.loadIfStale()
            }
            .loadErrorToast($store.loadError, isActive: isActive) { await store.load() }
            .onChange(of: store.day) { _, day in
                Task { await timeline.show(day) }
            }
            .haptic(.selection, trigger: store.day)
        }
    }

    /// Sideways on the rings to go a day back or forward.
    private var swipeDays: some Gesture {
        DragGesture(minimumDistance: 30)
            .onEnded { value in
                let dx = value.translation.width
                guard abs(dx) > 60, abs(dx) > abs(value.translation.height) * 1.5 else { return }
                Task { await store.step(dx < 0 ? 1 : -1) }
            }
    }

    @ViewBuilder
    private var syncFooter: some View {
        if store.isSyncing {
            HStack(spacing: 6) {
                ProgressView().controlSize(.mini)
                Text("Syncing with Apple Health")
            }
            .font(.caption)
            .foregroundStyle(Theme.faintForeground)
            .frame(maxWidth: .infinity)
        } else if let lastSyncedAt = store.lastSyncedAt {
            VStack(spacing: 6) {
                Text("Synced with Apple Health \(lastSyncedAt.formatted(.relative(presentation: .named)))")
                    .foregroundStyle(Theme.faintForeground)
                Button("Doesn't match Apple Health? Sync everything again") {
                    Task { await store.syncEverythingAgain() }
                }
                .foregroundStyle(Theme.mutedForeground)
            }
            .font(.caption)
            .frame(maxWidth: .infinity)
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )
    }
}

// MARK: - Day pager

private struct DayPager: View {
    let day: Date
    let isToday: Bool
    let onStep: (Int) -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text(HealthFormat.dayTitle(day))
                .font(.headline)
                .foregroundStyle(Theme.foreground)
                .contentTransition(.numericText())
            Spacer()
            pagerButton("chevron.left", label: "Previous day") { onStep(-1) }
            pagerButton("chevron.right", label: "Next day") { onStep(1) }
                .disabled(isToday)
                .opacity(isToday ? 0.35 : 1)
        }
        .animation(.snappy, value: day)
    }

    private func pagerButton(_ systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.foreground)
                .frame(width: 34, height: 34)
                .background(Theme.fill, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: - Rings

private struct RingsCard: View {
    let summary: HealthSummary?
    let hasLoaded: Bool
    let onOpen: (HealthRing) -> Void

    private var rings: [HealthRing] {
        // No heart data at all means no Apple Watch: two rings, not an empty third.
        summary?.energy == nil ? [.sleep, .move] : [.sleep, .move, .energy]
    }

    var body: some View {
        VStack(spacing: 18) {
            HStack(alignment: .top, spacing: 8) {
                ForEach(rings) { ring in
                    Button { onOpen(ring) } label: {
                        RingTile(ring: ring, score: score(ring), label: label(ring))
                    }
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity)
                }
            }
            Text(summary?.insight ?? " ")
                .font(.body.weight(.medium))
                .foregroundStyle(Theme.foreground)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
                .redacted(reason: summary == nil && !hasLoaded ? .placeholder : [])
        }
        .padding(.vertical, 22)
        .padding(.horizontal, 14)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    private func score(_ ring: HealthRing) -> Int? {
        switch ring {
        case .sleep: summary?.sleep?.score
        case .move: summary?.move?.score
        case .energy: summary?.energy?.score
        }
    }

    private func label(_ ring: HealthRing) -> String {
        guard let summary else { return " " }
        return switch ring {
        case .sleep: summary.sleep?.label ?? "Not recorded"
        case .move: summary.move?.label ?? "Not recorded"
        case .energy: summary.energy?.label ?? "Not recorded"
        }
    }
}

private struct RingTile: View {
    let ring: HealthRing
    let score: Int?
    let label: String

    var body: some View {
        VStack(spacing: 8) {
            ScoreRing(ring: ring, score: score, size: 82, lineWidth: 10)
            VStack(spacing: 1) {
                Text(ring.title)
                    .font(.caption)
                    .foregroundStyle(Theme.mutedForeground)
                Text(label)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(score == nil ? Theme.mutedForeground : Theme.foreground)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(ring.title): \(label)")
        .accessibilityAddTraits(.isButton)
    }
}

/// A soft ring filled to the score; empty while there's nothing to score yet.
struct ScoreRing: View {
    let ring: HealthRing
    let score: Int?
    var size: CGFloat
    var lineWidth: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .stroke(Theme.pastelWash(ring.hue, strength: 1.4), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: CGFloat(score ?? 0) / 100)
                .stroke(Theme.pastelSolid(ring.hue), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Image(systemName: ring.icon)
                .font(.system(size: size * 0.24, weight: .semibold))
                .foregroundStyle(Theme.pastel(ring.hue))
        }
        .frame(width: size, height: size)
        .animation(.smooth(duration: 0.6), value: score)
    }
}

// MARK: - Last night

private struct LastNightCard: View {
    let sleep: HealthSummary.Sleep
    let day: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(Theme.foreground)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.faintForeground)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(HealthFormat.duration(TimeInterval(sleep.asleepSecs)))
                    .font(.system(size: 34, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.foreground)
                Text(subtitle)
                    .font(.subheadline)
                    .monospacedDigit()
                    .foregroundStyle(Theme.mutedForeground)
            }
            if sleep.hasStages {
                StageBar(sleep: sleep)
            }
        }
        .card(padding: 18)
        .contentShape(Rectangle())
    }

    private var title: String {
        guard !Calendar.current.isDateInToday(day),
              let evening = Calendar.current.date(byAdding: .day, value: -1, to: day)
        else { return "Last night" }
        return "\(evening.formatted(.dateTime.weekday(.wide))) night"
    }

    /// "23:10 to 07:05 · 25m more than usual"
    private var subtitle: String {
        var parts: [String] = []
        if let onset = sleep.onset, let wake = sleep.wake {
            parts.append("\(HealthFormat.clock(onset)) to \(HealthFormat.clock(wake))")
        }
        if let usual = sleep.usualAsleepSecs {
            let diff = sleep.asleepSecs - usual
            parts.append(abs(diff) < 10 * 60 ? "about your usual" : "\(HealthFormat.duration(TimeInterval(abs(diff)))) \(diff > 0 ? "more" : "less") than usual")
        }
        return parts.joined(separator: " · ")
    }
}

/// The night's stages as one bar: square blocks in a rounded track, with a key.
struct StageBar: View {
    let sleep: HealthSummary.Sleep

    private var parts: [(stage: SleepStage, seconds: Int)] {
        [(.asleepDeep, sleep.deepSecs), (.asleepCore, sleep.coreSecs), (.asleepREM, sleep.remSecs), (.awake, sleep.awakeSecs)]
            .filter { $0.seconds > 0 }
    }

    var body: some View {
        let total = max(parts.map(\.seconds).reduce(0, +), 1)
        VStack(alignment: .leading, spacing: 10) {
            GeometryReader { geometry in
                HStack(spacing: 2) {
                    ForEach(parts, id: \.stage) { part in
                        Rectangle()
                            .fill(part.stage.color)
                            .frame(width: max((geometry.size.width - CGFloat(parts.count - 1) * 2) * CGFloat(part.seconds) / CGFloat(total), 2))
                    }
                }
            }
            .frame(height: 12)
            .clipShape(Capsule())
            .accessibilityHidden(true)

            LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)], spacing: 6) {
                ForEach(parts, id: \.stage) { part in
                    HStack(spacing: 6) {
                        Circle().fill(part.stage.color).frame(width: 7, height: 7)
                        Text(part.stage.label)
                            .foregroundStyle(Theme.mutedForeground)
                        Text(HealthFormat.duration(TimeInterval(part.seconds)))
                            .monospacedDigit()
                            .foregroundStyle(Theme.foreground)
                    }
                    .font(.footnote)
                    .lineLimit(1)
                }
            }
        }
    }
}

// MARK: - Week

private struct WeekCard: View {
    let summary: HealthSummary
    let latestWorkout: HealthKitWorkoutItem?
    let onShowWorkouts: () -> Void

    private var workoutDays: [HealthSummary.WeekDay] { summary.week.filter { $0.workoutMinutes > 0 } }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text("This week")
                    .font(.headline)
                    .foregroundStyle(Theme.foreground)
                Spacer()
                Text(weekLine)
                    .font(.subheadline)
                    .monospacedDigit()
                    .foregroundStyle(Theme.mutedForeground)
            }

            MoveWeekBars(week: summary.week, height: 72)

            if let latestWorkout {
                Button(action: onShowWorkouts) {
                    HStack(spacing: 0) {
                        WorkoutRow(workout: latestWorkout, caption: "Latest")
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.faintForeground)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.horizontal, -12)
            }
        }
        .card(padding: 18)
    }

    private var weekLine: String {
        let minutes = summary.week.map(\.workoutMinutes).reduce(0, +)
        guard !workoutDays.isEmpty else { return "No workouts yet" }
        let count = workoutDays.count
        return "\(count) workout \(count == 1 ? "day" : "days") · \(HealthFormat.duration(minutes * 60))"
    }
}

/// A week of movement: one rounded bar a day, the shown day brightest, a dot under days with a workout.
struct MoveWeekBars: View {
    let week: [HealthSummary.WeekDay]
    let height: CGFloat

    private let barWidth: CGFloat = 12

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            ForEach(week) { day in
                let isLast = day.id == week.last?.id
                VStack(spacing: 6) {
                    // A slim rounded track, filled up to the day's movement.
                    ZStack(alignment: .bottom) {
                        Capsule()
                            .fill(Theme.pastelWash(HealthRing.move.hue, strength: 1.4))
                        Capsule()
                            .fill(Theme.pastelSolid(HealthRing.move.hue).opacity(isLast ? 1 : 0.6))
                            .frame(height: max(barWidth, height * CGFloat(day.moveScore ?? 0) / 100))
                            .opacity(day.moveScore == nil ? 0 : 1)
                    }
                    .frame(width: barWidth, height: height)
                    Circle()
                        .fill(day.workoutMinutes > 0 ? Theme.pastelSolid(HealthRing.move.hue) : .clear)
                        .frame(width: 5, height: 5)
                    Text(day.day?.formatted(.dateTime.weekday(.narrow)) ?? "")
                        .font(.caption2.weight(isLast ? .bold : .regular))
                        .foregroundStyle(isLast ? Theme.foreground : Theme.faintForeground)
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(accessibility(day))
            }
        }
    }

    private func accessibility(_ day: HealthSummary.WeekDay) -> String {
        let name = day.day?.formatted(.dateTime.weekday(.wide)) ?? day.date
        let workout = day.workoutMinutes > 0 ? ", worked out \(HealthFormat.duration(day.workoutMinutes * 60))" : ""
        return "\(name): movement \(day.moveScore.map(String.init) ?? "not recorded")\(workout)"
    }
}

// MARK: - Connect

private struct ConnectHealthCard: View {
    let isSyncing: Bool
    let onConnect: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            HStack(spacing: -14) {
                ForEach(HealthRing.allCases) { ring in
                    ScoreRing(ring: ring, score: 70, size: 64, lineWidth: 8)
                        .background(Theme.card, in: Circle())
                }
            }
            VStack(spacing: 6) {
                Text("See how you're really doing")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Theme.foreground)
                Text("Connect Apple Health for a daily look at your sleep, movement and energy, compared with your own usual.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedForeground)
                    .multilineTextAlignment(.center)
            }
            Button(action: onConnect) {
                ZStack {
                    Text("Connect Apple Health").opacity(isSyncing ? 0 : 1)
                    if isSyncing { ProgressView().tint(.white) }
                }
                .font(.body.weight(.semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(Theme.primary, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(isSyncing)
        }
        .padding(22)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }
}
