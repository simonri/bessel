import Foundation

extension Error {
    /// Work stopped on purpose, like leaving a screen mid-load: Swift's own
    /// cancellation or URLSession's cancelled request. Not worth showing.
    var isCancellation: Bool {
        self is CancellationError || (self as? URLError)?.code == .cancelled
    }

    /// No connection, or a request that never got an answer. Worth retrying
    /// later rather than giving up on.
    var isTransient: Bool {
        if let apiError = self as? APIError {
            return apiError.statusCode == 408 || apiError.statusCode == 429 || apiError.statusCode >= 500
        }
        return self is URLError && !isCancellation
    }

    /// A sentence fit to show someone: no status codes, JSON or URLs.
    var userMessage: String {
        switch self {
        case let apiError as APIError:
            return apiError.userMessage
        case let urlError as URLError:
            return urlError.userMessage
        case is DecodingError:
            return "Something went wrong. Try again in a moment."
        default:
            return localizedDescription
        }
    }
}

extension APIError {
    var userMessage: String {
        switch statusCode {
        case 401:
            return "You've been signed out. Sign in again to continue."
        case 404:
            return serverDetail ?? "That's no longer here. It may have been deleted."
        case 413:
            return "That's too large to upload."
        case 422:
            return serverDetail ?? "Some of that didn't look right. Check it and try again."
        case 426:
            return "There's a new version of Bessel. Update to keep going."
        case 429:
            return "You're going a little fast. Try again in a moment."
        case 400..<500:
            return serverDetail ?? "That didn't work. Try again."
        default:
            return "Something went wrong on our end. Try again in a moment."
        }
    }

    /// The API's own `detail` when it's a sentence. Validation errors come back
    /// as a list of field problems, which aren't fit to show as-is.
    var serverDetail: String? {
        guard let data = detail.data(using: .utf8),
              let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let detail = body["detail"] as? String,
              !detail.isEmpty
        else { return nil }
        return detail
    }
}

extension URLError {
    var userMessage: String {
        switch code {
        case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff:
            "You're offline. Check your connection and try again."
        case .timedOut:
            "The connection is slow right now. Try again in a moment."
        default:
            "Couldn't reach Bessel. Try again in a moment."
        }
    }
}
