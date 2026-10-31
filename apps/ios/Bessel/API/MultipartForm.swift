import Foundation

/// A multipart/form-data body holding one file, written to a temporary file
/// of its own so URLSession can stream it instead of holding it in memory.
struct MultipartForm {
    let body: URL
    let contentType: String

    private static let chunkSize = 1 << 20

    init(file: URL, field: String, contentType fileType: String) throws {
        let boundary = "bessel-\(UUID().uuidString)"
        let filename = file.lastPathComponent.replacingOccurrences(of: "\"", with: "")
        let head = "--\(boundary)\r\n"
            + "Content-Disposition: form-data; name=\"\(field)\"; filename=\"\(filename)\"\r\n"
            + "Content-Type: \(fileType)\r\n\r\n"
        let tail = "\r\n--\(boundary)--\r\n"

        body = FileManager.default.temporaryDirectory.appending(path: "upload-\(UUID().uuidString)")
        contentType = "multipart/form-data; boundary=\(boundary)"

        FileManager.default.createFile(atPath: body.path(percentEncoded: false), contents: nil)
        do {
            let output = try FileHandle(forWritingTo: body)
            defer { try? output.close() }
            let input = try FileHandle(forReadingFrom: file)
            defer { try? input.close() }

            try output.write(contentsOf: Data(head.utf8))
            while let chunk = try input.read(upToCount: Self.chunkSize), !chunk.isEmpty {
                try output.write(contentsOf: chunk)
            }
            try output.write(contentsOf: Data(tail.utf8))
        } catch {
            remove()
            throw error
        }
    }

    func remove() {
        try? FileManager.default.removeItem(at: body)
    }
}
