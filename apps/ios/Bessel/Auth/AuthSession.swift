import AuthenticationServices
import CryptoKit
import Foundation
import Observation
import UIKit

struct TokenSet: Codable {
    var accessToken: String
    var refreshToken: String?
    var expiresAt: Date
}

enum AuthError: LocalizedError {
    case notAuthenticated
    case invalidCallback
    /// Auth0 said no for good: the sign-in or refresh token is revoked,
    /// expired or wrong. Only this ends the session.
    case rejected(String)
    /// Auth0 couldn't answer right now (outage, rate limit). The session stays.
    case tokenRequestFailed(status: Int)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated: "You've been signed out. Sign in again to continue."
        case .invalidCallback: "Sign-in was interrupted. Try again."
        case .rejected: "Sign-in didn't go through. Try again."
        case .tokenRequestFailed: "Couldn't reach the sign-in service. Try again in a moment."
        }
    }
}

/// Auth0 authorization-code + PKCE flow — the native equivalent of the web/desktop
/// Universal Login (Google is an Auth0 social connection). The backend only sees the
/// resulting RS256 bearer JWT.
@MainActor
@Observable
final class AuthSession {
    enum State {
        case restoring
        case signedOut
        case signedIn
    }

    /// One per app: a background task and the screens must share it, or two
    /// copies could each spend the same single-use refresh token.
    static let shared = AuthSession()

    private(set) var state: State = .restoring
    private(set) var userEmail: String?
    /// The signed-in account's stable id (the token's `sub`), which scopes
    /// what the app keeps on disk.
    private(set) var accountID: String?

    private var tokens: TokenSet?
    private var refreshTask: Task<TokenSet, Error>?
    private var webAuthSession: ASWebAuthenticationSession?
    private let presenter = WebAuthPresenter()
    private static let tokensKey = "tokens"

    func restore() {
        defer { if state == .restoring { state = .signedOut } }
        #if DEBUG
        // Simulator screenshots against a local API that trusts any token.
        if let token = ProcessInfo.processInfo.environment["BESSEL_DEBUG_TOKEN"] {
            useStaticToken(token)
            return
        }
        #endif
        guard let data = KeychainStore.load(Self.tokensKey),
              let stored = try? JSONDecoder().decode(TokenSet.self, from: data)
        else { return }
        tokens = stored
        userEmail = (KeychainStore.load("email")).flatMap { String(data: $0, encoding: .utf8) }
        accountID = Self.claims(of: stored.accessToken)?["sub"] as? String
        state = .signedIn
    }

    #if DEBUG
    /// Signs in with a fixed token, for screenshots and tests against an API
    /// that trusts any token.
    func useStaticToken(_ token: String) {
        tokens = TokenSet(accessToken: token, refreshToken: nil, expiresAt: .distantFuture)
        userEmail = "demo@bessel.app"
        accountID = "debug"
        state = .signedIn
    }
    #endif

    func signIn() async throws {
        let verifier = PKCE.randomURLSafeString(bytes: 64)
        let state = PKCE.randomURLSafeString(bytes: 16)

        var components = URLComponents(string: "https://\(AppConfig.auth0Domain)/authorize")!
        components.queryItems = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: AppConfig.auth0ClientID),
            URLQueryItem(name: "redirect_uri", value: AppConfig.auth0RedirectURI),
            URLQueryItem(name: "audience", value: AppConfig.auth0Audience),
            URLQueryItem(name: "scope", value: "openid profile email offline_access"),
            URLQueryItem(name: "code_challenge", value: PKCE.challenge(for: verifier)),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
        ]

        let callbackURL = try await authenticate(url: components.url!)
        let items = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?.queryItems
        guard items?.first(where: { $0.name == "state" })?.value == state,
              let code = items?.first(where: { $0.name == "code" })?.value
        else { throw AuthError.invalidCallback }

        let response = try await requestToken(parameters: [
            "grant_type": "authorization_code",
            "client_id": AppConfig.auth0ClientID,
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": AppConfig.auth0RedirectURI,
        ])
        apply(response)
        self.state = .signedIn
    }

    func signOut() {
        tokens = nil
        userEmail = nil
        accountID = nil
        refreshTask?.cancel()
        refreshTask = nil
        KeychainStore.delete(Self.tokensKey)
        KeychainStore.delete("email")
        // The sync cursor belongs to this account's data; a different account
        // signing in must start from scratch or its history would never upload.
        WorkoutSyncAnchor.clear()
        SleepSyncAnchor.clear()
        DailyMetricsSyncState.clear()
        ResponseCache.removeAll()
        DeleteOutbox.clear()
        GymOutbox.clear()
        state = .signedOut
    }

    /// Returns a fresh access token, refreshing through Auth0 when within a minute of expiry.
    func validAccessToken(forceRefresh: Bool = false) async throws -> String {
        guard let current = tokens else { throw AuthError.notAuthenticated }
        if !forceRefresh, current.expiresAt.timeIntervalSinceNow > 60 {
            return current.accessToken
        }
        return try await refreshTokens().accessToken
    }

    private func refreshTokens() async throws -> TokenSet {
        if let running = refreshTask { return try await running.value }
        guard let refreshToken = tokens?.refreshToken else {
            signOut()
            throw AuthError.notAuthenticated
        }
        let task = Task<TokenSet, Error> {
            let response = try await requestToken(parameters: [
                "grant_type": "refresh_token",
                "client_id": AppConfig.auth0ClientID,
                "refresh_token": refreshToken,
            ])
            return apply(response)
        }
        refreshTask = task
        defer { refreshTask = nil }
        do {
            return try await task.value
        } catch AuthError.rejected(let reason) {
            // Only a refresh token Auth0 won't accept ends the session. An outage,
            // a rate limit or no signal must not sign everyone out at once.
            signOut()
            throw AuthError.rejected(reason)
        }
    }

    @discardableResult
    private func apply(_ response: TokenResponse) -> TokenSet {
        let set = TokenSet(
            accessToken: response.accessToken,
            refreshToken: response.refreshToken ?? tokens?.refreshToken,
            expiresAt: Date(timeIntervalSinceNow: TimeInterval(response.expiresIn))
        )
        tokens = set
        accountID = Self.claims(of: response.accessToken)?["sub"] as? String ?? accountID
        if let data = try? JSONEncoder().encode(set) {
            KeychainStore.save(Self.tokensKey, data: data)
        }
        if let idToken = response.idToken, let email = Self.email(fromIDToken: idToken) {
            userEmail = email
            KeychainStore.save("email", data: Data(email.utf8))
        }
        return set
    }

    private struct TokenResponse: Decodable {
        let accessToken: String
        let refreshToken: String?
        let idToken: String?
        let expiresIn: Int

        enum CodingKeys: String, CodingKey {
            case accessToken = "access_token"
            case refreshToken = "refresh_token"
            case idToken = "id_token"
            case expiresIn = "expires_in"
        }
    }

    private func requestToken(parameters: [String: String]) async throws -> TokenResponse {
        var request = URLRequest(url: URL(string: "https://\(AppConfig.auth0Domain)/oauth/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = parameters
            .map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? $0.value)" }
            .joined(separator: "&")
            .data(using: .utf8)

        request.timeoutInterval = APIClient.requestTimeout

        let (data, response) = try await URLSession.bessel.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            if let reason = Self.rejection(status: status, body: data) {
                throw AuthError.rejected(reason)
            }
            throw AuthError.tokenRequestFailed(status: status)
        }
        return try JSONDecoder().decode(TokenResponse.self, from: data)
    }

    /// The OAuth error when Auth0 refused the grant itself, as opposed to failing
    /// to answer. https://www.rfc-editor.org/rfc/rfc6749#section-5.2
    nonisolated static func rejection(status: Int, body: Data) -> String? {
        guard [400, 401, 403].contains(status) else { return nil }
        let error = (try? JSONSerialization.jsonObject(with: body) as? [String: Any])?["error"] as? String
        let fatal: Set<String> = ["invalid_grant", "invalid_client", "unauthorized_client", "access_denied", "invalid_request"]
        guard let error, fatal.contains(error) else { return nil }
        return error
    }

    private func authenticate(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: AppConfig.authCallbackScheme
            ) { callbackURL, error in
                if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: CancellationError())
                } else {
                    continuation.resume(throwing: error ?? AuthError.invalidCallback)
                }
            }
            session.presentationContextProvider = presenter
            webAuthSession = session
            session.start()
        }
    }

    private static func email(fromIDToken idToken: String) -> String? {
        claims(of: idToken)?["email"] as? String
    }

    /// A JWT's payload, unverified: only for picking out who it belongs to.
    private static func claims(of jwt: String) -> [String: Any]? {
        let segments = jwt.split(separator: ".")
        guard segments.count >= 2 else { return nil }
        var base64 = String(segments[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
        guard let data = Data(base64Encoded: base64) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
}

private final class WebAuthPresenter: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }
            .first ?? ASPresentationAnchor()
    }
}

private enum PKCE {
    static func randomURLSafeString(bytes count: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        return Data(bytes).base64URLEncoded()
    }

    static func challenge(for verifier: String) -> String {
        Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncoded()
    }
}

private extension Data {
    func base64URLEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
