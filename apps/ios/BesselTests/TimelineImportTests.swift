import XCTest
@testable import Bessel

@MainActor
final class TimelineImportTests: XCTestCase {
    private static let imported = """
    {"id":"6f1c2a52-3a4f-4d36-9d5e-2c4b9f0a1b2c","created_at":"2026-10-31T10:00:00Z","filename":"Timeline.json",
     "format":"ios","as_of":"2026-10-31T09:00:00Z","range_start":"2024-01-01T00:00:00Z","range_end":"2026-10-31T09:00:00Z",
     "segments":12,"added":3,"updated":1,"removed":0,"unchanged":8,"stale":0,"unreadable":0}
    """

    private var inbox: URL!

    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
        APIClient.idempotencySupported = false
        inbox = temporaryURL("Inbox")
        try? FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
    }

    private func export(_ name: String = "Timeline.json", contents: String = #"[{"visit":{}}]"#) throws -> URL {
        let url = inbox.appending(path: name)
        try Data(contents.utf8).write(to: url)
        return url
    }

    private func exists(_ url: URL) -> Bool {
        FileManager.default.fileExists(atPath: url.path(percentEncoded: false))
    }

    private func body(of request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: buffer.count)
            guard read > 0 else { break }
            data.append(buffer, count: read)
        }
        return data
    }

    func testUploadSendsTheFileAsAMultipartForm() async throws {
        MockURLProtocol.respond(with: [(200, [:], "{}")])
        let file = try export(contents: #"{"semanticSegments":[]}"#)

        let _: [String: String] = try await makeTestClient().upload("/v1/files", file: file, contentType: "application/json")

        let request = try XCTUnwrap(MockURLProtocol.requests.first)
        let contentType = try XCTUnwrap(request.value(forHTTPHeaderField: "Content-Type"))
        XCTAssertTrue(contentType.hasPrefix("multipart/form-data; boundary="))
        let boundary = String(contentType.split(separator: "=", maxSplits: 1)[1])
        let sent = String(decoding: body(of: request), as: UTF8.self)
        XCTAssertEqual(
            sent,
            "--\(boundary)\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"Timeline.json\"\r\n"
                + "Content-Type: application/json\r\n\r\n"
                + #"{"semanticSegments":[]}"#
                + "\r\n--\(boundary)--\r\n"
        )
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
    }

    func testImportsTheSharedFileAndThenDeletesIt() async throws {
        MockURLProtocol.respond(with: [(200, [:], Self.imported)])
        let importer = TimelineImporter(inbox: inbox)
        let file = try export()
        XCTAssertTrue(importer.receive(file))

        await importer.start(client: makeTestClient())

        guard case let .imported(result) = importer.phase else { return XCTFail("Expected imported, got \(importer.phase)") }
        XCTAssertEqual(result.added, 3)
        XCTAssertFalse(exists(file))
        let request = try XCTUnwrap(MockURLProtocol.requests.first)
        XCTAssertEqual(request.url?.path(), "/v1/location-history/import")
        let query = URLComponents(url: try XCTUnwrap(request.url), resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertNotNil(query.first { $0.name == "exported_at" }?.value)
    }

    func testAFileTheServerTurnsDownIsDeleted() async throws {
        MockURLProtocol.respond(with: [(422, [:], #"{"detail":"Not a Google Timeline export."}"#)])
        let importer = TimelineImporter(inbox: inbox)
        let file = try export()
        importer.receive(file)

        await importer.start(client: makeTestClient())

        XCTAssertEqual(importer.phase, .failed("Not a Google Timeline export."))
        XCTAssertFalse(exists(file))
    }

    func testAFileThatCouldNotBeSentIsKeptForLater() async throws {
        for status in [429, 503] {
            MockURLProtocol.respond(with: [(status, [:], "{}")])
            let importer = TimelineImporter(inbox: inbox)
            let file = try export()
            importer.receive(file)

            await importer.start(client: makeTestClient())

            guard case .failed = importer.phase else { return XCTFail("Expected failed for \(status)") }
            XCTAssertTrue(exists(file), "Kept after \(status)")
        }
    }

    func testClosingKeepsTheFileAndDiscardingDeletesIt() throws {
        let importer = TimelineImporter(inbox: inbox)
        let file = try export()
        importer.receive(file)

        importer.close()
        XCTAssertNil(importer.file)
        XCTAssertTrue(exists(file))

        importer.receive(file)
        importer.discard()
        XCTAssertNil(importer.file)
        XCTAssertFalse(exists(file))
    }

    func testOffersTheNewestLeftoverExport() throws {
        let older = try export("Timeline-1.json")
        try FileManager.default.setAttributes([.creationDate: Date(timeIntervalSinceNow: -3600)], ofItemAtPath: older.path(percentEncoded: false))
        let newer = try export("Timeline-2.json")
        _ = try export("notes.txt")
        let importer = TimelineImporter(inbox: inbox)

        importer.resumeLeftover()

        XCTAssertEqual(importer.file?.lastPathComponent, newer.lastPathComponent)
    }

    func testIgnoresLinksAndOtherFiles() throws {
        let importer = TimelineImporter(inbox: inbox)
        XCTAssertFalse(importer.receive(URL(string: "com.simonri.bessel.dev://callback?code=1")!))
        XCTAssertFalse(importer.receive(try export("photo.jpg")))
        XCTAssertNil(importer.file)
    }

    func testSummarySaysWhatChanged() throws {
        var result = try JSONDecoder.api.decode(API.LocationImportSchema.self, from: Data(Self.imported.utf8))
        XCTAssertEqual(TimelineImportSheet.summary(result), "3 added, 1 updated.")
        result.added = 0
        result.updated = 0
        result.unreadable = 2
        XCTAssertEqual(
            TimelineImportSheet.summary(result),
            "Already up to date.\n2 couldn't be read, so nothing was removed this time."
        )
    }
}
