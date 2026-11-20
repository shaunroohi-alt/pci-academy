import Foundation
import XCTest
@testable import StemMaster

/// Library persistence: import copies, job.json, the index, deletion and storage accounting.
/// `SessionStore` is main-actor isolated, so each test runs on the main actor.
final class SessionStoreTests: XCTestCase {
    private var root: URL!
    private var inbox: URL!

    override func setUpWithError() throws {
        root = try Fixtures.temporaryDirectory()
        inbox = try Fixtures.temporaryDirectory("inbox")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
        try? FileManager.default.removeItem(at: inbox)
    }

    private func sourceFile(_ name: String = "My Song.mp3", size: Int = 4096) throws -> URL {
        let url = inbox.appendingPathComponent(name)
        try Data(repeating: 0x5A, count: size).write(to: url)
        return url
    }

    private func completedJob() throws -> Job {
        let stems = [
            Fixtures.stemJSON(id: "vocals", name: "Vocals", group: "vocals", role: "bus"),
            Fixtures.stemJSON(id: "lead_vocals", name: "Lead Vocals", group: "vocals", role: "primary"),
            Fixtures.stemJSON(id: "backing_vocals", name: "Backing Vocals", group: "vocals", role: "primary"),
            Fixtures.stemJSON(id: "drums", name: "Drums", group: "drums", role: "primary", color: "#3AD6C5"),
            Fixtures.stemJSON(id: "bass", name: "Bass", group: "bass", role: "primary", color: "#7C5CFF"),
            Fixtures.stemJSON(id: "removed_bleed", name: "Removed Bleed", group: "removed", role: "removed", color: "#5A5F6B"),
        ].joined(separator: ", ")
        return try Fixtures.decode(Job.self, from: """
        {"id": "\(Fixtures.jobID)", "status": "completed",
         "created_at": "2026-11-20T10:00:00Z", "updated_at": "2026-11-20T10:04:00Z",
         "filename": "My Song.mp3", "options": \(Fixtures.optionsJSON),
         "progress": 1.0, "stage": "done", "stage_label": "Done", "queue_position": null, "error": null,
         "analysis": \(Fixtures.analysisJSON), "stems": [\(stems)],
         "zip_url": "/v1/jobs/\(Fixtures.jobID)/download.zip", "gain_offset_db": -1.5}
        """)
    }

    @MainActor
    func testImportCopiesIntoSessionFolder() async throws {
        let store = SessionStore(rootURL: root)
        XCTAssertTrue(store.sessions.isEmpty)
        let source = try sourceFile("My: Song.mp3")
        let record = try store.importAudio(from: source, options: JobOptions(quality: .fast))

        XCTAssertEqual(record.title, "My: Song")
        XCTAssertEqual(record.originalFilename, "My: Song.mp3")
        XCTAssertEqual(record.sourceFileName, "My_ Song.mp3")
        XCTAssertEqual(record.sourceBytes, 4096)
        XCTAssertEqual(record.state, .draft)
        XCTAssertEqual(record.options.quality, .fast)
        XCTAssertEqual(store.sessions.map(\.id), [record.id])

        let copy = store.sourceURL(for: record)
        XCTAssertEqual(copy.path, root.appendingPathComponent("Sessions/\(record.id.uuidString)/source/My_ Song.mp3").path)
        XCTAssertEqual(try Data(contentsOf: copy), try Data(contentsOf: source))
        XCTAssertTrue(FileManager.default.fileExists(atPath: source.path), "files outside the Inbox are left alone")
        XCTAssertTrue(FileManager.default.fileExists(atPath: store.indexURL.path))
    }

    @MainActor
    func testImportRejectsEmptyAndMissingFiles() async throws {
        let store = SessionStore(rootURL: root)
        let empty = try sourceFile("empty.wav", size: 0)
        XCTAssertThrowsError(try store.importAudio(from: empty, options: JobOptions()))
        XCTAssertThrowsError(try store.importAudio(from: inbox.appendingPathComponent("missing.wav"), options: JobOptions()))
        XCTAssertTrue(store.sessions.isEmpty)
        let leftovers = (try? FileManager.default.contentsOfDirectory(atPath: store.sessionsFolderURL.path)) ?? []
        XCTAssertTrue(leftovers.isEmpty, "failed imports leave no folders behind")
    }

    @MainActor
    func testImportRemovesInboxCopies() async throws {
        let store = SessionStore(rootURL: root)
        let inboxFolder = root.appendingPathComponent("Inbox", isDirectory: true)
        try FileManager.default.createDirectory(at: inboxFolder, withIntermediateDirectories: true)
        let handedOver = inboxFolder.appendingPathComponent("Shared.wav")
        try Data(repeating: 1, count: 64).write(to: handedOver)
        _ = try store.importAudio(from: handedOver, options: JobOptions())
        XCTAssertFalse(FileManager.default.fileExists(atPath: handedOver.path))
    }

    @MainActor
    func testSaveJobUpdatesSummaryAndPersists() async throws {
        let store = SessionStore(rootURL: root)
        let record = try store.importAudio(from: try sourceFile(), options: JobOptions())
        let job = try completedJob()
        store.saveJob(job, for: record.id)

        let updated = try XCTUnwrap(store.session(id: record.id))
        XCTAssertEqual(updated.state, .completed)
        XCTAssertEqual(updated.jobID, Fixtures.jobID)
        XCTAssertEqual(updated.progress, 1)
        XCTAssertEqual(updated.stemCount, 4, "primary stems only")
        XCTAssertEqual(updated.durationSeconds ?? 0, 213.41, accuracy: 1e-9)
        XCTAssertTrue(FileManager.default.fileExists(atPath: store.jobFileURL(for: record.id).path))

        // A fresh store reads the same library back from disk.
        let reloaded = SessionStore(rootURL: root)
        XCTAssertEqual(reloaded.sessions, store.sessions)
        XCTAssertEqual(reloaded.job(for: record.id), job)
        XCTAssertEqual(reloaded.job(for: record.id)?.gainOffsetDB, -1.5)
    }

    @MainActor
    func testFilePathsAndStorage() async throws {
        let store = SessionStore(rootURL: root)
        let record = try store.importAudio(from: try sourceFile(), options: JobOptions())
        let job = try completedJob()
        store.saveJob(job, for: record.id)
        let session = try XCTUnwrap(store.session(id: record.id))
        let lead = try XCTUnwrap(job.stems.first { $0.id == "lead_vocals" })

        XCTAssertEqual(store.previewURL(for: lead, sessionID: record.id).lastPathComponent, "lead_vocals.m4a")
        XCTAssertEqual(store.wavURL(for: lead, session: session).lastPathComponent, "My Song - Lead Vocals.wav")
        XCTAssertEqual(store.zipURL(for: session).lastPathComponent, "My Song - Stem Master.zip")

        let preview = store.previewURL(for: lead, sessionID: record.id)
        try FileManager.default.createDirectory(at: preview.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(repeating: 7, count: 1000).write(to: preview)
        let wav = store.wavURL(for: lead, session: session)
        try FileManager.default.createDirectory(at: wav.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(repeating: 7, count: 3000).write(to: wav)
        try Data(repeating: 7, count: 500).write(to: store.zipURL(for: session))

        XCTAssertTrue(store.hasFile(at: preview))
        XCTAssertTrue(store.hasFile(at: preview, expectedBytes: 1000))
        XCTAssertFalse(store.hasFile(at: preview, expectedBytes: 999), "a partial file is not complete")
        XCTAssertEqual(store.downloadedAudioBytes(), 4500)
        XCTAssertGreaterThanOrEqual(store.storageUsedBytes(), 4500 + 4096)

        store.clearDownloadedAudio()
        XCTAssertEqual(store.downloadedAudioBytes(), 0)
        XCTAssertTrue(FileManager.default.fileExists(atPath: store.sourceURL(for: session).path), "sources stay")
        XCTAssertNotNil(store.job(for: record.id), "jobs stay")
    }

    @MainActor
    func testDeleteRemovesEverything() async throws {
        let store = SessionStore(rootURL: root)
        let first = try store.importAudio(from: try sourceFile("a.wav"), options: JobOptions())
        let second = try store.importAudio(from: try sourceFile("b.wav"), options: JobOptions())
        XCTAssertEqual(store.sessions.map(\.id), [second.id, first.id], "newest first")

        store.delete(first.id)
        XCTAssertEqual(store.sessions.map(\.id), [second.id])
        XCTAssertFalse(FileManager.default.fileExists(atPath: store.folderURL(for: first.id).path))
        XCTAssertEqual(SessionStore(rootURL: root).sessions.map(\.id), [second.id])
    }

    /// A download that lands just after its session was deleted must not recreate the deleted
    /// session folder (it would never be cleaned up).
    func testFinishedDownloadDoesNotRecreateADeletedSessionFolder() throws {
        let download = root.appendingPathComponent("download.tmp")
        try Data(repeating: 3, count: 32).write(to: download)
        let deletedSession = root.appendingPathComponent("Sessions/\(UUID().uuidString)", isDirectory: true)
        XCTAssertThrowsError(try TransferSession.moveReplacing(download, to: deletedSession.appendingPathComponent("previews/vocals.m4a")))
        XCTAssertFalse(FileManager.default.fileExists(atPath: deletedSession.path))

        let liveSession = root.appendingPathComponent("Sessions/live", isDirectory: true)
        try FileManager.default.createDirectory(at: liveSession, withIntermediateDirectories: true)
        let preview = liveSession.appendingPathComponent("previews/vocals.m4a")
        try TransferSession.moveReplacing(download, to: preview)
        XCTAssertEqual(try Data(contentsOf: preview).count, 32, "the first download creates previews/")
        let again = root.appendingPathComponent("again.tmp")
        try Data(repeating: 4, count: 16).write(to: again)
        try TransferSession.moveReplacing(again, to: preview)
        XCTAssertEqual(try Data(contentsOf: preview).count, 16, "an existing copy is replaced")
    }

    /// Lossless downloads of a long track can be several GB.
    func testTransferTimeoutsSuitLargeFilesOnSlowNetworks() {
        let configuration = TransferSession.defaultConfiguration()
        XCTAssertGreaterThanOrEqual(configuration.timeoutIntervalForResource, 6 * 60 * 60)
        XCTAssertLessThanOrEqual(configuration.timeoutIntervalForRequest, 300, "a stalled transfer still fails")
    }

    @MainActor
    func testCorruptIndexIsSetAside() async throws {
        try Data("not json".utf8).write(to: root.appendingPathComponent("sessions.json"))
        let store = SessionStore(rootURL: root)
        XCTAssertTrue(store.sessions.isEmpty)
        XCTAssertNotNil(store.lastError)
        let files = try FileManager.default.contentsOfDirectory(atPath: root.path)
        XCTAssertTrue(files.contains { $0.hasPrefix("sessions.corrupt-") })
    }

    @MainActor
    func testUpdateOnlyPersistsChanges() async throws {
        let store = SessionStore(rootURL: root)
        let record = try store.importAudio(from: try sourceFile(), options: JobOptions())
        store.update(record.id) { $0.state = .uploading }
        XCTAssertEqual(SessionStore(rootURL: root).session(id: record.id)?.state, .uploading)
    }
}
