import XCTest
@testable import Bessel

@MainActor
final class APIClientTests: XCTestCase {
    private struct Echo: Codable, Equatable {
        let title: String
    }

    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
        APIClient.idempotencySupported = false
    }

    func testSendsClientHeadersAndAToken() async throws {
        let client = makeTestClient()
        let _: [String: String] = try await client.get("/v1/things")

        let request = try XCTUnwrap(MockURLProtocol.requests.first)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Client-Platform"), "ios")
        XCTAssertNotNil(request.value(forHTTPHeaderField: "X-Client-Build"))
        XCTAssertNotNil(request.value(forHTTPHeaderField: "X-Request-ID"))
        XCTAssertNil(request.value(forHTTPHeaderField: "Idempotency-Key"))
    }

    func testWritesCarryAnIdempotencyKeyThatMatchesTheRequestID() async throws {
        let client = makeTestClient()
        let _: [String: String] = try await client.post("/v1/things", body: Echo(title: "Milk"))

        let request = try XCTUnwrap(MockURLProtocol.requests.first)
        let key = try XCTUnwrap(request.value(forHTTPHeaderField: "Idempotency-Key"))
        XCTAssertEqual(key, request.value(forHTTPHeaderField: "X-Request-ID"))
    }

    func testRetriesAReadAfterAServerError() async throws {
        MockURLProtocol.respond(with: [(503, [:], "{}"), (200, [:], #"{"title":"ok"}"#)])
        let client = makeTestClient()

        let echo: Echo = try await client.get("/v1/things")

        XCTAssertEqual(echo, Echo(title: "ok"))
        XCTAssertEqual(MockURLProtocol.requests.count, 2)
        let ids = Set(MockURLProtocol.requests.compactMap { $0.value(forHTTPHeaderField: "X-Request-ID") })
        XCTAssertEqual(ids.count, 1, "Retries are the same request")
    }

    func testGivesUpAfterTheLastAttempt() async throws {
        MockURLProtocol.respond(with: [(502, [:], "{}")])
        let client = makeTestClient()

        do {
            let _: Echo = try await client.get("/v1/things")
            XCTFail("Expected an error")
        } catch let error as APIError {
            XCTAssertEqual(error.statusCode, 502)
        }
        XCTAssertEqual(MockURLProtocol.requests.count, 3)
    }

    func testDoesNotRepeatAWriteTheServerMayHaveApplied() async throws {
        MockURLProtocol.respond(with: [(503, [:], "{}"), (200, [:], #"{"title":"ok"}"#)])
        let client = makeTestClient()

        do {
            let _: Echo = try await client.post("/v1/things", body: Echo(title: "Milk"))
            XCTFail("Expected an error")
        } catch let error as APIError {
            XCTAssertEqual(error.statusCode, 503)
        }
        XCTAssertEqual(MockURLProtocol.requests.count, 1)
    }

    func testRepeatsAWriteOnceTheServerDeduplicatesThem() async throws {
        APIClient.idempotencySupported = true
        MockURLProtocol.respond(with: [(503, [:], "{}"), (200, [:], #"{"title":"ok"}"#)])
        let client = makeTestClient()

        let echo: Echo = try await client.post("/v1/things", body: Echo(title: "Milk"))

        XCTAssertEqual(echo, Echo(title: "ok"))
        XCTAssertEqual(MockURLProtocol.requests.count, 2)
    }

    func testLearnsThatTheServerDeduplicatesFromTheEchoedKey() async throws {
        MockURLProtocol.responder = { request in
            (200, ["Idempotency-Key": request.value(forHTTPHeaderField: "Idempotency-Key") ?? ""], "{}".data(using: .utf8)!)
        }
        let client = makeTestClient()

        let _: [String: String] = try await client.post("/v1/things", body: Echo(title: "Milk"))

        XCTAssertTrue(APIClient.idempotencySupported)
    }

    func testRetriesARateLimitedWriteAfterRetryAfter() async throws {
        MockURLProtocol.respond(with: [(429, ["Retry-After": "0"], "{}"), (201, [:], #"{"title":"ok"}"#)])
        let client = makeTestClient()

        let echo: Echo = try await client.post("/v1/things", body: Echo(title: "Milk"))

        XCTAssertEqual(echo, Echo(title: "ok"))
        XCTAssertEqual(MockURLProtocol.requests.count, 2)
    }

    func testDoesNotWaitOutALongRetryAfter() async throws {
        MockURLProtocol.respond(with: [(429, ["Retry-After": "120"], "{}")])
        let client = makeTestClient()

        do {
            let _: Echo = try await client.get("/v1/things")
            XCTFail("Expected an error")
        } catch let error as APIError {
            XCTAssertEqual(error.statusCode, 429)
        }
        XCTAssertEqual(MockURLProtocol.requests.count, 1)
    }

    func testDoesNotRetryAClientError() async throws {
        MockURLProtocol.respond(with: [(404, [:], #"{"detail":"Task not found"}"#)])
        let client = makeTestClient()

        do {
            let _: Echo = try await client.get("/v1/things")
            XCTFail("Expected an error")
        } catch let error as APIError {
            XCTAssertEqual(error.userMessage, "Task not found")
            XCTAssertFalse(error.isMissingRoute)
        }
        XCTAssertEqual(MockURLProtocol.requests.count, 1)
    }

    func testAnnouncesWhenTheBuildIsTooOld() async throws {
        MockURLProtocol.respond(with: [(426, [:], "{}")])
        let client = makeTestClient()
        let announced = expectation(forNotification: .besselUpdateRequired, object: nil)

        let _: Echo? = try? await client.get("/v1/things")

        await fulfillment(of: [announced], timeout: 1)
    }

    func testReadsEveryPage() async throws {
        MockURLProtocol.responder = { request in
            let page = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "page" }?.value ?? "1"
            let body = #"{"items":[{"title":"page \#(page)"}],"pagination":{"total_count":3,"max_page":3}}"#
            return (200, [:], Data(body.utf8))
        }
        let client = makeTestClient()

        let items: [Echo] = try await client.getAllPages("/v1/things")

        XCTAssertEqual(items.map(\.title), ["page 1", "page 2", "page 3"])
    }

    func testStopsPagingAtTheCap() async throws {
        MockURLProtocol.respond(with: [(200, [:], #"{"items":[{"title":"x"}],"pagination":{"total_count":1000,"max_page":1000}}"#)])
        let client = makeTestClient()

        let items: [Echo] = try await client.getAllPages("/v1/things", maxPages: 4)

        XCTAssertEqual(items.count, 4)
    }
}
