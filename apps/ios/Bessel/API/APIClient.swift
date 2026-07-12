import Foundation

struct APIError: LocalizedError {
    let statusCode: Int
    let detail: String

    var errorDescription: String? { "API error \(statusCode): \(detail)" }
}

/// Thin URLSession client for the Bessel API. Attaches the Auth0 bearer token and
/// retries once with a forced refresh on 401, mirroring the web client interceptor.
@MainActor
final class APIClient {
    private let auth: AuthSession
    private let baseURL = AppConfig.apiBaseURL

    init(auth: AuthSession) {
        self.auth = auth
    }

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await send(method: "GET", path: path, query: query, body: nil)
    }

    func post<T: Decodable>(_ path: String, body: (some Encodable)? = Optional<Int>.none) async throws -> T {
        try await send(method: "POST", path: path, query: [], body: try encodeBody(body))
    }

    func patch<T: Decodable>(_ path: String, body: some Encodable) async throws -> T {
        try await send(method: "PATCH", path: path, query: [], body: try encodeBody(body))
    }

    func patchNoContent(_ path: String, body: some Encodable) async throws {
        _ = try await sendRaw(method: "PATCH", path: path, query: [], body: try encodeBody(body))
    }

    func deleteNoContent(_ path: String) async throws {
        _ = try await sendRaw(method: "DELETE", path: path, query: [], body: nil)
    }

    private func encodeBody(_ body: (some Encodable)?) throws -> Data? {
        guard let body else { return nil }
        return try JSONEncoder.api.encode(body)
    }

    private func send<T: Decodable>(method: String, path: String, query: [URLQueryItem], body: Data?) async throws -> T {
        let data = try await sendRaw(method: method, path: path, query: query, body: body)
        return try JSONDecoder.api.decode(T.self, from: data)
    }

    private func sendRaw(method: String, path: String, query: [URLQueryItem], body: Data?) async throws -> Data {
        let (data, status) = try await perform(method: method, path: path, query: query, body: body, forceRefresh: false)
        if status == 401 {
            let (retryData, retryStatus) = try await perform(method: method, path: path, query: query, body: body, forceRefresh: true)
            guard (200..<300).contains(retryStatus) else {
                if retryStatus == 401 { auth.signOut() }
                throw APIError(statusCode: retryStatus, detail: String(data: retryData, encoding: .utf8) ?? "")
            }
            return retryData
        }
        guard (200..<300).contains(status) else {
            throw APIError(statusCode: status, detail: String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }

    private func perform(method: String, path: String, query: [URLQueryItem], body: Data?, forceRefresh: Bool) async throws -> (Data, Int) {
        var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }

        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let token = try await auth.validAccessToken(forceRefresh: forceRefresh)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }
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
