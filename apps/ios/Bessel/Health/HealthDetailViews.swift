import SwiftUI

// MARK: - Sleep

struct SleepDetailView: View {
    let store: HealthStore

    var body: some View {
        DetailPage(title: "Sleep") {
            if let sleep = store.summary?.sleep {
                DetailHeader(ring: .sleep, score: sleep.score, label: sleep.label, caption: caption(sleep))

                VStack(alignment: .leading, spacing: 16) {
                    if let onset = sleep.onset, let wake = sleep.wake {
                        HStack(spacing: 0) {
                            TimeStat(label: "Fell asleep", date: onset, systemImage: "moon.stars.fill", hue: 280)
                            TimeStat(label: "Woke up", date: wake, systemImage: "sun.max.fill", hue: 55)
                        }
                        if !store.nightSegments.isEmpty {
                            NightChart(segments: store.nightSegments, start: onset, end: wake)
                        }
                    }
                    if sleep.hasStages {
                        StageBreakdown(sleep: sleep)
                    }
                }
                .card(padding: 18)

                if store.recentNights.count > 1 {
                    NightsCard(nights: store.recentNights, usual: sleep.usualAsleepSecs.map(TimeInterval.init))
                }

                if let streak = store.summary?.bedtimeStreak, streak >= 2 {
                    Label("\(streak) nights in a row near your usual bedtime", systemImage: "sparkles")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Theme.pastel(HealthRing.sleep.hue))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .card(padding: 16)
                }

                Footnote("Your sleep score looks at time asleep, going to bed near your usual time, and how much of the night was deep and REM sleep. It's compared with your own nights, not anyone else's.")
            } else {
                EmptyState(emoji: "🌙", title: "No sleep recorded", detail: "Wear your Apple Watch to bed, or set a sleep schedule in the Health app, to see your nights here.")
                    .padding(.top, 40)
            }
        }
        .task(id: store.day) { await store.loadSleepDetail() }
    }

    private func caption(_ sleep: HealthSummary.Sleep) -> String {
        var text = "\(HealthFormat.duration(TimeInterval(sleep.asleepSecs))) asleep"
        if let usual = sleep.usualAsleepSecs {
            text += " · usually \(HealthFormat.duration(TimeInterval(usual)))"
        }
        return text
    }
}

private struct NightsCard: View {
    let nights: [SleepNight]
    let usual: TimeInterval?

    private let maxHours = 10.0
    private let height: CGFloat = 96

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text("Last two weeks")
                    .font(.headline)
                    .foregroundStyle(Theme.foreground)
                Spacer()
                if let usual {
                    Text("Usually \(HealthFormat.duration(usual))")
                        .font(.subheadline)
                        .monospacedDigit()
                        .foregroundStyle(Theme.mutedForeground)
                }
            }
            HStack(alignment: .bottom, spacing: 5) {
                ForEach(nights) { night in
                    let isLast = night == nights.last
                    VStack(spacing: 6) {
                        ZStack(alignment: .bottom) {
                            Capsule()
                                .fill(SleepStage.asleepREM.color.opacity(0.18))
                            Capsule()
                                .fill(SleepStage.asleepREM.color.opacity(isLast ? 1 : 0.6))
                                .frame(height: max(8, height * min(night.asleep / 3600, maxHours) / maxHours))
                        }
                        .frame(width: 8, height: height)
                        Text(night.wakeDate.formatted(.dateTime.weekday(.narrow)))
                            .font(.caption2.weight(isLast ? .bold : .regular))
                            .foregroundStyle(isLast ? Theme.foreground : Theme.faintForeground)
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(night.wakeDate.formatted(.dateTime.weekday(.wide).month().day())): \(HealthFormat.duration(night.asleep))")
                }
            }
        }
        .card(padding: 18)
    }
}

// MARK: - Move

struct MoveDetailView: View {
    let store: HealthStore
    let onShowWorkouts: () -> Void

    var body: some View {
        DetailPage(title: "Move") {
            if let move = store.summary?.move {
                DetailHeader(ring: .move, score: move.score, label: move.label, caption: move.isPartialDay ? "So far today. The ring fills up towards your usual day" : "Compared with your usual day")

                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    if let steps = move.steps {
                        StatTile(title: "Steps", value: steps.formatted(), usual: move.usualSteps.map { "Usually \($0.formatted())" })
                    }
                    if let energy = move.activeEnergyKcal {
                        StatTile(title: "Active energy", value: "\(Int(energy.rounded())) kcal", usual: move.usualActiveEnergyKcal.map { "Usually \(Int($0.rounded())) kcal" })
                    }
                    if let exercise = move.exerciseMinutes {
                        StatTile(title: "Exercise", value: HealthFormat.duration(exercise * 60), usual: nil)
                    }
                    StatTile(title: "Workouts", value: move.workoutCount == 0 ? "None" : HealthFormat.duration(move.workoutMinutes * 60), usual: nil)
                }

                if let week = store.summary?.week, !week.isEmpty {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("This week")
                            .font(.headline)
                            .foregroundStyle(Theme.foreground)
                        MoveWeekBars(week: week, height: 96)
                    }
                    .card(padding: 18)
                }

                Button(action: onShowWorkouts) {
                    HStack {
                        Text("All workouts")
                            .font(.body.weight(.medium))
                            .foregroundStyle(Theme.foreground)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.faintForeground)
                    }
                    .card(padding: 16)
                }
                .buttonStyle(.plain)

                Footnote("Move compares today's active energy (or steps) with your usual over the last month. On days without that, workouts count instead.")
            } else {
                EmptyState(emoji: "👟", title: "No movement recorded", detail: "Steps and workouts from Apple Health will show up here.")
                    .padding(.top, 40)
            }
        }
    }
}

// MARK: - Energy

struct EnergyDetailView: View {
    let store: HealthStore

    var body: some View {
        DetailPage(title: "Energy") {
            if let energy = store.summary?.energy {
                DetailHeader(ring: .energy, score: energy.score, label: energy.label, caption: energyCaption(energy))

                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    StatTile(
                        title: "Heart rate variability",
                        value: energy.hrvMs.map { "\(Int($0.rounded())) ms" } ?? "Not recorded",
                        usual: energy.usualHrvMs.map { "Usually \(Int($0.rounded())) ms" }
                    )
                    StatTile(
                        title: "Resting heart rate",
                        value: energy.restingHeartRate.map { "\(Int($0.rounded())) bpm" } ?? "Not recorded",
                        usual: energy.usualRestingHeartRate.map { "Usually \(Int($0.rounded())) bpm" }
                    )
                }

                Footnote("Energy looks at your heart rate variability and resting heart rate against your own usual, plus last night's sleep. Higher variability and a calmer resting heart rate usually mean you're well recovered. It's a gentle guide, not a medical measure.")
            } else {
                EmptyState(emoji: "⚡️", title: "Needs an Apple Watch", detail: "Energy comes from your heart rate while you rest, which an Apple Watch records.")
                    .padding(.top, 40)
            }
        }
    }
}

private func energyCaption(_ energy: HealthSummary.Energy) -> String {
    if energy.score != nil { return "How rested your body looks today" }
    if energy.usualHrvMs == nil && energy.usualRestingHeartRate == nil {
        return "Bessel needs about five days of Apple Watch data to learn your usual."
    }
    return "Your watch hasn't sent a reading for this day."
}

// MARK: - All workouts

struct AllWorkoutsView: View {
    let store: HealthStore

    private var weeks: [(start: Date, workouts: [HealthKitWorkoutItem])] {
        var calendar = Calendar.current
        calendar.firstWeekday = 2
        let grouped = Dictionary(grouping: store.allWorkouts) { workout in
            calendar.dateInterval(of: .weekOfYear, for: workout.startDate)?.start ?? workout.startDate
        }
        return grouped.keys.sorted(by: >).map { ($0, grouped[$0]!.sorted { $0.startDate > $1.startDate }) }
    }

    var body: some View {
        List {
            ForEach(weeks, id: \.start) { week in
                Section {
                    ForEach(week.workouts) { workout in
                        WorkoutRow(workout: workout, caption: workout.startDate.formatted(.dateTime.weekday(.abbreviated).day()))
                            .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4))
                            .listRowBackground(Theme.card)
                    }
                } header: {
                    Text(title(for: week.start, workouts: week.workouts))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.mutedForeground)
                        .textCase(nil)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.background)
        .overlay {
            if !store.hasLoadedAllWorkouts {
                ProgressView()
            } else if store.allWorkouts.isEmpty {
                EmptyState(emoji: "🏃‍♀️", title: "No workouts yet", detail: "Workouts you record on your iPhone or Apple Watch show up here.")
            }
        }
        .navigationTitle("Workouts")
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.loadAllWorkouts() }
    }

    /// "This week · 3h 05m", "Last week · 1h 10m", "Sep 14 · 45m"
    private func title(for start: Date, workouts: [HealthKitWorkoutItem]) -> String {
        var calendar = Calendar.current
        calendar.firstWeekday = 2
        let thisWeek = calendar.dateInterval(of: .weekOfYear, for: .now)?.start
        let name: String
        if start == thisWeek {
            name = "This week"
        } else if let thisWeek, start == calendar.date(byAdding: .weekOfYear, value: -1, to: thisWeek) {
            name = "Last week"
        } else {
            name = "Week of \(start.formatted(.dateTime.month(.abbreviated).day()))"
        }
        return "\(name) · \(HealthFormat.duration(workouts.map(\.duration).reduce(0, +)))"
    }
}

// MARK: - Building blocks

private struct DetailPage<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                content
            }
            .padding(.top, 8)
            .padding(.horizontal, 16)
            .padding(.bottom, 32)
        }
        .background(Theme.background)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The ring large, its word, the score small beside it, and one line of context.
private struct DetailHeader: View {
    let ring: HealthRing
    let score: Int?
    let label: String
    let caption: String

    var body: some View {
        HStack(spacing: 18) {
            ScoreRing(ring: ring, score: score, size: 96, lineWidth: 12)
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Theme.foreground)
                if let score {
                    Text("\(ring.title) score \(score)")
                        .font(.subheadline.weight(.medium))
                        .monospacedDigit()
                        .foregroundStyle(Theme.pastel(ring.hue))
                }
                Text(caption)
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .card(padding: 18)
    }
}

private struct StatTile: View {
    let title: String
    let value: String
    let usual: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(Theme.mutedForeground)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(value)
                .font(.title3.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(Theme.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(usual ?? " ")
                .font(.caption)
                .monospacedDigit()
                .foregroundStyle(Theme.faintForeground)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(padding: 14)
    }
}

private struct Footnote: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(Theme.faintForeground)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 4)
    }
}

private struct TimeStat: View {
    let label: String
    let date: Date
    let systemImage: String
    let hue: Double

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 14))
                .foregroundStyle(Theme.pastel(hue))
                .frame(width: 34, height: 34)
                .background(Theme.pastelWash(hue, strength: 1.3), in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(Theme.mutedForeground)
                Text(HealthFormat.clock(date))
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.foreground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The night as stage blocks on rows, awake on top and deep at the bottom:
/// square blocks in rounded tracks.
private struct NightChart: View {
    let segments: [SleepSegment]
    let start: Date
    let end: Date

    private let rowHeight: CGFloat = 14
    private let rowGap: CGFloat = 6

    /// Only the stages that happened get a row, still awake-to-deep top down.
    private var levels: [Int] {
        Set(segments.map(\.stage.level)).sorted()
    }

    private func y(_ level: Int) -> CGFloat {
        CGFloat(levels.firstIndex(of: level) ?? 0) * (rowHeight + rowGap)
    }

    var body: some View {
        VStack(spacing: 6) {
            GeometryReader { geometry in
                let span = max(end.timeIntervalSince(start), 1)
                ZStack(alignment: .topLeading) {
                    ForEach(levels, id: \.self) { level in
                        ZStack(alignment: .leading) {
                            Theme.fill
                            ForEach(segments.filter { $0.stage.level == level }) { segment in
                                Rectangle()
                                    .fill(segment.stage.color)
                                    .frame(width: max(segment.duration / span * geometry.size.width, 2))
                                    .offset(x: segment.start.timeIntervalSince(start) / span * geometry.size.width)
                            }
                        }
                        .frame(width: geometry.size.width, height: rowHeight)
                        .clipShape(Capsule())
                        .offset(y: y(level))
                    }
                }
            }
            .frame(height: CGFloat(levels.count) * rowHeight + CGFloat(max(levels.count - 1, 0)) * rowGap)
            .accessibilityHidden(true)

            HStack {
                Text(HealthFormat.clock(start))
                Spacer()
                Text(HealthFormat.clock(end))
            }
            .font(.caption2)
            .monospacedDigit()
            .foregroundStyle(Theme.faintForeground)
        }
    }
}

private struct StageBreakdown: View {
    let sleep: HealthSummary.Sleep

    private var totals: [(stage: SleepStage, seconds: Int)] {
        [(.asleepDeep, sleep.deepSecs), (.asleepCore, sleep.coreSecs), (.asleepREM, sleep.remSecs), (.awake, sleep.awakeSecs)]
            .filter { $0.seconds > 0 }
    }

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)], spacing: 12) {
            ForEach(totals, id: \.stage) { item in
                HStack(alignment: .top, spacing: 8) {
                    Circle()
                        .fill(item.stage.color)
                        .frame(width: 8, height: 8)
                        .padding(.top, 5)
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 4) {
                            Text(item.stage.label)
                                .foregroundStyle(Theme.foreground)
                            Text(HealthFormat.duration(TimeInterval(item.seconds)))
                                .monospacedDigit()
                                .foregroundStyle(Theme.mutedForeground)
                        }
                        .font(.subheadline.weight(.medium))
                        Text(item.stage.hint)
                            .font(.caption)
                            .foregroundStyle(Theme.faintForeground)
                    }
                }
            }
        }
    }
}

struct WorkoutRow: View {
    let workout: HealthKitWorkoutItem
    let caption: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: workout.icon)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Theme.pastel(workout.hue))
                .frame(width: 40, height: 40)
                .background(Theme.pastelWash(workout.hue, strength: 1.3), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(workout.activityLabel)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.foreground)
                Text(metaItems.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(Theme.mutedForeground)
            }
            Spacer()
            Text(caption)
                .font(.caption)
                .foregroundStyle(Theme.faintForeground)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }

    private var metaItems: [String] {
        var items = [HealthFormat.duration(workout.duration)]
        if let meters = workout.totalDistance, meters > 0 {
            items.append(String(format: "%.1f km", meters / 1000))
        }
        if let kcal = workout.totalEnergyBurned, kcal > 0 {
            items.append("\(Int(kcal.rounded())) kcal")
        }
        return items
    }
}

extension HealthKitWorkoutItem {
    var activityLabel: String {
        let words = workoutActivityTypeName.split(separator: "_").joined(separator: " ")
        return words.prefix(1).uppercased() + words.dropFirst()
    }

    /// Cardio warm, strength and studio cool, outdoors green.
    var hue: Double {
        switch workoutActivityTypeName {
        case "running", "high_intensity_interval_training", "cross_training", "mixed_cardio", "dance", "social_dance": 20
        case "yoga", "mind_and_body", "pilates", "flexibility", "cooldown", "preparation_and_recovery": 305
        case "traditional_strength_training", "functional_strength_training", "core_training": 270
        case "walking", "hiking", "cycling", "hand_cycling": 150
        case "swimming", "rowing", "paddle_sports", "water_sports": 235
        default: 45
        }
    }

    var icon: String {
        switch workoutActivityTypeName {
        case "running": "figure.run"
        case "walking": "figure.walk"
        case "hiking": "figure.hiking"
        case "cycling", "hand_cycling": "figure.outdoor.cycle"
        case "swimming": "figure.pool.swim"
        case "traditional_strength_training", "functional_strength_training": "figure.strengthtraining.traditional"
        case "core_training": "figure.core.training"
        case "high_intensity_interval_training", "cross_training", "mixed_cardio": "figure.highintensity.intervaltraining"
        case "yoga", "mind_and_body": "figure.yoga"
        case "pilates": "figure.pilates"
        case "rowing": "figure.rower"
        case "elliptical": "figure.elliptical"
        case "stair_climbing", "stairs", "step_training": "figure.stair.stepper"
        case "tennis", "squash", "racquetball", "badminton", "pickleball", "table_tennis": "figure.tennis"
        case "soccer": "figure.indoor.soccer"
        case "basketball": "figure.basketball"
        case "golf": "figure.golf"
        case "downhill_skiing", "cross_country_skiing", "snow_sports": "figure.skiing.downhill"
        case "snowboarding": "figure.snowboarding"
        case "dance", "social_dance": "figure.dance"
        case "boxing", "kickboxing", "martial_arts": "figure.boxing"
        case "climbing": "figure.climbing"
        case "cooldown", "flexibility", "preparation_and_recovery": "figure.cooldown"
        default: "figure.mixed.cardio"
        }
    }
}
