import Foundation

@MainActor
protocol BmsClient {
    /// Scans for, connects to, and subscribes to the BMS.
    /// Returns the advertised device name, if any.
    func connect() async throws -> String?
    func readAll() async throws -> BmsReading
    func disconnect()
}
