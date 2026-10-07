import Foundation
import os

struct APIError: LocalizedError {
    let statusCode: Int
    let detail: String

    var errorDescription: String? { userMessage }

    /// The server has no such endpoint (it predates it), as opposed to the
    /// endpoint saying the item doesn't exist.
    var isMissingRoute: Bool {
        statusCode == 405 || (statusCode == 404 && serverDetail == "Not Found")
    }
}

extension Notification.Name {
    /// The server no longer accepts this build; the app shows an update screen.
    static let besselUpdateRequired = Notification.Name("besselUpdateRequired")
}

extension URLSession {
    /// Short timeouts and no HTTP cache: a request that hangs should fail fast
    /// enough to retry, and stale-but-instant data comes from `ResponseCache`.
    static let bessel: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = APIClient.slowRequestTimeout
        configuration.timeoutIntervalForResource = 120
        configuration.waitsForConnectivity = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        return URLSession(configuration: configuration)
    }()
}

/// URLSession client for the Bessel API. Attaches the Auth0 bearer token and
/// retries once with a forced refresh on 401, mirroring the web client interceptor.
/// Transient failures are retried with backoff when that can't apply a change twice.
@MainActor
final class APIClient {
    nonisolated static let requestTimeout: TimeInterval = 20
    nonisolated static let slowRequestTimeout: TimeInterval = 90

    private let auth: AuthSession
    private let session: URLSession
    private let baseURL: URL
    private let retryPolicy: RetryPolicy

    private static let log = Logger(subsystem: "app.bessel", category: "api")
    private static let idempotencySupportKey = "api.idempotencySupported"

    init(
        auth: AuthSession,
        session: URLSession = .bessel,
        baseURL: URL = AppConfig.apiBaseURL,
        retryPolicy: RetryPolicy = .standard
    ) {
        self.auth = auth
        self.session = session
        self.baseURL = baseURL
        self.retryPolicy = retryPolicy
    }

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await send(Request(method: "GET", path: path, query: query))
    }

    /// Every page of a paginated list, up to `maxPages` so a runaway list
    /// can't keep the app fetching forever.
    func getAllPages<Item: Decodable>(_ path: String, query: [URLQueryItem] = [], maxPages: Int = 20) async throws -> [Item] {
        var items: [Item] = []
        var page = 1
        while true {
            let response: Page<Item> = try await get(path, query: query + [
                URLQueryItem(name: "limit", value: String(Self.pageSize)),
                URLQueryItem(name: "page", value: String(page)),
            ])
            items += response.items
            guard page < response.pagination.maxPage, page < maxPages else { return items }
            page += 1
        }
    }

    /// The API's largest page.
    nonisolated static let pageSize = 100

    private struct Page<Item: Decodable>: Decodable {
        @Lossy var items: [Item]
        let pagination: Pagination

        struct Pagination: Decodable {
            let maxPage: Int
        }
    }

    func post<T: Decodable>(_ path: String, body: (some Encodable)? = Optional<Int>.none, timeout: TimeInterval = requestTimeout) async throws -> T {
        try await send(Request(method: "POST", path: path, body: try encodeBody(body), timeout: timeout))
    }

    /// For a body that's JSON already, like a report the OS produced.
    func postNoContent(_ path: String, json: Data) async throws {
        _ = try await sendRaw(Request(method: "POST", path: path, body: json))
    }

    func patch<T: Decodable>(_ path: String, body: some Encodable) async throws -> T {
        try await send(Request(method: "PATCH", path: path, body: try encodeBody(body)))
    }

    func patchNoContent(_ path: String, body: some Encodable) async throws {
        _ = try await sendRaw(Request(method: "PATCH", path: path, body: try encodeBody(body)))
    }

    func put<T: Decodable>(_ path: String, body: some Encodable) async throws -> T {
        try await send(Request(method: "PUT", path: path, body: try encodeBody(body)))
    }

    func deleteNoContent(_ path: String, query: [URLQueryItem] = []) async throws {
        _ = try await sendRaw(Request(method: "DELETE", path: path, query: query))
    }

    // MARK: - Sending

    struct Request {
        let method: String
        let path: String
        var query: [URLQueryItem] = []
        var body: Data?
        var timeout: TimeInterval = APIClient.requestTimeout
        /// Same for every attempt, so the server can tie retries together and
        /// return the first result instead of applying a change twice.
        let id = UUID().uuidString

        var isRead: Bool { method == "GET" || method == "HEAD" }
    }

    private func encodeBody(_ body: (some Encodable)?) throws -> Data? {
        guard let body else { return nil }
        return try JSONEncoder.api.encode(body)
    }

    private func send<T: Decodable>(_ request: Request) async throws -> T {
        let data = try await sendRaw(request)
        return try JSONDecoder.api.decode(T.self, from: data)
    }

    private func sendRaw(_ request: Request) async throws -> Data {
        var attempt = 1
        while true {
            do {
                return try await sendAuthorized(request)
            } catch {
                guard let delay = retryDelay(after: error, request: request, attempt: attempt) else {
                    throw (error as? RetryableResponse)?.error ?? error
                }
                Self.log.info("Retrying \(request.method, privacy: .public) \(request.path, privacy: .public) in \(delay, privacy: .public)s (attempt \(attempt + 1))")
                try await Task.sleep(for: .seconds(delay))
                attempt += 1
            }
        }
    }

    private func sendAuthorized(_ request: Request) async throws -> Data {
        let (data, response) = try await perform(request, forceRefresh: false)
        if response.statusCode == 401 {
            let (retryData, retryResponse) = try await perform(request, forceRefresh: true)
            if retryResponse.statusCode == 401 { auth.signOut() }
            return try check(retryData, retryResponse, request)
        }
        return try check(data, response, request)
    }

    private func check(_ data: Data, _ response: HTTPURLResponse, _ request: Request) throws -> Data {
        if !request.isRead, response.value(forHTTPHeaderField: "Idempotency-Key") == request.id {
            Self.idempotencySupported = true
        }
        if (200..<300).contains(response.statusCode) { return data }
        if response.statusCode == 426 {
            NotificationCenter.default.post(name: .besselUpdateRequired, object: nil)
        }
        let error = APIError(statusCode: response.statusCode, detail: String(data: data, encoding: .utf8) ?? "")
        if response.statusCode >= 500 {
            Self.log.error("\(request.method, privacy: .public) \(request.path, privacy: .public) failed with \(response.statusCode) (request \(request.id, privacy: .public))")
        }
        throw RetryableResponse(error: error, retryAfter: Self.retryAfter(response))
    }

    private func perform(_ request: Request, forceRefresh: Bool) async throws -> (Data, HTTPURLResponse) {
        var components = URLComponents(url: baseURL.appending(path: request.path), resolvingAgainstBaseURL: false)!
        if !request.query.isEmpty { components.queryItems = request.query }

        var urlRequest = URLRequest(url: components.url!, timeoutInterval: request.timeout)
        urlRequest.httpMethod = request.method
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        for (name, value) in ClientInfo.headers {
            urlRequest.setValue(value, forHTTPHeaderField: name)
        }
        urlRequest.setValue(request.id, forHTTPHeaderField: "X-Request-ID")
        if !request.isRead {
            urlRequest.setValue(request.id, forHTTPHeaderField: "Idempotency-Key")
        }
        let token = try await auth.validAccessToken(forceRefresh: forceRefresh)
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        urlRequest.httpBody = request.body

        let (data, response) = try await session.data(for: urlRequest)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        return (data, http)
    }

    // MARK: - Retrying

    /// Seconds to wait before trying again, or nil when the error should surface.
    private func retryDelay(after error: Error, request: Request, attempt: Int) -> TimeInterval? {
        guard attempt < retryPolicy.maxAttempts, !error.isCancellation else { return nil }
        let replaySafe = request.isRead || Self.idempotencySupported

        if let response = error as? RetryableResponse {
            switch response.error.statusCode {
            case 429:
                // Rejected before it ran, so even a change is safe to send again.
                return response.retryAfter.map { $0 <= retryPolicy.maxRetryAfter ? $0 : nil } ?? retryPolicy.backoff(attempt: attempt)
            case 409 where response.retryAfter != nil && !request.isRead:
                // The same change is still running on the server from an
                // attempt whose answer got lost; its result replays shortly.
                return min(response.retryAfter ?? 1, retryPolicy.maxRetryAfter)
            case 502, 503, 504:
                guard replaySafe else { return nil }
                if let retryAfter = response.retryAfter {
                    return retryAfter <= retryPolicy.maxRetryAfter ? retryAfter : nil
                }
                return retryPolicy.backoff(attempt: attempt)
            default:
                return nil
            }
        }

        guard let urlError = error as? URLError else { return nil }
        switch urlError.code {
        case .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed:
            // Never reached the server.
            return retryPolicy.backoff(attempt: attempt)
        case .timedOut where request.timeout > Self.requestTimeout:
            // A slow, costly request (a model call) isn't worth running twice.
            return nil
        case .timedOut, .networkConnectionLost:
            return replaySafe ? retryPolicy.backoff(attempt: attempt) : nil
        default:
            return nil
        }
    }

    private static func retryAfter(_ response: HTTPURLResponse) -> TimeInterval? {
        guard let value = response.value(forHTTPHeaderField: "Retry-After") else { return nil }
        if let seconds = TimeInterval(value) { return max(0, seconds) }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        return formatter.date(from: value).map { max(0, $0.timeIntervalSinceNow) }
    }

    /// Learned from the server echoing `Idempotency-Key`: from then on a change
    /// whose response got lost can be sent again without applying it twice.
    static var idempotencySupported: Bool {
        get { UserDefaults.standard.bool(forKey: idempotencySupportKey) }
        set { UserDefaults.standard.set(newValue, forKey: idempotencySupportKey) }
    }
}

/// A failed response, kept with its Retry-After until the retry decision is
/// made; callers only ever see the `APIError` inside.
private struct RetryableResponse: Error {
    let error: APIError
    let retryAfter: TimeInterval?
}

struct RetryPolicy {
    var maxAttempts: Int
    var baseDelay: TimeInterval
    /// A longer Retry-After than this fails right away instead of leaving
    /// someone staring at a spinner.
    var maxRetryAfter: TimeInterval

    static let standard = RetryPolicy(maxAttempts: 3, baseDelay: 0.4, maxRetryAfter: 8)

    /// Exponential with jitter, so phones that failed together don't all come
    /// back in the same instant.
    func backoff(attempt: Int) -> TimeInterval {
        baseDelay * pow(2, Double(attempt - 1)) * Double.random(in: 0.5...1.5)
    }
}

/// Who is calling, sent on every request so the server can tell builds apart
/// in its logs and turn away builds it no longer supports.
enum ClientInfo {
    static let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    static let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"

    static let headers: [String: String] = [
        "X-Client-Platform": "ios",
        "X-Client-Version": version,
        "X-Client-Build": build,
    ]
}

extension JSONDecoder {
    static let api: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { decoder in
            let string = try decoder.singleValueContainer().decode(String.self)
            if let date = DateParsing.parse(string) { return date }
            throw DecodingError.dataCorrupted(.init(
                codingPath: decoder.codingPath,
                debugDescription: "Unparseable date: \(string)"
            ))
        }
        return decoder
    }()
}

extension JSONEncoder {
    /// Encoder for request bodies. The only dates the app sends are `due_date`
    /// values, which the API expects as plain YYYY-MM-DD.
    static let api: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(DateParsing.dateOnly.string(from: date))
        }
        return encoder
    }()
}

enum DateParsing {
    /// Local timezone: due dates are calendar dates, and round-tripping them through
    /// UTC would shift them a day for anyone east of Greenwich picking local midnight.
    static let dateOnly: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let isoFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private static let iso = ISO8601DateFormatter()
    private static let naiveFractional = makeFormatter("yyyy-MM-dd'T'HH:mm:ss.SSSSSS")
    private static let naive = makeFormatter("yyyy-MM-dd'T'HH:mm:ss")

    static func parse(_ string: String) -> Date? {
        isoFractional.date(from: string)
            ?? iso.date(from: string)
            ?? naiveFractional.date(from: string)
            ?? naive.date(from: string)
            ?? dateOnly.date(from: string)
    }

    private static func makeFormatter(_ format: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = format
        return formatter
    }
}
