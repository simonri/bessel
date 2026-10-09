import Foundation

/// The heaviest set of an exercise on one day. Only the weight: no reps.
struct GymSet: Codable, Equatable, Hashable {
    /// The local day, "yyyy-MM-dd".
    let performedOn: String
    var weightKg: Double

    var day: Date? { DateParsing.dateOnly.date(from: performedOn) }
}

struct GymExercise: Codable, Identifiable, Equatable {
    let id: UUID
    var name: String
    let createdAt: Date
    var lastSet: GymSet?
    var bestSet: GymSet?
    /// Up to the last ten top sets, oldest first.
    var recentSets: [GymSet]

    func set(on day: String) -> GymSet? {
        recentSets.first { $0.performedOn == day }
    }

    /// When it was last trained, or added; the list puts the latest first.
    var lastActive: Date {
        lastSet?.day ?? createdAt
    }
}

struct GymExerciseListResponse: Decodable {
    @Lossy var exercises: [GymExercise]
}

struct GymSetListResponse: Decodable {
    @Lossy var sets: [GymSet]
}

struct GymExerciseUpsert: Encodable {
    let name: String
}

struct GymSetUpsert: Encodable {
    let weightKg: Double

    enum CodingKeys: String, CodingKey {
        case weightKg = "weight_kg"
    }
}

/// A change made on the phone, waiting to reach the server. Each is safe to
/// send twice, so a change that may or may not have arrived is simply resent.
enum GymChange: Codable, Equatable {
    case saveExercise(id: UUID, name: String)
    case deleteExercise(id: UUID)
    case saveSet(exerciseID: UUID, day: String, weightKg: Double)
    case deleteSet(exerciseID: UUID, day: String)

    /// Shows the change on the list right away, and again over a fresh load
    /// while it's still on its way, so it never seems to come undone.
    func apply(to exercises: inout [GymExercise], now: Date = .now) {
        switch self {
        case let .saveExercise(id, name):
            if let index = exercises.firstIndex(where: { $0.id == id }) {
                exercises[index].name = name
            } else {
                exercises.append(GymExercise(id: id, name: name, createdAt: now, lastSet: nil, bestSet: nil, recentSets: []))
            }
        case let .deleteExercise(id):
            exercises.removeAll { $0.id == id }
        case let .saveSet(exerciseID, day, weightKg):
            guard let index = exercises.firstIndex(where: { $0.id == exerciseID }) else { return }
            var exercise = exercises[index]
            exercise.recentSets.removeAll { $0.performedOn == day }
            exercise.recentSets.append(GymSet(performedOn: day, weightKg: weightKg))
            exercise.recentSets.sort { $0.performedOn < $1.performedOn }
            exercise.lastSet = exercise.recentSets.last
            exercise.bestSet = Self.best(of: exercise.recentSets, beyond: exercise.bestSet, replacing: day)
            exercises[index] = exercise
        case let .deleteSet(exerciseID, day):
            guard let index = exercises.firstIndex(where: { $0.id == exerciseID }) else { return }
            var exercise = exercises[index]
            exercise.recentSets.removeAll { $0.performedOn == day }
            exercise.lastSet = exercise.recentSets.last
            exercise.bestSet = Self.best(of: exercise.recentSets, beyond: exercise.bestSet, replacing: day)
            exercises[index] = exercise
        }
    }

    /// The heaviest of the recent sets, or the known best from before them if
    /// that's heavier and isn't the day being changed. Ties go to the latest.
    private static func best(of sets: [GymSet], beyond known: GymSet?, replacing day: String) -> GymSet? {
        var candidates = sets
        if let known, known.performedOn != day, !sets.contains(where: { $0.performedOn == known.performedOn }) {
            candidates.append(known)
        }
        return candidates.max { ($0.weightKg, $0.performedOn) < ($1.weightKg, $1.performedOn) }
    }

    var exerciseID: UUID {
        switch self {
        case let .saveExercise(id, _), let .deleteExercise(id): id
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
        guard let date = set.day else { return set.performedOn }
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
