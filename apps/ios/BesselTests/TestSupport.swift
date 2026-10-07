import Foundation
@testable import Bessel

/// Answers URLSession requests from a script instead of the network, and
/// remembers what was asked.
final class MockURLProtocol: URLProtocol {
    typealias Responder = (URLRequest) throws -> (Int, [String: String], Data)

    nonisolated(unsafe) static var responder: Responder = { _ in (200, [:], Data("{}".utf8)) }
    nonisolated(unsafe) static var requests: [URLRequest] = []

    static func reset() {
        responder = { _ in (200, [:], Data("{}".utf8)) }
        requests = []
    }

    /// Plays `responses` in order, repeating the last one.
    static func respond(with responses: [(Int, [String: String], String)]) {
        var remaining = responses
        responder = { _ in
            let next = remaining.count > 1 ? remaining.removeFirst() : remaining[0]
            return (next.0, next.1, Data(next.2.utf8))
        }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.requests.append(request)
        do {
            let (status, headers, data) = try Self.responder(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

@MainActor
func makeTestClient(retryPolicy: RetryPolicy = RetryPolicy(maxAttempts: 3, baseDelay: 0, maxRetryAfter: 1)) -> APIClient {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockURLProtocol.self]
    let auth = AuthSession()
    auth.useStaticToken("test-token")
    return APIClient(
        auth: auth,
        session: URLSession(configuration: configuration),
        baseURL: URL(string: "https://api.test")!,
        retryPolicy: retryPolicy
    )
}

func temporaryURL(_ name: String) -> URL {
    FileManager.default.temporaryDirectory.appending(path: "bessel-tests-\(UUID().uuidString)").appending(path: name)
}
