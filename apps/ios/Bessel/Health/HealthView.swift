import SwiftUI

struct HealthView: View {
    let auth: AuthSession
    let isActive: Bool

    @State private var store: HealthStore
    @Environment(\.scenePhase) private var scenePhase

    init(auth: AuthSession, isActive: Bool) {
        self.auth = auth
        self.isActive = isActive
        _store = State(initialValue: HealthStore(client: APIClient(auth: auth)))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if !store.isConnected {
                        ConnectHealthCard(isSyncing: store.isSyncing) {
                            Task { await store.connect() }
                        }
                    }
                    if store.hasLoaded {
                        if let night = store.lastNight {
                            LastNightCard(night: night, usual: store.usualAsleep, segments: store.lastNightSegments)
                            WeekCard(nights: Array(store.nights.suffix(7)))
                        }
                        WorkoutsSection(workouts: store.workouts, thisWeek: store.workoutsThisWeek)
                        if store.nights.isEmpty && store.workouts.isEmpty && store.isConnected {
                            EmptyState(emoji: "🌙", title: "Nothing here yet", detail: "Your sleep and workouts from Apple Health will show up here.")
                                .padding(.vertical, 40)
                        }
                    }
                    syncFooter
                }
                .padding(.top, Theme.pageTop)
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .refreshable {
                await store.syncIfNeeded()
                await store.load()
            }
            .background(Theme.background)
            .overlay {
                if !store.hasLoaded { ProgressView() }
            }
            .navigationTitle("Health")
            .toolbarTitleDisplayMode(.inlineLarge)
            .toolbar {
                ProfileToolbarItem(auth: auth)
            }
            .alert("Something went wrong", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(store.errorMessage ?? "")
            }
            .task { await store.load() }
            .task(id: isActive && scenePhase == .active) {
                guard isActive, scenePhase == .active else { return }
                await store.syncIfNeeded()
            }
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
            Text("Synced with Apple Health \(lastSyncedAt.formatted(.relative(presentation: .named)))")
                .font(.caption)
                .foregroundStyle(Theme.faintForeground)
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

// MARK: - Connect

private struct ConnectHealthCard: View {
    let isSyncing: Bool
    let onConnect: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: "heart.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(Theme.pastel(0))
                    .frame(width: 44, height: 44)
                    .background(Theme.pastelWash(0, strength: 1.4), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Connect Apple Health")
                        .font(.headline)
                        .foregroundStyle(Theme.foreground)
                    Text("See your sleep and workouts here. They sync quietly whenever you open Bessel.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedForeground)
                }
            }
            Button(action: onConnect) {
                ZStack {
                    Text("Connect").opacity(isSyncing ? 0 : 1)
                    if isSyncing { ProgressView().tint(.white) }
                }
                .font(.body.weight(.semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Theme.primary, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(isSyncing)
        }
        .card(padding: 18)
    }
}

// MARK: - Last night

private struct LastNightCard: View {
    let night: SleepNight
    let usual: TimeInterval?
    let segments: [SleepSegment]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.mutedForeground)
                Text(Self.duration(night.asleep))
                    .font(.system(size: 40, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.foreground)
                Text(mood)
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedForeground)
            }

            if let onset = night.onset, let wake = night.wake {
                HStack(spacing: 0) {
                    timeStat("Fell asleep", onset, systemImage: "moon.stars.fill", hue: 280)
                    timeStat("Woke up", wake, systemImage: "sun.max.fill", hue: 55)
                }
            }

            if !segments.isEmpty, let onset = night.onset, let wake = night.wake {
                NightChart(segments: segments, start: onset, end: wake)
                StageBreakdown(segments: segments)
            }
        }
        .card(padding: 18)
    }

    private var title: String {
        guard !Calendar.current.isDateInToday(night.wakeDate),
              let bedEvening = Calendar.current.date(byAdding: .day, value: -1, to: night.wakeDate)
        else { return "Last night" }
        return "\(bedEvening.formatted(.dateTime.weekday(.wide))) night"
    }

    private var mood: String {
        let hours = night.asleep / 3600
        let feeling = if hours >= 7.5 { "A cosy night ✨" }
            else if hours >= 6.5 { "A solid night" }
            else if hours >= 5 { "A bit short, be gentle with yourself today" }
            else { "A short night, maybe an early one tonight? 🌙" }
        guard let usual else { return feeling }
        let diff = Int(((night.asleep - usual) / 60).rounded())
        if abs(diff) < 10 { return "\(feeling) · about your usual" }
        let text = abs(diff) >= 60 ? "\(abs(diff) / 60)h \(abs(diff) % 60)m" : "\(abs(diff))m"
        return "\(feeling) · \(diff > 0 ? "+" : "-")\(text) vs usual"
    }

    private func timeStat(_ label: String, _ date: Date, systemImage: String, hue: Double) -> some View {
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
                Text(date.formatted(date: .omitted, time: .shortened))
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.foreground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    static func duration(_ seconds: TimeInterval) -> String {
        let minutes = Int((seconds / 60).rounded())
        return minutes < 60 ? "\(minutes)m" : "\(minutes / 60)h \(minutes % 60)m"
    }
}

/// The night as stage blocks on four rows, awake on top and deep at the bottom.
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
                    // Rounded track per stage; its blocks are square, clipped to the track.
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
                Text(start.formatted(date: .omitted, time: .shortened))
                Spacer()
                Text(end.formatted(date: .omitted, time: .shortened))
            }
            .font(.caption2)
            .monospacedDigit()
            .foregroundStyle(Theme.faintForeground)
        }
    }
}

private struct StageBreakdown: View {
    let segments: [SleepSegment]

    private var totals: [(stage: SleepStage, seconds: TimeInterval)] {
        let grouped = Dictionary(grouping: segments) { segment -> SleepStage in
            segment.stage == .asleepUnspecified ? .asleepCore : segment.stage
        }
        let order: [SleepStage] = [.asleepDeep, .asleepCore, .asleepREM, .awake]
        return order.compactMap { stage in
            guard let items = grouped[stage] else { return nil }
            return (stage, items.map(\.duration).reduce(0, +))
        }
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
                            Text(LastNightCard.duration(item.seconds))
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

// MARK: - Week

private struct WeekCard: View {
    let nights: [SleepNight]

    private let maxHours = 10.0

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text("This week")
                    .font(.headline)
                    .foregroundStyle(Theme.foreground)
                Spacer()
                if let average {
                    Text("\(LastNightCard.duration(average)) a night")
                        .font(.subheadline)
                        .monospacedDigit()
                        .foregroundStyle(Theme.mutedForeground)
                }
            }
            HStack(alignment: .bottom, spacing: 10) {
                ForEach(nights) { night in
                    let isLast = night == nights.last
                    VStack(spacing: 6) {
                        Capsule()
                            .fill(isLast ? SleepStage.asleepREM.color : SleepStage.asleepREM.color.opacity(0.4))
                            .frame(height: max(8, 96 * min(night.asleep / 3600, maxHours) / maxHours))
                        Text(night.wakeDate.formatted(.dateTime.weekday(.narrow)))
                            .font(.caption2.weight(isLast ? .bold : .regular))
                            .foregroundStyle(isLast ? Theme.foreground : Theme.faintForeground)
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(night.wakeDate.formatted(.dateTime.weekday(.wide))): \(LastNightCard.duration(night.asleep))")
                }
            }
            .frame(height: 120, alignment: .bottom)
        }
        .card(padding: 18)
    }

    private var average: TimeInterval? {
        guard !nights.isEmpty else { return nil }
        return nights.map(\.asleep).reduce(0, +) / Double(nights.count)
    }
}

// MARK: - Workouts

private struct WorkoutsSection: View {
    let workouts: [HealthKitWorkoutItem]
    let thisWeek: [HealthKitWorkoutItem]

    var body: some View {
        if !workouts.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Workouts")
                        .font(.headline)
                        .foregroundStyle(Theme.foreground)
                    Spacer()
                    Text(weekSummary)
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedForeground)
                }
                .padding(.top, 8)
                .padding(.horizontal, 4)

                VStack(spacing: 0) {
                    ForEach(workouts.prefix(20)) { workout in
                        WorkoutRow(workout: workout)
                        if workout.id != workouts.prefix(20).last?.id {
                            Divider().overlay(Theme.border).padding(.leading, 64)
                        }
                    }
                }
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
        }
    }

    private var weekSummary: String {
        guard !thisWeek.isEmpty else { return "None this week yet" }
        let minutes = Int(thisWeek.map(\.duration).reduce(0, +) / 60)
        let time = minutes >= 60 ? "\(minutes / 60)h \(minutes % 60)m" : "\(minutes)m"
        return "\(thisWeek.count) this week · \(time)"
    }
}

private struct WorkoutRow: View {
    let workout: HealthKitWorkoutItem

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
            Text(workout.startDate.formatted(.relative(presentation: .named)))
                .font(.caption)
                .foregroundStyle(Theme.faintForeground)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }

    private var metaItems: [String] {
        var items = [Duration.seconds(Int(workout.duration)).formatted(.units(allowed: [.hours, .minutes], width: .narrow))]
        if let meters = workout.totalDistance, meters > 0 {
            items.append(String(format: "%.1f km", meters / 1000))
        }
        if let kcal = workout.totalEnergyBurned, kcal > 0 {
            items.append("\(Int(kcal.rounded())) kcal")
        }
        return items
    }
}

private extension HealthKitWorkoutItem {
    var activityLabel: String {
        workoutActivityTypeName
            .split(separator: "_")
            .joined(separator: " ")
            .capitalized
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
