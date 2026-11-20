import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import StemMaster

/// Anchor class for locating the test bundle.
final class FixtureBundleToken {}

enum Fixtures {
    /// URL of a resource copied into the test bundle (Xcode) or the package's resource bundle
    /// (SwiftPM, used for running the Foundation-only tests on Linux).
    static func url(_ name: String, ext: String) -> URL? {
        #if SWIFT_PACKAGE
        return Bundle.module.url(forResource: name, withExtension: ext)
        #else
        return Bundle(for: FixtureBundleToken.self).url(forResource: name, withExtension: ext)
        #endif
    }

    /// Decodes with the app's API decoder.
    static func decode<T: Decodable>(_ type: T.Type, from json: String) throws -> T {
        try StemMasterJSON.makeDecoder().decode(T.self, from: Data(json.utf8))
    }

    /// A fresh, empty temporary folder.
    static func temporaryDirectory(_ label: String = #function) throws -> URL {
        let safe = label.filter { $0.isLetter || $0.isNumber }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("StemMasterTests-\(safe)-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    /// 256-point waveform for embedded fixtures.
    static func waveformJSON(_ value: Double = 0.25) -> String {
        "[" + Array(repeating: String(value), count: 256).joined(separator: ", ") + "]"
    }

    static let jobID = "3f2c9a0b1c2d3e4f5a6b7c8d9e0f1a2b"

    static let optionsJSON = """
    {"quality": "max", "drum_split": true, "vocal_split": true, "dereverb": false,
     "cleanup": true, "cleanup_strength": "standard", "denoise": false,
     "denoise_strength": "standard", "output_format": "wav24"}
    """

    static let analysisJSON = """
    {"duration_seconds": 213.41, "sample_rate": 48000, "channels": 2, "codec": "mp3",
     "bpm": 92.0, "bpm_confidence": 0.81, "key": "A minor", "camelot": "8A", "key_confidence": 0.64,
     "loudness_lufs": -9.1, "peak_dbfs": -0.4, "artifact_level": 0.62, "artifact_label": "high",
     "spectral_cutoff_hz": 16000.0}
    """

    static func stemJSON(id: String, name: String, group: String, role: String, color: String = "#FF7A1A") -> String {
        """
        {"id": "\(id)", "name": "\(name)", "group": "\(group)", "role": "\(role)", "color": "\(color)",
         "wav_url": "/v1/jobs/\(jobID)/stems/\(id).wav", "preview_url": "/v1/jobs/\(jobID)/stems/\(id).m4a",
         "wav_bytes": 75432112, "preview_bytes": 6843210, "peak_dbfs": -3.2, "rms_dbfs": -19.8,
         "active_ratio": 0.71, "waveform": \(waveformJSON())}
        """
    }

    static func stem(_ id: String, group: StemGroup, role: StemRole, name: String? = nil) -> Stem {
        Stem(
            id: id,
            name: name ?? id,
            group: group,
            role: role,
            color: "#FF7A1A",
            wavURL: "/v1/jobs/\(jobID)/stems/\(id).wav",
            previewURL: "/v1/jobs/\(jobID)/stems/\(id).m4a",
            wavBytes: 100,
            previewBytes: 10,
            peakDBFS: -3,
            rmsDBFS: -20,
            activeRatio: 0.5,
            waveform: Array(repeating: 0.5, count: 256)
        )
    }
}

extension Fixtures {
    static func jobJSON(
        id: String = jobID,
        status: String,
        stage: String = "queued",
        filename: String = "My Song.mp3",
        createdAt: Date = Date(),
        options: String = optionsJSON
    ) -> String {
        let created = ISO8601Timestamp.format(createdAt.wholeSeconds)
        return """
        {"id": "\(id)", "status": "\(status)", "created_at": "\(created)", "updated_at": "\(created)",
         "filename": "\(filename)", "options": \(options), "progress": 0.0, "stage": "\(stage)",
         "stage_label": "", "queue_position": null, "error": null, "analysis": null, "stems": [],
         "zip_url": null, "gain_offset_db": 0.0}
        """
    }

    static func capabilitiesJSON(maxUploadMB: Int = 200) -> String {
        """
        {"max_upload_mb": \(maxUploadMB), "max_duration_seconds": 900, "output_formats": ["wav24", "wav32f", "wav16"],
         "default_options": \(optionsJSON)}
        """
    }

    static func healthJSON(authRequired: Bool) -> String {
        #"{"status": "ok", "version": "1.0.0", "device": "cuda", "queue_length": 0, "auth_required": \#(authRequired)}"#
    }

    static func httpResponse(_ request: URLRequest, status: Int) -> HTTPURLResponse {
        HTTPURLResponse(url: request.url ?? URL(fileURLWithPath: "/"), statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
    }
}

/// Polls `condition` on the main actor until it holds (or fails the test after `timeout`).
@MainActor
func waitUntil(
    timeout: TimeInterval = 5,
    _ message: String = "condition",
    file: StaticString = #filePath,
    line: UInt = #line,
    _ condition: () -> Bool
) async throws {
    let deadline = Date().addingTimeInterval(timeout)
    while !condition() {
        if Date() > deadline {
            XCTFail("Timed out waiting for \(message)", file: file, line: line)
            throw CancellationError()
        }
        try await Task.sleep(nanoseconds: 10_000_000)
    }
}

/// An in-process stand-in for the server's JSON routes. `URLProtocol` stubs work for data
/// tasks on Linux and Apple platforms alike; uploads and downloads go through `StubTransfers`.
/// Every server has its own host, so a poll loop left over from an earlier test never reaches
/// a later test's routes.
final class StubServer: @unchecked Sendable {
    struct Reply {
        let status: Int
        let body: Data
    }

    let host = "\(UUID().uuidString.lowercased()).stub.test"
    private let lock = NSLock()
    private var routes: [String: Reply] = [:]
    private var log: [String] = []

    init() {
        StubURLProtocol.register(self)
    }

    var baseURL: String { "https://\(host)" }

    /// `"POST /v1/jobs/<id>/cancel"`-style lines, in arrival order.
    var requests: [String] {
        lock.lock()
        defer { lock.unlock() }
        return log
    }

    func route(_ method: String, _ path: String, status: Int = 200, json: String = "") {
        lock.lock()
        routes["\(method) \(path)"] = Reply(status: status, body: Data(json.utf8))
        lock.unlock()
    }

    func reply(to request: URLRequest) -> Reply {
        let line = "\(request.httpMethod ?? "GET") \(request.url?.path ?? "")"
        lock.lock()
        defer { lock.unlock() }
        log.append(line)
        return routes[line] ?? Reply(status: 404, body: Data(#"{"detail": "Not found"}"#.utf8))
    }

    func makeAPIClient(transfers: TransferSession) -> APIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return APIClient(
            configuration: APIClient.Configuration(baseURL: nil, apiKey: nil, clientID: "test-client"),
            session: URLSession(configuration: configuration),
            transfers: transfers
        )
    }
}

final class StubURLProtocol: URLProtocol {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var servers: [String: StubServer] = [:]

    static func register(_ server: StubServer) {
        lock.lock()
        servers[server.host] = server
        lock.unlock()
    }

    private static func server(for host: String) -> StubServer? {
        lock.lock()
        defer { lock.unlock() }
        return servers[host]
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let reply = Self.server(for: request.url?.host ?? "")?.reply(to: request)
            ?? StubServer.Reply(status: 404, body: Data())
        client?.urlProtocol(self, didReceive: Fixtures.httpResponse(request, status: reply.status), cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: reply.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

/// `TransferSession` with scripted uploads and downloads.
final class StubTransfers: TransferSession, @unchecked Sendable {
    typealias Upload = @Sendable (URLRequest, URL, TransferProgressHandler?) async throws -> (Data, HTTPURLResponse)
    typealias Download = @Sendable (URLRequest, URL, TransferProgressHandler?) async throws -> URL

    private let lock = NSLock()
    private var uploadHandler: Upload?
    private var downloadHandler: Download?
    private var uploads = 0

    var uploadCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return uploads
    }

    func onUpload(_ handler: @escaping Upload) {
        lock.lock()
        uploadHandler = handler
        lock.unlock()
    }

    func onDownload(_ handler: @escaping Download) {
        lock.lock()
        downloadHandler = handler
        lock.unlock()
    }

    private func currentUpload() -> Upload? {
        lock.lock()
        defer { lock.unlock() }
        uploads += 1
        return uploadHandler
    }

    private func currentDownload() -> Download? {
        lock.lock()
        defer { lock.unlock() }
        return downloadHandler
    }

    override func upload(_ request: URLRequest, fromFile fileURL: URL, progress: TransferProgressHandler?) async throws -> (Data, HTTPURLResponse) {
        guard let handler = currentUpload() else { throw APIError.network("No upload scripted.") }
        return try await handler(request, fileURL, progress)
    }

    override func download(_ request: URLRequest, to destination: URL, progress: TransferProgressHandler?) async throws -> URL {
        guard let handler = currentDownload() else { throw APIError.network("No download scripted.") }
        return try await handler(request, destination, progress)
    }
}

/// A one-shot latch that async code can wait on (cancellation does not end the wait).
final class Gate: @unchecked Sendable {
    private let lock = NSLock()
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            lock.lock()
            if isOpen {
                lock.unlock()
                continuation.resume()
            } else {
                waiters.append(continuation)
                lock.unlock()
            }
        }
    }

    func open() {
        lock.lock()
        isOpen = true
        let pending = waiters
        waiters = []
        lock.unlock()
        pending.forEach { $0.resume() }
    }
}

/// An `AppModel` wired to a `StubServer`, a temporary library and its own defaults suite.
@MainActor
final class AppHarness {
    let root: URL
    let server = StubServer()
    let transfers = StubTransfers()
    let settings: AppSettings
    let store: SessionStore
    private let suiteName = "StemMasterTests-\(UUID().uuidString)"
    private(set) var model: AppModel?

    init() throws {
        root = try Fixtures.temporaryDirectory("AppHarness")
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        settings = AppSettings(defaults: defaults)
        settings.serverURLString = server.baseURL
        store = SessionStore(rootURL: root)
    }

    /// Creates the model (this runs the relaunch recovery, so set routes first).
    @discardableResult
    func start() -> AppModel {
        let model = AppModel(settings: settings, store: store, hooks: .inert, clientID: "test-client", api: server.makeAPIClient(transfers: transfers))
        self.model = model
        return model
    }

    func sourceFile(_ name: String = "My Song.mp3", size: Int = 4096) throws -> URL {
        let folder = root.appendingPathComponent("Outside", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let url = folder.appendingPathComponent(name)
        try Data(repeating: 0x5A, count: size).write(to: url)
        return url
    }

    func importTrack(_ name: String = "My Song.mp3", size: Int = 4096) throws -> SessionRecord {
        try store.importAudio(from: sourceFile(name, size: size), options: JobOptions())
    }

    func tearDown() {
        model?.poller.pause()
        UserDefaults().removePersistentDomain(forName: suiteName)
        try? FileManager.default.removeItem(at: root)
    }
}
