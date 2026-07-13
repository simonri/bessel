import SwiftUI

struct WorkoutsView: View {
    let auth: AuthSession

    @State private var store: WorkoutsStore

    init(auth: AuthSession) {
        self.auth = auth
        _store = State(initialValue: WorkoutsStore(client: APIClient(auth: auth)))
    }

    var body: some View {
        NavigationStack {
            content
                .background(Theme.background)
                .navigationTitle("Workouts")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { toolbarContent }
                .alert("Something went wrong", isPresented: errorBinding) {
                    Button("OK", role: .cancel) {}
                } message: {
                    Text(store.errorMessage ?? "")
                }
                .task { await store.load() }
                .refreshable { await store.load() }
        }
    }

    @ViewBuilder
    private var content: some View {
        if !store.hasLoaded {
            VStack {
                Spacer()
                ProgressView()
                    .tint(Theme.mutedForeground)
                Spacer()
            }
        } else {
            List {
                ForEach(store.workouts) { workout in
                    WorkoutRow(workout: workout)
                        .listRowBackground(Theme.background)
                        .listRowSeparatorTint(Theme.border)
                        .listRowInsets(EdgeInsets(top: 2, leading: 16, bottom: 2, trailing: 16))
                }
                if let lastSyncedAt = store.lastSyncedAt, !store.workouts.isEmpty {
                    Text("Last synced \(lastSyncedAt.formatted(.relative(presentation: .named)))")
                        .font(.caption)
                        .foregroundStyle(Theme.mutedForeground)
                        .frame(maxWidth: .infinity)
                        .listRowBackground(Theme.background)
                        .listRowSeparator(.hidden)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .overlay {
                if store.workouts.isEmpty {
                    emptyState
                }
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            if store.isSyncing {
                ProgressView()
                    .tint(Theme.mutedForeground)
            } else {
                Button {
                    Task { await store.sync() }
                } label: {
                    Image(systemName: "arrow.triangle.2.circlepath")
                }
                .accessibilityLabel("Sync workouts")
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "figure.run")
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(Theme.mutedForeground.opacity(0.4))
            VStack(spacing: 4) {
                Text("No workouts")
                    .font(.body.weight(.medium))
                    .foregroundStyle(Theme.foreground)
                Text("Sync your Apple Health workouts with the button above.")
                    .font(.footnote)
                    .foregroundStyle(Theme.mutedForeground)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 32)
        .allowsHitTesting(false)
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )
    }
}

private struct WorkoutRow: View {
    let workout: HealthKitWorkoutItem

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: workout.icon)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Theme.primary)
                .frame(width: 32, height: 32)
                .background(Theme.card, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(workout.activityLabel)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.foreground)
                Text(metaItems.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(Theme.mutedForeground)
            }
            Spacer()
            Text(workout.startDate.formatted(.relative(presentation: .named)))
                .font(.caption)
                .foregroundStyle(Theme.mutedForeground)
        }
        .padding(.vertical, 6)
    }

    private var metaItems: [String] {
        var items = [durationLabel]
        if let meters = workout.totalDistance, meters > 0 {
            items.append(String(format: "%.1f km", meters / 1000))
        }
        if let kcal = workout.totalEnergyBurned, kcal > 0 {
            items.append("\(Int(kcal.rounded())) kcal")
        }
        return items
    }

    private var durationLabel: String {
        Duration.seconds(Int(workout.duration))
            .formatted(.units(allowed: [.hours, .minutes], width: .narrow))
    }
}

private extension HealthKitWorkoutItem {
    var activityLabel: String {
        workoutActivityTypeName
            .split(separator: "_")
            .joined(separator: " ")
            .capitalized
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
