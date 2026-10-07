import Foundation
import MetricKit
import os

/// Sends the crash and hang reports iOS collects for the app (MetricKit, at
/// most once a day) to the server, where they're logged next to its own logs.
final class DiagnosticsReporter: NSObject, MXMetricManagerSubscriber {
    private let client: APIClient
    private static let maxPayloads = 10
    private static let maxPayloadBytes = 64 * 1024
    private static let log = Logger(subsystem: "app.bessel", category: "diagnostics")

    @MainActor
    init(client: APIClient) {
        self.client = client
        super.init()
        MXMetricManager.shared.add(self)
    }

    deinit {
        MXMetricManager.shared.remove(self)
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        let reports = payloads
            .map { $0.jsonRepresentation() }
            .filter { $0.count <= Self.maxPayloadBytes }
            .prefix(Self.maxPayloads)
        guard !reports.isEmpty, let body = Self.body(Array(reports)) else { return }
        Task { @MainActor [client] in
            do {
                try await client.postNoContent("/v1/client-diagnostics", json: body)
            } catch {
                Self.log.error("Couldn't upload diagnostics: \(error.userMessage, privacy: .public)")
            }
        }
    }

    /// The reports go up as the OS wrote them, wrapped with which build sent them.
    private static func body(_ reports: [Data]) -> Data? {
        let payloads = reports.compactMap { try? JSONSerialization.jsonObject(with: $0) }
        let body: [String: Any] = [
            "platform": "ios",
            "version": ClientInfo.version,
            "build": ClientInfo.build,
            "payloads": payloads,
        ]
        return try? JSONSerialization.data(withJSONObject: body)
    }
}
