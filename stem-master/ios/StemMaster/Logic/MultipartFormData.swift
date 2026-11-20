import Foundation

/// Builds a `multipart/form-data` body (RFC 7578) and streams it to a file, so a 200 MB audio
/// upload never has to sit in memory: `URLSession.uploadTask(with:fromFile:)` sends the file.
struct MultipartFormData {
    enum Part: Equatable {
        case field(name: String, value: String)
        case file(name: String, filename: String, mimeType: String, fileURL: URL)
    }

    let boundary: String
    private(set) var parts: [Part] = []

    private static let crlf = "\r\n"
    private static let chunkSize = 1 << 20

    init(boundary: String = MultipartFormData.makeBoundary()) {
        self.boundary = boundary
    }

    /// A random boundary that cannot plausibly occur in the payload.
    static func makeBoundary() -> String {
        "StemMaster-" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
    }

    /// Value for the request's `Content-Type` header.
    var contentType: String { "multipart/form-data; boundary=\(boundary)" }

    mutating func addField(name: String, value: String) {
        parts.append(.field(name: name, value: value))
    }

    mutating func addFile(name: String, filename: String, mimeType: String, fileURL: URL) {
        parts.append(.file(name: name, filename: filename, mimeType: mimeType, fileURL: fileURL))
    }

    /// Makes a header parameter value safe inside double quotes: CR/LF are dropped and `"` / `\`
    /// are percent-encoded (what browsers do for `filename`).
    static func escapeQuoted(_ value: String) -> String {
        var result = ""
        for character in value {
            switch character {
            case "\r", "\n", "\r\n": continue
            case "\"": result += "%22"
            case "\\": result += "%5C"
            default: result.append(character)
            }
        }
        return result
    }

    /// The part header block, including the leading boundary line and the blank line.
    func header(for part: Part) -> Data {
        var lines = "--\(boundary)\(Self.crlf)"
        switch part {
        case let .field(name, _):
            lines += "Content-Disposition: form-data; name=\"\(Self.escapeQuoted(name))\"\(Self.crlf)"
        case let .file(name, filename, mimeType, _):
            lines += "Content-Disposition: form-data; name=\"\(Self.escapeQuoted(name))\"; filename=\"\(Self.escapeQuoted(filename))\"\(Self.crlf)"
            lines += "Content-Type: \(mimeType)\(Self.crlf)"
        }
        lines += Self.crlf
        return Data(lines.utf8)
    }

    /// The closing delimiter.
    var footer: Data { Data("--\(boundary)--\(Self.crlf)".utf8) }

    /// Writes the complete body to `url` (replacing any existing file) and returns its size.
    @discardableResult
    func writeBody(to url: URL) throws -> Int64 {
        let manager = FileManager.default
        if manager.fileExists(atPath: url.path) {
            try manager.removeItem(at: url)
        }
        guard manager.createFile(atPath: url.path, contents: nil) else {
            throw CocoaError(.fileWriteUnknown, userInfo: [NSFilePathErrorKey: url.path])
        }
        let output = try FileHandle(forWritingTo: url)
        defer { try? output.close() }

        var written: Int64 = 0
        func emit(_ data: Data) throws {
            try output.write(contentsOf: data)
            written += Int64(data.count)
        }

        for part in parts {
            try emit(header(for: part))
            switch part {
            case let .field(_, value):
                try emit(Data(value.utf8))
            case let .file(_, _, _, fileURL):
                let input = try FileHandle(forReadingFrom: fileURL)
                defer { try? input.close() }
                while let chunk = try input.read(upToCount: Self.chunkSize), !chunk.isEmpty {
                    try emit(chunk)
                }
            }
            try emit(Data(Self.crlf.utf8))
        }
        try emit(footer)
        try output.synchronize()
        return written
    }

    /// The complete body in memory (tests and small payloads).
    func bodyData() throws -> Data {
        var body = Data()
        for part in parts {
            body.append(header(for: part))
            switch part {
            case let .field(_, value):
                body.append(Data(value.utf8))
            case let .file(_, _, _, fileURL):
                body.append(try Data(contentsOf: fileURL))
            }
            body.append(Data(Self.crlf.utf8))
        }
        body.append(footer)
        return body
    }
}
