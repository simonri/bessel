import Foundation

/// What every signed-in screen shares: one API client, the queue of deletes
/// waiting out their Undo window, and the on-disk cache, all for one account.
@MainActor
final class AppServices {
    let client: APIClient
    let outbox: DeleteOutbox
    let cache: ResponseCache
    private let diagnostics: DiagnosticsReporter

    init(auth: AuthSession) {
        let account = auth.accountID ?? "default"
        client = APIClient(auth: auth)
        outbox = DeleteOutbox(client: client, account: account)
        cache = ResponseCache(account: account)
        diagnostics = DiagnosticsReporter(client: client)
    }

    /// How old a screen's data may get before showing it again fetches it anew.
    static let freshFor: TimeInterval = 60
}
