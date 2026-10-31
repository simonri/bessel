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
    private var store: URL!

    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
        APIClient.idempotencySupported = false
        let root = temporaryURL("timeline")
        inbox = root.appending(path: "Inbox")
        store = root.appending(path: "TimelineImports")
        try? FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
    }

    private func makeImporter() -> TimelineImporter {
        TimelineImporter(inbox: inbox, store: store)
    }

    /// A file as iOS leaves it in the Inbox when one is shared to the app.
    private func shared(_ name: String = "Timeline.json", contents: String = #"[{"visit":{}}]"#) throws -> URL {
        let url = inbox.appending(path: name)
        try Data(contents.utf8).write(to: url)
        return url
    }

    private func exists(_ url: URL?) -> Bool {
        guard let url else { return false }
        return FileManager.default.fileExists(atPath: url.path(percentEncoded: false))
    }

    private var keptFiles: [URL] {
        let folders = (try? FileManager.default.contentsOfDirectory(at: store, includingPropertiesForKeys: nil)) ?? []
        return folders.flatMap { (try? FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil)) ?? [] }
    }

    func testMultipartFormHoldsTheFileBetweenItsBoundaries() throws {
        let file = try shared(contents: #"{"semanticSegments":[]}"#)

        let form = try MultipartForm(file: file, field: "file", contentType: "application/json")
        defer { form.remove() }

        XCTAssertTrue(form.contentType.hasPrefix("multipart/form-data; boundary="))
        let boundary = String(form.contentType.split(separator: "=", maxSplits: 1)[1])
        XCTAssertEqual(
            String(decoding: try Data(contentsOf: form.body), as: UTF8.self),
            "--\(boundary)\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"Timeline.json\"\r\n"
                + "Content-Type: application/json\r\n\r\n"
                + #"{"semanticSegments":[]}"#
                + "\r\n--\(boundary)--\r\n"
        )
        form.remove()
        XCTAssertFalse(exists(form.body))
    }

    func testUploadSendsAMultipartFormWithAToken() async throws {
        MockURLProtocol.respond(with: [(200, [:], "{}")])
        let file = try shared()

        let _: [String: String] = try await makeTestClient().upload("/v1/files", file: file, contentType: "application/json")

        let request = try XCTUnwrap(MockURLProtocol.requests.first)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") == true)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
    }

    func testImportsTheSharedFileAndThenDeletesIt() async throws {
        MockURLProtocol.respond(with: [(200, [:], Self.imported)])
        let importer = makeImporter()
        let file = try shared()
        XCTAssertTrue(importer.receive(file))
        XCTAssertFalse(exists(file), "Moved out of the Inbox")
        XCTAssertEqual(importer.file?.lastPathComponent, "Timeline.json")

        await importer.start(client: makeTestClient())

        guard case let .imported(result) = importer.phase else { return XCTFail("Expected imported, got \(importer.phase)") }
        XCTAssertEqual(result.added, 3)
        XCTAssertEqual(keptFiles, [])
        let request = try XCTUnwrap(MockURLProtocol.requests.first)
        XCTAssertEqual(request.url?.path(), "/v1/location-history/import")
        let query = URLComponents(url: try XCTUnwrap(request.url), resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertNotNil(query.first { $0.name == "exported_at" }?.value)
    }

    func testAFileTheServerTurnsDownIsDeleted() async throws {
        MockURLProtocol.respond(with: [(422, [:], #"{"detail":"Not a Google Timeline export."}"#)])
        let importer = makeImporter()
        importer.receive(try shared())

        await importer.start(client: makeTestClient())

        XCTAssertEqual(importer.phase, .failed("Not a Google Timeline export."))
        XCTAssertEqual(keptFiles, [])
    }

    func testAFileThatCouldNotBeSentIsKeptForLater() async throws {
        for status in [429, 503] {
            MockURLProtocol.respond(with: [(status, [:], "{}")])
            let importer = makeImporter()
            importer.receive(try shared())

            await importer.start(client: makeTestClient())

            guard case .failed = importer.phase else { return XCTFail("Expected failed for \(status)") }
            XCTAssertTrue(exists(importer.file), "Kept after \(status)")
            importer.discard()
        }
    }

    func testClosingKeepsTheFileAndDiscardingDeletesIt() throws {
        let importer = makeImporter()
        importer.receive(try shared())

        importer.close()
        XCTAssertNil(importer.file)
        XCTAssertEqual(keptFiles.count, 1)

        importer.resumeLeftover()
        XCTAssertNotNil(importer.file)
        importer.discard()
        XCTAssertNil(importer.file)
        XCTAssertEqual(keptFiles, [])
    }

    func testOffersTheNewestExportLeftInTheInbox() throws {
        let older = try shared("Timeline-1.json")
        try FileManager.default.setAttributes([.creationDate: Date(timeIntervalSinceNow: -3600)], ofItemAtPath: older.path(percentEncoded: false))
        _ = try shared("Timeline-2.json")
        _ = try shared("notes.txt")
        let importer = makeImporter()

        importer.resumeLeftover()

        XCTAssertEqual(importer.file?.lastPathComponent, "Timeline-2.json")
        XCTAssertEqual(keptFiles.count, 2)
    }

    func testTheSameShareArrivingTwiceDuringAnImportChangesNothing() async throws {
        let release = DispatchSemaphore(value: 0)
        MockURLProtocol.responder = { _ in
            release.wait()
            return (200, [:], Data(Self.imported.utf8))
        }
        let importer = makeImporter()
        let file = try shared()
        importer.receive(file)
        let importing = Task { await importer.start(client: makeTestClient()) }
        while importer.phase != .importing { await Task.yield() }
        let current = importer.file

        // A cold launch: the leftover scan took it, then iOS delivers it again.
        XCTAssertFalse(importer.receive(file))
        XCTAssertTrue(importer.receive(try shared("Another.json")))
        XCTAssertEqual(importer.phase, .importing)
        XCTAssertEqual(importer.file, current)

        release.signal()
        await importing.value
        guard case .imported = importer.phase else { return XCTFail("Expected imported, got \(importer.phase)") }
        importer.close()
        importer.resumeLeftover()
        XCTAssertEqual(importer.file?.lastPathComponent, "Another.json", "Offered once the first is done")
    }

    func testIgnoresLinksAndOtherFiles() throws {
        let importer = makeImporter()
        XCTAssertFalse(importer.receive(URL(string: "com.simonri.bessel.dev://callback?code=1")!))
        XCTAssertFalse(importer.receive(try shared("photo.jpg")))
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
