import Foundation

/// Lets only the newest load write its result. A load that started earlier, or
/// before a change made on this device, would otherwise land late and put back
/// what was on screen before.
struct LoadGeneration {
    private var current = 0
    private(set) var lastLoadedAt: Date?

    /// Call when a load starts; pass the ticket to `isCurrent` once it returns.
    mutating func begin() -> Int {
        current += 1
        return current
    }

    func isCurrent(_ ticket: Int) -> Bool {
        ticket == current
    }

    /// Call when a load's result has been applied.
    mutating func finish(_ ticket: Int) {
        if ticket == current { lastLoadedAt = .now }
    }

    /// Call on every local change: loads already on the way are stale, and the
    /// screen wants a fresh one next time it's shown.
    mutating func invalidate() {
        current += 1
        lastLoadedAt = nil
    }

    /// Whether the data is older than `maxAge`, or a newer load was dropped.
    func isStale(maxAge: TimeInterval) -> Bool {
        guard let lastLoadedAt else { return true }
        return Date.now.timeIntervalSince(lastLoadedAt) > maxAge
    }
}

/// Runs changes to the same item one after another, in the order they were
/// made, so a quick edit then delete can't reach the server the other way round.
@MainActor
final class SerialQueues<Key: Hashable> {
    private var tails: [Key: Task<Void, Never>] = [:]

    func run<T>(_ key: Key, _ operation: @escaping @MainActor () async throws -> T) async throws -> T {
        let previous = tails[key]
        let task = Task { @MainActor in
            await previous?.value
            return try await operation()
        }
        let tail = Task { @MainActor in _ = try? await task.value }
        tails[key] = tail
        defer { if tails[key] == tail { tails[key] = nil } }
        return try await task.value
    }

    func run(_ key: Key, _ operation: @escaping @MainActor () async -> Void) async {
        _ = try? await run(key) { () async throws -> Void in await operation() }
    }
}
