import Foundation

/// What every signed-in screen shares: one API client, the queue of deletes
/// waiting out their Undo window, and the on-disk cache, all for one account.
@MainActor
final class AppServices {
    let client: APIClient
    let outbox: DeleteOutbox
    let cache: ResponseCache
    /// The signed-in account, which scopes what's kept on disk.
    let account: String

    convenience init(auth: AuthSession) {
        let account = auth.accountID ?? "default"
        let client = APIClient(auth: auth)
        self.init(client: client, account: account, outbox: DeleteOutbox(client: client, account: account), cache: ResponseCache(account: account))
    }

    init(client: APIClient, account: String, outbox: DeleteOutbox, cache: ResponseCache) {
        self.client = client
        self.account = account
        self.outbox = outbox
        self.cache = cache
    }

    /// How old a screen's data may get before showing it again fetches it anew.
    static let freshFor: TimeInterval = 60
}
