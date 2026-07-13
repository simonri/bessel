import Foundation
import HealthKit

struct WorkoutBatch {
    let added: [HealthKitWorkoutUpload]
    let deletedUUIDs: [UUID]
    let newAnchor: HKQueryAnchor
}

/// Reads workouts from the HealthKit store via anchored queries, so each call
/// returns only what changed since the given anchor (adds and deletes).
final class HealthKitService {
    static var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    private let store = HKHealthStore()

    /// No-op once granted; read status is intentionally not queryable, so this
    /// runs before every sync and the query simply returns what is permitted.
    func requestAuthorization() async throws {
        try await store.requestAuthorization(toShare: [], read: [HKObjectType.workoutType()])
    }

    func fetchNextBatch(anchor: HKQueryAnchor?, limit: Int) async throws -> WorkoutBatch {
        let descriptor = HKAnchoredObjectQueryDescriptor(
            predicates: [.workout()],
            anchor: anchor,
            limit: limit
        )
        let result = try await descriptor.result(for: store)
        return WorkoutBatch(
            added: result.addedSamples.map(Self.upload(from:)),
            deletedUUIDs: result.deletedObjects.map(\.uuid),
            newAnchor: result.newAnchor
        )
    }

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static func upload(from workout: HKWorkout) -> HealthKitWorkoutUpload {
        HealthKitWorkoutUpload(
            healthkitUuid: workout.uuid,
            workoutActivityType: Int(workout.workoutActivityType.rawValue),
            workoutActivityTypeName: workout.workoutActivityType.name,
            startDate: isoFormatter.string(from: workout.startDate),
            endDate: isoFormatter.string(from: workout.endDate),
            duration: workout.duration,
            totalEnergyBurned: workout.statistics(for: HKQuantityType(.activeEnergyBurned))?
                .sumQuantity()?.doubleValue(for: .kilocalorie()),
            totalDistance: distance(from: workout),
            sourceName: workout.sourceRevision.source.name,
            sourceBundleId: workout.sourceRevision.source.bundleIdentifier,
            sourceVersion: workout.sourceRevision.version,
            deviceName: workout.device?.name,
            workoutMetadata: jsonMetadata(workout.metadata),
            statistics: jsonStatistics(workout.allStatistics)
        )
    }

    private static let distanceTypes: [HKQuantityTypeIdentifier] = [
        .distanceWalkingRunning,
        .distanceCycling,
        .distanceSwimming,
        .distanceWheelchair,
        .distanceDownhillSnowSports,
    ]

    private static func distance(from workout: HKWorkout) -> Double? {
        for identifier in distanceTypes {
            if let meters = workout.statistics(for: HKQuantityType(identifier))?.sumQuantity()?.doubleValue(for: .meter()) {
                return meters
            }
        }
        return nil
    }

    /// Candidate units for statistics we have no explicit mapping for; the first
    /// compatible one wins. Quantities matching none are dropped.
    private static let fallbackUnits: [HKUnit] = [
        .kilocalorie(),
        .meter(),
        HKUnit.count().unitDivided(by: .minute()),
        .count(),
        .degreeCelsius(),
        .watt(),
        .meterUnit(with: .kilo).unitDivided(by: .hour()),
    ]

    private static func jsonStatistics(_ statistics: [HKQuantityType: HKStatistics]) -> [String: JSONValue]? {
        var result: [String: JSONValue] = [:]
        for (quantityType, stats) in statistics {
            guard let unit = fallbackUnits.first(where: { stats.sumQuantity()?.is(compatibleWith: $0) ?? stats.averageQuantity()?.is(compatibleWith: $0) ?? false }) else {
                continue
            }
            var entry: [String: JSONValue] = ["unit": .string(unit.unitString)]
            if quantityType.aggregationStyle == .cumulative {
                if let sum = stats.sumQuantity()?.doubleValue(for: unit) {
                    entry["sum"] = .number(sum)
                }
            } else {
                if let average = stats.averageQuantity()?.doubleValue(for: unit) {
                    entry["average"] = .number(average)
                }
                if let minimum = stats.minimumQuantity()?.doubleValue(for: unit) {
                    entry["min"] = .number(minimum)
                }
                if let maximum = stats.maximumQuantity()?.doubleValue(for: unit) {
                    entry["max"] = .number(maximum)
                }
            }
            if entry.count > 1 {
                result[quantityType.identifier] = .object(entry)
            }
        }
        return result.isEmpty ? nil : result
    }

    private static func jsonMetadata(_ metadata: [String: Any]?) -> [String: JSONValue]? {
        guard let metadata else { return nil }
        var result: [String: JSONValue] = [:]
        for (key, value) in metadata {
            switch value {
            case let number as NSNumber:
                result[key] = CFGetTypeID(number) == CFBooleanGetTypeID() ? .bool(number.boolValue) : .number(number.doubleValue)
            case let string as String:
                result[key] = .string(string)
            case let date as Date:
                result[key] = .string(isoFormatter.string(from: date))
            case let quantity as HKQuantity:
                if let unit = fallbackUnits.first(where: quantity.is(compatibleWith:)) {
                    result[key] = .object(["value": .number(quantity.doubleValue(for: unit)), "unit": .string(unit.unitString)])
                }
            default:
                break
            }
        }
        return result.isEmpty ? nil : result
    }
}

/// The persisted HKQueryAnchor cursor. Advanced only after the server has
/// acknowledged a batch, so an interrupted sync resumes without losing data.
enum WorkoutSyncAnchor {
    private static let anchorKey = "healthkit.workoutAnchor"
    private static let lastSyncedAtKey = "healthkit.lastSyncedAt"

    static func load() -> HKQueryAnchor? {
        guard let data = UserDefaults.standard.data(forKey: anchorKey) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }

    static func save(_ anchor: HKQueryAnchor) {
        guard let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true) else { return }
        UserDefaults.standard.set(data, forKey: anchorKey)
    }

    static var lastSyncedAt: Date? {
        get { UserDefaults.standard.object(forKey: lastSyncedAtKey) as? Date }
        set { UserDefaults.standard.set(newValue, forKey: lastSyncedAtKey) }
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: anchorKey)
        UserDefaults.standard.removeObject(forKey: lastSyncedAtKey)
    }
}

extension HKWorkoutActivityType {
    /// Human-readable slug stored alongside the raw value; unrecognized types
    /// fall back to "other" without losing information.
    var name: String {
        switch self {
        case .americanFootball: "american_football"
        case .archery: "archery"
        case .badminton: "badminton"
        case .barre: "barre"
        case .baseball: "baseball"
        case .basketball: "basketball"
        case .bowling: "bowling"
        case .boxing: "boxing"
        case .climbing: "climbing"
        case .cooldown: "cooldown"
        case .coreTraining: "core_training"
        case .cricket: "cricket"
        case .crossCountrySkiing: "cross_country_skiing"
        case .crossTraining: "cross_training"
        case .curling: "curling"
        case .cycling: "cycling"
        case .dance: "dance"
        case .discSports: "disc_sports"
        case .downhillSkiing: "downhill_skiing"
        case .elliptical: "elliptical"
        case .equestrianSports: "equestrian_sports"
        case .fencing: "fencing"
        case .fishing: "fishing"
        case .fitnessGaming: "fitness_gaming"
        case .flexibility: "flexibility"
        case .functionalStrengthTraining: "functional_strength_training"
        case .golf: "golf"
        case .gymnastics: "gymnastics"
        case .handball: "handball"
        case .handCycling: "hand_cycling"
        case .highIntensityIntervalTraining: "high_intensity_interval_training"
        case .hiking: "hiking"
        case .hockey: "hockey"
        case .hunting: "hunting"
        case .jumpRope: "jump_rope"
        case .kickboxing: "kickboxing"
        case .lacrosse: "lacrosse"
        case .martialArts: "martial_arts"
        case .mindAndBody: "mind_and_body"
        case .mixedCardio: "mixed_cardio"
        case .paddleSports: "paddle_sports"
        case .pickleball: "pickleball"
        case .pilates: "pilates"
        case .play: "play"
        case .preparationAndRecovery: "preparation_and_recovery"
        case .racquetball: "racquetball"
        case .rowing: "rowing"
        case .rugby: "rugby"
        case .running: "running"
        case .sailing: "sailing"
        case .skatingSports: "skating_sports"
        case .snowboarding: "snowboarding"
        case .snowSports: "snow_sports"
        case .soccer: "soccer"
        case .socialDance: "social_dance"
        case .softball: "softball"
        case .squash: "squash"
        case .stairClimbing: "stair_climbing"
        case .stairs: "stairs"
        case .stepTraining: "step_training"
        case .surfingSports: "surfing_sports"
        case .swimBikeRun: "swim_bike_run"
        case .swimming: "swimming"
        case .tableTennis: "table_tennis"
        case .taiChi: "tai_chi"
        case .tennis: "tennis"
        case .trackAndField: "track_and_field"
        case .traditionalStrengthTraining: "traditional_strength_training"
        case .transition: "transition"
        case .underwaterDiving: "underwater_diving"
        case .volleyball: "volleyball"
        case .walking: "walking"
        case .waterFitness: "water_fitness"
        case .waterPolo: "water_polo"
        case .waterSports: "water_sports"
        case .wheelchairRunPace: "wheelchair_run_pace"
        case .wheelchairWalkPace: "wheelchair_walk_pace"
        case .wrestling: "wrestling"
        case .yoga: "yoga"
        default: "other"
        }
    }
}
