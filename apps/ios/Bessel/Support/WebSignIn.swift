import AuthenticationServices
import UIKit

/// A sign-in page in the system browser sheet, which ends when the page sends
/// the app back to its own URL scheme. Shares the browser's cookies, so a
/// service you're already signed in to doesn't ask again.
@MainActor
enum WebSignIn {
    private static var current: ASWebAuthenticationSession?
    private static let presenter = Presenter()

    /// The URL the page came back with; throws `CancellationError` when the
    /// sheet is closed first.
    static func open(_ url: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { callbackURL, error in
                current = nil
                if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: CancellationError())
                } else {
                    continuation.resume(throwing: error ?? URLError(.badServerResponse))
                }
            }
            session.presentationContextProvider = presenter
            current = session
            session.start()
        }
    }

    private final class Presenter: NSObject, ASWebAuthenticationPresentationContextProviding {
        func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
            UIApplication.shared.connectedScenes
                .compactMap { ($0 as? UIWindowScene)?.keyWindow }
                .first ?? ASPresentationAnchor()
        }
    }
}

/// Google or the server's reason a calendar didn't connect, as the web page put it.
struct GoogleConnectError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// What the web callback page sends back after a Google calendar sign-in:
/// the result only, never the code.
enum GoogleConnectResult: Equatable {
    case connected(email: String)
    case failed(message: String)

    init?(callback: URL) {
        // Form-encoded by the page's URLSearchParams: "+" is a space there.
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.percentEncodedQueryItems ?? []
        let value = { (name: String) in
            items.first { $0.name == name }?.value?.replacingOccurrences(of: "+", with: " ").removingPercentEncoding
        }
        switch value("result") {
        case "connected": self = .connected(email: value("email") ?? "")
        case "failed": self = .failed(message: value("message") ?? "Google didn't connect. Try again.")
        default: return nil
        }
    }
}
