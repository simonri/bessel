import Foundation
import Observation

@MainActor
@Observable
final class GolfCartStore {
    enum Phase {
        case idle
        case connecting
        case live(BmsReading)
        case failed(BmsError)
    }

    private(set) var phase: Phase = .idle
    private(set) var deviceName: String?
    private(set) var lastUpdated: Date?
    /// Bumped by retry(); part of the view's session task id, so a bump
    /// restarts the whole connect-and-poll session.
    private(set) var attempt = 0

    private let client: BmsClient
    private var isReading = false

    init() {
        #if targetEnvironment(simulator)
        client = SimulatedBmsClient()
        #else
        client = DalyBmsClient()
        #endif
    }

    func retry() {
        attempt += 1
    }

    /// One full session: connect, poll every 10 s until cancelled, disconnect.
    func run() async {
        defer {
            client.disconnect()
            if case .live = phase { phase = .idle }
        }
        phase = .connecting
        do {
            deviceName = try await client.connect()
            while !Task.isCancelled {
                try await performRead()
                try await Task.sleep(for: .seconds(10))
            }
        } catch is CancellationError {
            phase = .idle
        } catch {
            phase = .failed(error as? BmsError ?? .disconnected)
        }
    }

    /// Pull-to-refresh: immediate read; no-op while another read is in flight.
    func refresh() async {
        guard case .live = phase, !isReading else { return }
        try? await performRead()
    }

    private func performRead() async throws {
        isReading = true
        defer { isReading = false }
        let reading = try await client.readAll()
        phase = .live(reading)
        lastUpdated = .now
    }
}
