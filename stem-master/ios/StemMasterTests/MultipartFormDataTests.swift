import Foundation
import XCTest
@testable import StemMaster

/// The upload body: boundaries, part headers, CRLFs and streamed file contents.
final class MultipartFormDataTests: XCTestCase {
    private var folder: URL!

    override func setUpWithError() throws {
        folder = try Fixtures.temporaryDirectory()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: folder)
    }

    private func makeFile(_ name: String, bytes: [UInt8]) throws -> URL {
        let url = folder.appendingPathComponent(name)
        try Data(bytes).write(to: url)
        return url
    }

    func testBodyLayoutIsExact() throws {
        let audio = try makeFile("song.mp3", bytes: [0x49, 0x44, 0x33, 0x00, 0xFF, 0x0D, 0x0A])
        var form = MultipartFormData(boundary: "TESTBOUNDARY")
        form.addField(name: "options", value: #"{"quality":"max"}"#)
        form.addFile(name: "file", filename: "My Song.mp3", mimeType: "audio/mpeg", fileURL: audio)

        XCTAssertEqual(form.contentType, "multipart/form-data; boundary=TESTBOUNDARY")

        var expected = Data()
        expected.append(Data("--TESTBOUNDARY\r\n".utf8))
        expected.append(Data("Content-Disposition: form-data; name=\"options\"\r\n\r\n".utf8))
        expected.append(Data(#"{"quality":"max"}"#.utf8))
        expected.append(Data("\r\n--TESTBOUNDARY\r\n".utf8))
        expected.append(Data("Content-Disposition: form-data; name=\"file\"; filename=\"My Song.mp3\"\r\n".utf8))
        expected.append(Data("Content-Type: audio/mpeg\r\n\r\n".utf8))
        expected.append(Data([0x49, 0x44, 0x33, 0x00, 0xFF, 0x0D, 0x0A]))
        expected.append(Data("\r\n--TESTBOUNDARY--\r\n".utf8))

        XCTAssertEqual(try form.bodyData(), expected)

        let bodyURL = folder.appendingPathComponent("body.multipart")
        let written = try form.writeBody(to: bodyURL)
        XCTAssertEqual(try Data(contentsOf: bodyURL), expected, "streamed body equals the in-memory body")
        XCTAssertEqual(written, Int64(expected.count))
    }

    func testBoundariesDelimitEveryPart() throws {
        let audio = try makeFile("a.wav", bytes: Array(repeating: 0x41, count: 10))
        var form = MultipartFormData()
        form.addField(name: "options", value: "{}")
        form.addFile(name: "file", filename: "a.wav", mimeType: "audio/wav", fileURL: audio)
        let body = String(decoding: try form.bodyData(), as: UTF8.self)

        XCTAssertTrue(form.boundary.hasPrefix("StemMaster-"))
        XCTAssertLessThanOrEqual(form.boundary.count, 70, "RFC 2046 boundary limit")
        XCTAssertTrue(body.hasPrefix("--\(form.boundary)\r\n"))
        XCTAssertTrue(body.hasSuffix("\r\n--\(form.boundary)--\r\n"))
        XCTAssertEqual(body.components(separatedBy: "--\(form.boundary)\r\n").count - 1, 2, "one opening delimiter per part")
        XCTAssertEqual(body.components(separatedBy: "--\(form.boundary)--").count - 1, 1, "exactly one closing delimiter")
        XCTAssertNotEqual(MultipartFormData().boundary, MultipartFormData().boundary, "boundaries are random")
    }

    func testLargeFileIsStreamedInChunks() throws {
        // Larger than the 1 MiB copy chunk, with a pattern that catches offset mistakes.
        let count = (1 << 20) * 2 + 12345
        let bytes = (0..<count).map { UInt8(truncatingIfNeeded: $0 &* 31 &+ 7) }
        let audio = try makeFile("big.flac", bytes: bytes)
        var form = MultipartFormData(boundary: "B")
        form.addFile(name: "file", filename: "big.flac", mimeType: "audio/flac", fileURL: audio)
        let bodyURL = folder.appendingPathComponent("big.multipart")
        try form.writeBody(to: bodyURL)
        let body = try Data(contentsOf: bodyURL)

        let header = form.header(for: form.parts[0])
        XCTAssertEqual(body.prefix(header.count), header)
        XCTAssertEqual(body.subdata(in: header.count..<(header.count + count)), Data(bytes))
        XCTAssertEqual(body.suffix(7), Data("\r\n--B--\r\n".utf8).suffix(7))
        XCTAssertEqual(body.count, header.count + count + "\r\n--B--\r\n".utf8.count)
    }

    func testQuotesAndNewlinesInFilenamesAreEscaped() throws {
        XCTAssertEqual(MultipartFormData.escapeQuoted(#"He said "hi".mp3"#), "He said %22hi%22.mp3")
        XCTAssertEqual(MultipartFormData.escapeQuoted("evil\r\nContent-Type: x.mp3"), "evilContent-Type: x.mp3")
        XCTAssertEqual(MultipartFormData.escapeQuoted(#"back\slash.wav"#), "back%5Cslash.wav")
        XCTAssertEqual(MultipartFormData.escapeQuoted("Café – Ünïcödé.m4a"), "Café – Ünïcödé.m4a", "UTF-8 is kept")

        let audio = try makeFile("x.mp3", bytes: [1])
        var form = MultipartFormData(boundary: "B")
        form.addFile(name: "file", filename: "a\"b.mp3", mimeType: "audio/mpeg", fileURL: audio)
        let header = String(decoding: form.header(for: form.parts[0]), as: UTF8.self)
        XCTAssertEqual(header, "--B\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a%22b.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n")
    }

    func testMissingFileThrows() {
        var form = MultipartFormData(boundary: "B")
        form.addFile(name: "file", filename: "gone.mp3", mimeType: "audio/mpeg", fileURL: folder.appendingPathComponent("gone.mp3"))
        XCTAssertThrowsError(try form.writeBody(to: folder.appendingPathComponent("body")))
    }
}
