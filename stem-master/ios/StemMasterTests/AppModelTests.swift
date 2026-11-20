import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import StemMaster

/// The import -> upload -> poll workflow against a stub server: upload preflight, the
/// cancel/response races, relaunch recovery, Test Connection and transfer cancellation.
final class AppModelTests: XCTestCase {
    @MainActor
    private func scriptSuccessfulServer(_ harness: AppHarness, maxUploadMB: Int = 200) {
        harness.server.route("GET", "/v1/capabilities", json: Fixtures.capabilitiesJSON(maxUploadMB: maxUploadMB))
        harness.server.route("GET", "/v1/jobs/\(Fixtures.jobID)", json: Fixtures.jobJSON(status: "queued"))
        harness.server.route("POST", "/v1/jobs/\(Fixtures.jobID)/cancel", json: Fixtures.jobJSON(status: "cancelled"))
        harness.server.route("DELETE", "/v1/jobs/\(Fixtures.jobID)", status: 204)
    }

    private static func accepted(_ request: URLRequest) -> (Data, HTTPURLResponse) {
        (Data(Fixtures.jobJSON(status: "queued").utf8), Fixtures.httpResponse(request, status: 202))
    }

    // MARK: Upload

    @MainActor
    func testSuccessfulUploadIsTracked() async throws {
        let harness = try AppHarness()
        defer { harness.tearDown() }
        scriptSuccessfulServer(harness)
        harness.transfers.onUpload { request, _, progress in
            progress?(1)
            return Self.accepted(request)
        }
        let model = harness.start()
        let session = try harness.importTrack()

        model.startProcessing(sessionID: session.id, options: JobOptions())
        try await waitUntil("the job is tracked") { harness.store.session(id: session.id)?.jobID == Fixtures.jobID }
        XCTAssertEqual(harness.store.session(id: session.id)?.state, .queued)
        XCTAssertTrue(model.poller.trackedSessions.contains(session.id))
        XCTAssertEqual(harness.transfers.uploadCount, 1)
    }

    /// A wrong or missing key used to surface only after the whole file had been sent.
    @MainActor
    func testUploadChecksTheAPIKeyBeforeSendingTheFile() async throws {
        let harness = try AppHarness()
        defer { harness.tearDown() }
        harness.server.route("GET", "/v1/capabilities", status: 401, json: #"{"detail": "Invalid or missing API key"}"#)
        harness.transfers.onUpload { request, _, _ in Self.accepted(request) }
        let model = harness.start()
        let session = try harness.importTrack()

        model.startProcessing(sessionID: session.id, options: JobOptions())
        try await waitUntil("the upload fails") { harness.store.session(id: session.id)?.state == .failed }
        XCTAssertEqual(harness.transfers.uploadCount, 0, "nothing is uploaded with a rejected key")
        XCTAssertTrue(harness.store.session(id: session.id)?.errorMessage?.contains("API key") == true)
    }

    @MainActor
    func testFileOverTheServerLimitFailsBeforeSending() async throws {
        let harness = try AppHarness()
        defer { harness.tearDown() }
        scriptSuccessfulServer(harness, maxUploadMB: 1)
        harness.transfers.onUpload { request, _, _ in Self.accepted(request) }
        let model = harness.start()
        let session = try harness.importTrack(size: 2 * 1024 * 1024)

        model.startProcessing(sessionID: session.id, options: JobOptions())
        try await waitUntil("the upload fails") { harness.store.session(id: session.id)?.state == .failed }
        XCTAssertEqual(harness.transfers.uploadCount, 0)
        let message = harness.store.session(id: session.id)?.errorMessage ?? ""
        XCTAssertTrue(message.contains("MB"), message)
    }

    /// Once the whole file is sent the server creates the job; cancelling the request then
    /// would leave that job running with no way to reach it. The app waits for the job id
    /// and cancels and deletes the job instead.
    @MainActor
    func testCancelAfterTheFileWasSentCancelsTheJobTheServerCreated() async throws {
        let harness = try AppHarness()
        defer { harness.tearDown() }
        scriptSuccessfulServer(harness)
        let response = Gate()
        harness.transfers.onUpload { request, _, progress in
            progress?(1)
            await response.wait()
            // The client gave up before the response came back: the job exists all the same.
            if Task.isCancelled { throw CancellationError() }
            return Self.accepted(request)
        }
        let model = harness.start()
        let session = try harness.importTrack()

        model.startProcessing(sessionID: session.id, options: JobOptions())
        try await waitUntil("the file is sent") { model.uploadProgress[session.id] == 1 }
        model.cancelProcessing(sessionID: session.id)
        XCTAssertTrue(model.isCancellingUpload(session.id))
        response.open()

        try await waitUntil("the session is cancelled") { harness.store.session(id: session.id)?.state == .cancelled }
        try await waitUntil("the job is deleted") { harness.server.requests.contains("DELETE /v1/jobs/\(Fixtures.jobID)") }
        XCTAssertTrue(harness.server.requests.contains("POST /v1/jobs/\(Fixtures.jobID)/cancel"))
        XCTAssertFalse(model.poller.trackedSessions.contains(session.id))
        XCTAssertFalse(model.isCancellingUpload(session.id))
    }

    /// The response can beat the cancellation: the created job must still be cancelled.
    @MainActor
    func testCancelThatLosesTheRaceToTheResponseStillCancelsTheJob() async throws {
        let harness = try AppHarness()
        defer { harness.tearDown() }
        scriptSuccessfulServer(harness)
        let response = Gate()
        harness.transfers.onUpload { request, _, progress in
            progress?(0.5)
            await response.wait()
            return Self.accepted(request)
        }
        let model = harness.start()
        let session = try harness.importTrack()

        model.startProcessing(sessionID: session.id, options: JobOptions())
        try await waitUntil("half the file is sent") { model.uploadProgress[session.id] == 0.5 }
        model.cancelProcessing(sessionID: session.id)
        response.open()

        try await waitUntil("the job is deleted") { harness.server.requests.contains("DELETE /v1/jobs/\(Fixtures.jobID)") }
        XCTAssertEqual(harness.store.session(id: session.id)?.state, .cancelled)
        XCTAssertNil(harness.store.session(id: session.id)?.jobID)
        XCTAssertFalse(model.poller.trackedSessions.contains(session.id))
    }

    @MainActor
    func testCancelBeforeTheFileIsSentStopsTheUpload() async throws {
        let harness = try AppHarness()
        defer { harness.tearDown() }
        scriptSuccessfulServer(harness)
        let response = Gate()
        harness.transfers.onUpload { request, _, progress in
            progress?(0.25)
            await response.wait()
            if Task.isCancelled { throw CancellationError() }
            return Self.accepted(request)
        }
        let model = harness.start()
        let session = try harness.importTrack()

        model.startProcessing(sessionID: session.id, options: JobOptions())
        try await waitUntil("a quarter is sent") { model.uploadProgress[session.id] == 0.25 }
        model.cancelProcessing(sessionID: session.id)
        response.open()
        try await waitUntil("the session is cancelled") { harness.store.session(id: session.id)?.state == .cancelled }
        XCTAssertFalse(harness.server.requests.contains { $0.hasPrefix("POST /v1/jobs/\(Fixtures.jobID)/cancel") })
    }

    // MARK: Relaunch

    /// The app was killed after the server got the whole file: the job is picked up again.
    @MainActor
    func testRelaunchPicksUpTheJobOfAnInterruptedUpload() async throws {
        let harness = try AppHarness()
        defer { harness.tearDown() }
        let session = try harness.importTrack()
        let started = Date().addingTimeInterval(-60).wholeSeconds
        harness.store.update(session.id) { record in
            record.state = .uploading
            record.updatedAt = started
        }
        let other = "0123456789abcdef0123456789abcdef"
        harness.server.route("GET", "/v1/jobs", json: """
        {"jobs": [\(Fixtures.jobJSON(status: "processing", stage: "vocals", createdAt: started.addingTimeInterval(30))),
                  \(Fixtures.jobJSON(id: other, status: "processing", filename: "Another Song.wav", createdAt: started))]}
        """)
        harness.server.route("GET", "/v1/jobs/\(Fixtures.jobID)", json: Fixtures.jobJSON(status: "processing", stage: "vocals"))

        let model = harness.start()
        try await waitUntil("the job is adopted") { harness.store.session(id: session.id)?.jobID == Fixtures.jobID }
        XCTAssertEqual(harness.store.session(id: session.id)?.state, .processing)
        XCTAssertTrue(model.poller.trackedSessions.contains(session.id))
        XCTAssertFalse(harness.server.requests.contains { $0.contains(other) }, "jobs that match nothing are left alone")
    }

    @MainActor
    func testRelaunchWithoutAMatchKeepsTheInterruptedMessage() async throws {
        let harness = try AppHarness()
        defer { harness.tearDown() }
        let session = try harness.importTrack()
        harness.store.update(session.id) { $0.state = .uploading }
        harness.server.route("GET", "/v1/jobs", json: #"{"jobs": []}"#)

        harness.start()
        try await waitUntil("the job list is read") { harness.server.requests.contains("GET /v1/jobs") }
        let record = try XCTUnwrap(harness.store.session(id: session.id))
        XCTAssertEqual(record.state, .failed)
        XCTAssertNil(record.jobID)
        XCTAssertTrue(record.errorMessage?.contains("interrupted") == true)
    }

    @MainActor
    func testStaleUploadBodiesAreRemovedAtLaunch() throws {
        let folder = APIClient.uploadStagingFolder
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let stale = folder.appendingPathComponent("upload-\(UUID().uuidString).multipart")
        try Data(repeating: 1, count: 128).write(to: stale)
        let harness = try AppHarness()
        defer { harness.tearDown() }
        harness.start()
        XCTAssertFalse(FileManager.default.fileExists(atPath: stale.path))
    }

    // MARK: Settings

    /// `/v1/health` needs no key, so a wrong key used to read as "Connected".
    @MainActor
    func testConnectionTestChecksTheAPIKey() async throws {
        let harness = try AppHarness()
        defer { harness.tearDown() }
        harness.server.route("GET", "/v1/health", json: Fixtures.healthJSON(authRequired: true))
        harness.server.route("GET", "/v1/capabilities", status: 401, json: #"{"detail": "Invalid or missing API key"}"#)
        let model = harness.start()

        await model.testConnection()
        guard case let .failure(message) = model.connectionTest else {
            return XCTFail("expected a failure, got \(model.connectionTest)")
        }
        XCTAssertTrue(message.contains("API key"), message)

        harness.server.route("GET", "/v1/capabilities", json: Fixtures.capabilitiesJSON())
        await model.testConnection()
        guard case .success = model.connectionTest else {
            return XCTFail("expected success, got \(model.connectionTest)")
        }
    }

    @MainActor
    func testConnectionTestExplainsAWrongAddress() async throws {
        let harness = try AppHarness()
        defer { harness.tearDown() }
        let model = harness.start()
        await model.testConnection()
        guard case let .failure(message) = model.connectionTest else {
            return XCTFail("expected a failure, got \(model.connectionTest)")
        }
        XCTAssertFalse(message.contains("24 hours"), "a 404 on /v1/health is a wrong address, not an expired job")
        XCTAssertTrue(message.contains("/v1"), message)
    }

    // MARK: Downloads

    @MainActor
    func testLosslessDownloadCanBeCancelled() async throws {
        let harness = try AppHarness()
        defer { harness.tearDown() }
        harness.transfers.onDownload { _, destination, progress in
            progress?(0.1)
            try await Task.sleep(nanoseconds: 30_000_000_000)
            return destination
        }
        let model = harness.start()
        let session = try harness.importTrack()
        let stem = Fixtures.stem("lead_vocals", group: .vocals, role: .primary)

        let download = Task { try await model.losslessFile(for: stem, sessionID: session.id) }
        try await waitUntil("the download runs") { model.transferProgress(sessionID: session.id, item: stem.id) != nil }
        model.cancelTransfer(sessionID: session.id, item: stem.id)
        let result = await download.result
        XCTAssertThrowsError(try result.get()) { error in
            XCTAssertEqual(APIError.from(error), .cancelled)
        }
        XCTAssertNil(model.transferProgress(sessionID: session.id, item: stem.id))
    }

    @MainActor
    func testSelectionExportCanBeCancelled() async throws {
        let harness = try AppHarness()
        defer { harness.tearDown() }
        harness.transfers.onDownload { _, destination, progress in
            progress?(0.1)
            try await Task.sleep(nanoseconds: 30_000_000_000)
            return destination
        }
        let model = harness.start()
        let session = try harness.importTrack()
        let stems = ["lead_vocals", "backing_vocals", "bass", "kick", "snare"].map { Fixtures.stem($0, group: .vocals, role: .primary) }

        let export = Task { try await model.losslessFiles(for: stems, sessionID: session.id) }
        try await waitUntil("the first downloads run") { model.transferProgress(sessionID: session.id, item: "lead_vocals") != nil }
        model.cancelSelectionExport(sessionID: session.id)
        let result = await export.result
        XCTAssertThrowsError(try result.get()) { error in
            XCTAssertEqual(APIError.from(error), .cancelled)
        }
        XCTAssertNil(model.selectionExportProgress[session.id])
        XCTAssertNil(model.transferProgress(sessionID: session.id, item: "kick"), "stems not started yet are not fetched")
    }

    // MARK: Import

    /// Copying (and, for iCloud Drive, downloading) the file runs off the main actor.
    @MainActor
    func testImportDoesNotBlockTheMainActor() async throws {
        let harness = try AppHarness()
        defer { harness.tearDown() }
        let model = harness.start()
        let source = try harness.sourceFile("Night Drive.wav")

        model.importAudio(from: source)
        XCTAssertTrue(harness.store.sessions.isEmpty, "the copy has not landed synchronously")
        XCTAssertTrue(model.isImporting)
        try await waitUntil("the options sheet opens") { model.optionsRequest != nil }
        XCTAssertEqual(harness.store.sessions.map(\.title), ["Night Drive"])
        XCTAssertEqual(model.optionsRequest?.id, harness.store.sessions.first?.id)
        XCTAssertFalse(model.isImporting)
    }

    @MainActor
    func testImportFailureShowsAnAlert() async throws {
        let harness = try AppHarness()
        defer { harness.tearDown() }
        let model = harness.start()
        model.importAudio(from: harness.root.appendingPathComponent("missing.wav"))
        try await waitUntil("the alert") { model.alert != nil }
        XCTAssertFalse(model.isImporting)
        XCTAssertTrue(harness.store.sessions.isEmpty)
        XCTAssertNil(model.optionsRequest)
    }
}
