import Foundation

// The API's gym types, generated from its spec (Bessel/API/Generated).
/// A muscle group an exercise works; one exercise can work several.
typealias GymMuscle = API.GymMuscle
/// The heaviest set of an exercise on one day. Only the weight: no reps.
typealias GymSet = API.GymTopSetSchema
typealias GymExercise = API.GymExerciseSummary
typealias GymExerciseListResponse = API.GymExerciseListResponse
typealias GymSetListResponse = API.GymTopSetListResponse
/// `muscles` left out, the server keeps what the exercise has.
typealias GymExerciseUpsert = API.GymExerciseUpsert
typealias GymSetUpsert = API.GymTopSetUpsert

extension GymMuscle: Identifiable {
    var id: String { rawValue }

    var label: String {
        rawValue.prefix(1).uppercased() + rawValue.dropFirst()
    }

    /// Each once, in the usual order, so the same choice always reads the same.
    static func ordered(_ muscles: some Sequence<GymMuscle>) -> [GymMuscle] {
        let chosen = Set(muscles)
        return allCases.filter(chosen.contains)
    }
}

extension GymSet {
    /// A set on the local day `day` ("yyyy-MM-dd").
    init(day: String, weightKg: Double) {
        self.init(performedOn: DateParsing.dateOnly.date(from: day) ?? .distantPast, weightKg: weightKg)
    }

    /// The local day as "yyyy-MM-dd", the key sets are stored under.
    var dayKey: String { DateParsing.dateOnly.string(from: performedOn) }
}

extension GymExercise: Identifiable {
    func set(on day: String) -> GymSet? {
        recentSets.first { $0.dayKey == day }
    }

    /// "Chest · Triceps"
    var musclesLabel: String? {
        let known = muscles.filter { $0 != .unknown }
        return known.isEmpty ? nil : known.map(\.label).joined(separator: " · ")
    }

    /// When it was last trained, or added; the list puts the latest first.
    var lastActive: Date {
        lastSet?.performedOn ?? createdAt
    }
}

/// A change made on the phone, waiting to reach the server. Each is safe to
/// send twice, so a change that may or may not have arrived is simply resent.
enum GymChange: Codable, Equatable {
    /// `muscles` nil keeps the exercise's own, as with a plain rename.
    case saveExercise(id: UUID, name: String, muscles: [GymMuscle]?)
    case deleteExercise(id: UUID)
    case saveSet(exerciseID: UUID, day: String, weightKg: Double)
    case deleteSet(exerciseID: UUID, day: String)

    /// Shows the change on the list right away, and again over a fresh load
    /// while it's still on its way, so it never seems to come undone.
    func apply(to exercises: inout [GymExercise], now: Date = .now) {
        switch self {
        case let .saveExercise(id, name, muscles):
            if let index = exercises.firstIndex(where: { $0.id == id }) {
                exercises[index].name = name
                if let muscles { exercises[index].muscles = muscles }
            } else {
                exercises.append(GymExercise(id: id, name: name, muscles: muscles ?? [], createdAt: now, lastSet: nil, bestSet: nil, recentSets: []))
            }
        case let .deleteExercise(id):
            exercises.removeAll { $0.id == id }
        case let .saveSet(exerciseID, day, weightKg):
            guard let index = exercises.firstIndex(where: { $0.id == exerciseID }) else { return }
            var exercise = exercises[index]
            exercise.recentSets.removeAll { $0.dayKey == day }
            exercise.recentSets.append(GymSet(day: day, weightKg: weightKg))
            exercise.recentSets.sort { $0.performedOn < $1.performedOn }
            exercise.lastSet = exercise.recentSets.last
            exercise.bestSet = Self.best(of: exercise.recentSets, beyond: exercise.bestSet, replacing: day)
            exercises[index] = exercise
        case let .deleteSet(exerciseID, day):
            guard let index = exercises.firstIndex(where: { $0.id == exerciseID }) else { return }
            var exercise = exercises[index]
            exercise.recentSets.removeAll { $0.dayKey == day }
            exercise.lastSet = exercise.recentSets.last
            exercise.bestSet = Self.best(of: exercise.recentSets, beyond: exercise.bestSet, replacing: day)
            exercises[index] = exercise
        }
    }

    /// The heaviest of the recent sets, or the known best from before them if
    /// that's heavier and isn't the day being changed. Ties go to the latest.
    private static func best(of sets: [GymSet], beyond known: GymSet?, replacing day: String) -> GymSet? {
        var candidates = sets
        if let known, known.dayKey != day, !sets.contains(where: { $0.performedOn == known.performedOn }) {
            candidates.append(known)
        }
        return candidates.max { ($0.weightKg, $0.performedOn) < ($1.weightKg, $1.performedOn) }
    }

    var exerciseID: UUID {
        switch self {
        case let .saveExercise(id, _, _), let .deleteExercise(id): id
        case let .saveSet(id, _, _), let .deleteSet(id, _): id
        }
    }
}

enum GymFormat {
    /// "62.5 kg", "60 kg", "Bodyweight".
    static func weight(_ kg: Double) -> String {
        if kg == 0 { return "Bodyweight" }
        return "\(number(kg)) kg"
    }

    /// "62.5", "60", "1.25", in the person's own decimal style.
    static func number(_ kg: Double) -> String {
        kg.formatted(.number.precision(.fractionLength(0...2)))
    }

    /// "Today", "Yesterday", "Tue" this week, else "Sep 14".
    static func day(_ set: GymSet) -> String {
        let date = set.performedOn
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        if let days = calendar.dateComponents([.day], from: date, to: calendar.startOfDay(for: .now)).day, days < 7 {
            return date.formatted(.dateTime.weekday(.abbreviated))
        }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }

    /// Reads "62,5" as well as "62.5".
    static func parse(_ text: String) -> Double? {
        Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
    }
}
