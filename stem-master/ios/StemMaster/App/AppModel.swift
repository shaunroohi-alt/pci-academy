import Foundation
import Observation

/// Haptic/attention feedback the model asks the platform for.
enum FeedbackKind: Sendable {
    case success
    case warning
    case error
}

/// Platform services injected into `AppModel` (Keychain, background tasks, haptics), so the
/// model itself only depends on Foundation. `PlatformHooks.live()` provides the iOS versions.
struct PlatformHooks {
    var loadAPIKey: () -> String?
    var saveAPIKey: (String?) throws -> Void
    /// Starts a background-task assertion; returns a token for `endBackgroundActivity`.
    var beginBackgroundActivity: (String) -> Int
    var endBackgroundActivity: (Int) -> Void
    var feedback: (FeedbackKind) -> Void

    /// No-op hooks (tests, previews).
    static var inert: PlatformHooks {
        PlatformHooks(
            loadAPIKey: { nil },
            saveAPIKey: { _ in },
            beginBackgroundActivity: { _ in 0 },
            endBackgroundActivity: { _ in },
            feedback: { _ in }
        )
    }
}

/// What the options sheet is editing.
struct OptionsRequest: Identifiable, Equatable {
    /// The session id.
    let id: UUID
    var options: JobOptions
}

/// Result of Settings > Test Connection.
enum ConnectionTestState: Equatable {
    case idle
    case testing
    case success(Health)
    case failure(String)
}

/// App-wide state and the import -> upload -> poll -> preview workflow.
@Observable
@MainActor
final class AppModel {
    let settings: AppSettings
    let store: SessionStore

    // Navigation and presentation
    var path: [UUID] = []
    var optionsRequest: OptionsRequest?
    var isImporterPresented = false
    var isSettingsPresented = false
    var alert: AppAlert?

    // Live progress, keyed by session id
    private(set) var uploadProgress: [UUID: Double] = [:]
    private(set) var connectionIssues: [UUID: String] = [:]
    private(set) var previewProgress: [UUID: BatchProgress] = [:]
    private(set) var previewErrors: [UUID: String] = [:]
    /// Lossless/ZIP download progress keyed by `transferKey(...)`.
    private(set) var transferProgress: [String: Double] = [:]
    private(set) var selectionExportProgress: [UUID: BatchProgress] = [:]
    private(set) var connectionTest: ConnectionTestState = .idle
    private(set) var apiKey: String

    @ObservationIgnored let api: APIClient
    @ObservationIgnored let downloader: Downloader
    @ObservationIgnored let poller: JobPoller
    @ObservationIgnored private let hooks: PlatformHooks
    @ObservationIgnored private let clientID: String
    @ObservationIgnored private var uploadTasks: [UUID: Task<Void, Never>] = [:]
    @ObservationIgnored private var previewTasks: [UUID: Task<Void, Error>] = [:]
    @ObservationIgnored private var fileTasks: [String: Task<URL, Error>] = [:]

    init(
        settings: AppSettings? = nil,
        store: SessionStore? = nil,
        hooks: PlatformHooks = .inert,
        clientID: String = ClientIdentity.current()
    ) {
        let settings = settings ?? AppSettings()
        let store = store ?? SessionStore()
        self.settings = settings
        self.store = store
        self.hooks = hooks
        self.clientID = clientID
        let key = hooks.loadAPIKey() ?? ""
        self.apiKey = key
        let api = APIClient(configuration: APIClient.Configuration(
            baseURL: settings.serverURL,
            apiKey: key,
            clientID: clientID
        ))
        self.api = api
        self.downloader = Downloader(api: api)
        self.poller = JobPoller(fetch: { id in try await api.job(id: id) })
        poller.onEvent = { [weak self] sessionID, event in
            self?.handlePollEvent(sessionID: sessionID, event: event)
        }
        restoreInFlightSessions()
    }

    // MARK: - Settings

    /// Commits a server URL typed in Settings. Returns `false` (and keeps the old one) if invalid.
    @discardableResult
    func setServerURL(_ raw: String) -> Bool {
        guard let normalized = ServerURL.normalizedString(raw) else { return false }
        settings.serverURLString = normalized
        pushClientConfiguration()
        connectionTest = .idle
        return true
    }

    func resetServerURL() {
        settings.serverURLString = settings.bundledServerURL
        pushClientConfiguration()
        connectionTest = .idle
    }

    /// Saves the API key to the Keychain (empty removes it).
    func setAPIKey(_ raw: String) {
        let key = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard key != apiKey else { return }
        do {
            try hooks.saveAPIKey(key.isEmpty ? nil : key)
            apiKey = key
            pushClientConfiguration()
            connectionTest = .idle
        } catch {
            alert = AppAlert(title: "Couldn't save the API key", message: error.localizedDescription)
        }
    }

    private func pushClientConfiguration() {
        api.updateConfiguration(APIClient.Configuration(baseURL: settings.serverURL, apiKey: apiKey, clientID: clientID))
        // A new server or key may fix whatever was failing: poll right away.
        for sessionID in poller.trackedSessions {
            poller.pollNow(sessionID)
        }
    }

    /// `GET /v1/health`, shown in Settings.
    func testConnection() async {
        connectionTest = .testing
        do {
            let health = try await api.health()
            connectionTest = .success(health)
            hooks.feedback(.success)
        } catch {
            connectionTest = .failure(userFacingMessage(for: error))
            hooks.feedback(.error)
        }
    }

    // MARK: - Scene phase

    func appDidBecomeActive() {
        poller.resume()
    }

    func appDidEnterBackground() {
        poller.pause()
    }

    /// After a relaunch: resume polling jobs the server is still working on; an upload that was
    /// cut off by termination cannot continue, so it is marked failed with a retry.
    private func restoreInFlightSessions() {
        for session in store.sessions {
            switch session.state {
            case .uploading:
                store.update(session.id) { record in
                    record.state = .failed
                    record.errorMessage = "The upload was interrupted. Tap Try Again to send the track again."
                }
            case .queued, .processing:
                if let jobID = session.jobID {
                    poller.track(sessionID: session.id, jobID: jobID)
                } else {
                    store.update(session.id) { record in
                        record.state = .failed
                        record.errorMessage = "This separation lost track of its server job. Tap Try Again."
                    }
                }
            case .draft, .completed, .failed, .cancelled:
                break
            }
        }
    }

    // MARK: - Import

    /// Imports a picked or "Open in" file and shows the options sheet for it.
    func importAudio(from url: URL) {
        do {
            let record = try store.importAudio(from: url, options: settings.defaultOptions)
            optionsRequest = OptionsRequest(id: record.id, options: record.options)
        } catch {
            alert = AppAlert(title: "Couldn't import the track", message: userFacingMessage(for: error))
            hooks.feedback(.error)
        }
    }

    /// Opens the options sheet for an existing session (draft, failed or cancelled).
    func editOptions(for sessionID: UUID) {
        guard let session = store.session(id: sessionID) else { return }
        optionsRequest = OptionsRequest(id: sessionID, options: session.options)
    }

    /// The user tapped "Separate" in the options sheet.
    func confirmOptions(_ options: JobOptions, for sessionID: UUID) {
        optionsRequest = nil
        startProcessing(sessionID: sessionID, options: options)
        if path.last != sessionID {
            path = [sessionID]
        }
    }

    // MARK: - Processing

    /// Uploads the session's source and starts tracking the created job.
    func startProcessing(sessionID: UUID, options: JobOptions) {
        guard let session = store.session(id: sessionID) else { return }
        uploadTasks[sessionID]?.cancel()
        poller.untrack(sessionID)
        store.clearJob(for: sessionID)
        connectionIssues[sessionID] = nil
        previewErrors[sessionID] = nil
        store.update(sessionID) { record in
            record.options = options
            record.state = .uploading
            record.jobID = nil
            record.progress = 0
            record.stage = .queued
            record.stageLabel = "Uploading"
            record.queuePosition = nil
            record.errorMessage = nil
            record.stemCount = 0
            record.updatedAt = Date()
        }
        uploadProgress[sessionID] = 0

        let sourceURL = store.sourceURL(for: session)
        let filename = session.originalFilename
        let api = self.api
        let hooks = self.hooks
        // Keep uploading for a while if the user leaves the app mid-upload.
        let token = hooks.beginBackgroundActivity("Uploading \(session.title)")
        uploadTasks[sessionID] = Task {
            defer { hooks.endBackgroundActivity(token) }
            do {
                let job = try await api.createJob(sourceURL: sourceURL, filename: filename, options: options) { fraction in
                    Task { @MainActor [weak model = self] in
                        model?.setUploadProgress(fraction, for: sessionID)
                    }
                }
                self.uploadFinished(job, sessionID: sessionID)
            } catch {
                self.uploadFailed(error, sessionID: sessionID)
            }
        }
    }

    private func setUploadProgress(_ fraction: Double, for sessionID: UUID) {
        guard uploadTasks[sessionID] != nil, store.session(id: sessionID)?.state == .uploading else { return }
        uploadProgress[sessionID] = fraction
    }

    private func uploadFinished(_ job: Job, sessionID: UUID) {
        uploadTasks[sessionID] = nil
        uploadProgress[sessionID] = nil
        guard store.session(id: sessionID) != nil else {
            // Deleted while uploading: don't leave the job running on the server.
            let api = self.api
            Task {
                _ = try? await api.cancelJob(id: job.id)
                try? await api.deleteJob(id: job.id)
            }
            return
        }
        store.saveJob(job, for: sessionID)
        if job.status.isFinished {
            handleFinished(job, sessionID: sessionID)
        } else {
            poller.track(sessionID: sessionID, jobID: job.id)
        }
    }

    private func uploadFailed(_ error: Error, sessionID: UUID) {
        uploadTasks[sessionID] = nil
        uploadProgress[sessionID] = nil
        let apiError = APIError.from(error)
        if case .cancelled = apiError {
            store.update(sessionID) { record in
                record.state = .cancelled
                record.errorMessage = "The upload was cancelled."
            }
            return
        }
        store.update(sessionID) { record in
            record.state = .failed
            record.errorMessage = apiError.errorDescription
        }
        hooks.feedback(.error)
    }

    /// Runs the session again with its last options.
    func retry(sessionID: UUID) {
        guard let session = store.session(id: sessionID) else { return }
        startProcessing(sessionID: sessionID, options: session.options)
    }

    /// Restarts polling right away (connection banner "Retry").
    func pollNow(sessionID: UUID) {
        connectionIssues[sessionID] = nil
        poller.pollNow(sessionID)
    }

    /// Cancels the upload, or asks the server to cancel the job.
    func cancelProcessing(sessionID: UUID) {
        guard let session = store.session(id: sessionID) else { return }
        if session.state == .uploading {
            uploadTasks[sessionID]?.cancel()
            return
        }
        guard let jobID = session.jobID, session.state.isTrackedOnServer else { return }
        let api = self.api
        Task { [weak self] in
            do {
                let job = try await api.cancelJob(id: jobID)
                self?.handlePollEvent(sessionID: sessionID, event: .updated(job))
            } catch {
                self?.alert = AppAlert(title: "Couldn't cancel", message: userFacingMessage(for: error))
            }
        }
    }

    private func handlePollEvent(sessionID: UUID, event: JobPoller.Event) {
        guard let previous = store.session(id: sessionID) else {
            poller.untrack(sessionID)
            return
        }
        switch event {
        case let .updated(job):
            connectionIssues[sessionID] = nil
            store.saveJob(job, for: sessionID)
            if job.status.isFinished, !previous.state.isFinishedLocally {
                handleFinished(job, sessionID: sessionID)
            }
        case let .connectionProblem(error):
            connectionIssues[sessionID] = error.errorDescription ?? "Can't reach the server."
        case .notFound:
            connectionIssues[sessionID] = nil
            store.update(sessionID) { record in
                record.state = .failed
                record.errorMessage = "The server no longer has this job (finished jobs are kept for 24 hours). Tap Try Again to run it again."
            }
        }
    }

    private func handleFinished(_ job: Job, sessionID: UUID) {
        poller.untrack(sessionID)
        switch job.status {
        case .completed:
            hooks.feedback(.success)
            // Fetch the previews right away so the mixer opens instantly.
            Task { [weak self] in
                try? await self?.ensurePreviews(for: sessionID)
            }
        case .failed:
            hooks.feedback(.error)
        case .cancelled, .queued, .processing, .unknown:
            break
        }
    }

    // MARK: - Delete

    /// Deletes the local session and, best effort, the server job.
    func delete(sessionID: UUID) {
        let session = store.session(id: sessionID)
        uploadTasks[sessionID]?.cancel()
        uploadTasks[sessionID] = nil
        previewTasks[sessionID]?.cancel()
        previewTasks[sessionID] = nil
        for (key, task) in fileTasks where key.hasPrefix(sessionID.uuidString) {
            task.cancel()
        }
        poller.untrack(sessionID)
        uploadProgress[sessionID] = nil
        connectionIssues[sessionID] = nil
        previewProgress[sessionID] = nil
        previewErrors[sessionID] = nil
        path.removeAll { $0 == sessionID }
        if optionsRequest?.id == sessionID { optionsRequest = nil }
        store.delete(sessionID)
        if let jobID = session?.jobID {
            let api = self.api
            let stillRunning = session?.state.isTrackedOnServer ?? false
            Task {
                if stillRunning {
                    _ = try? await api.cancelJob(id: jobID)
                }
                try? await api.deleteJob(id: jobID)
            }
        }
    }

    // MARK: - Downloads

    /// Downloads the AAC previews of every playable stem (4 at a time). Concurrent callers share
    /// one download.
    func ensurePreviews(for sessionID: UUID) async throws {
        if let running = previewTasks[sessionID] {
            try await running.value
            return
        }
        guard let session = store.session(id: sessionID), let job = store.job(for: sessionID) else {
            throw APIError.file("This session has no stems yet.")
        }
        let items = job.playableStems.map { stem in
            Downloader.Item(
                stemID: stem.id,
                path: stem.previewURL,
                destination: store.previewURL(for: stem, sessionID: session.id),
                expectedBytes: stem.previewBytes
            )
        }
        let missing = items.filter { !store.hasFile(at: $0.destination, expectedBytes: $0.expectedBytes) }
        if missing.isEmpty { return }

        previewErrors[sessionID] = nil
        previewProgress[sessionID] = BatchProgress(done: items.count - missing.count, total: items.count)
        let downloader = self.downloader
        let task = Task<Void, Error> {
            try await downloader.downloadAll(missing, maxConcurrent: 4) { _ in
                Task { @MainActor [weak model = self] in
                    model?.previewProgress[sessionID]?.done += 1
                }
            }
        }
        previewTasks[sessionID] = task
        do {
            try await task.value
            previewTasks[sessionID] = nil
            previewProgress[sessionID] = nil
        } catch {
            previewTasks[sessionID] = nil
            previewProgress[sessionID] = nil
            let message = userFacingMessage(for: error)
            if !(error is CancellationError), APIError.from(error) != .cancelled {
                previewErrors[sessionID] = message
            }
            throw error
        }
    }

    /// Key for `transferProgress`.
    nonisolated static func transferKey(sessionID: UUID, item: String) -> String {
        "\(sessionID.uuidString)/\(item)"
    }

    func transferProgress(sessionID: UUID, item: String) -> Double? {
        transferProgress[Self.transferKey(sessionID: sessionID, item: item)]
    }

    /// Downloads (once) and returns the lossless WAV of a stem.
    func losslessFile(for stem: Stem, sessionID: UUID) async throws -> URL {
        guard let session = store.session(id: sessionID) else { throw APIError.file("This session was deleted.") }
        return try await fetchFile(
            key: Self.transferKey(sessionID: sessionID, item: stem.id),
            path: stem.wavURL,
            destination: store.wavURL(for: stem, session: session),
            expectedBytes: stem.wavBytes
        )
    }

    /// Downloads (once) and returns the ZIP with every stem, `manifest.json` and `README.txt`.
    func zipFile(sessionID: UUID) async throws -> URL {
        guard let session = store.session(id: sessionID), let job = store.job(for: sessionID) else {
            throw APIError.file("This session has no stems yet.")
        }
        let path = job.zipURL ?? "/v1/jobs/\(job.id)/download.zip"
        return try await fetchFile(
            key: Self.transferKey(sessionID: sessionID, item: "zip"),
            path: path,
            destination: store.zipURL(for: session),
            expectedBytes: 0
        )
    }

    /// Downloads the WAVs of `stems` (3 at a time) for "Export Mixer Selection".
    func losslessFiles(for stems: [Stem], sessionID: UUID) async throws -> [URL] {
        guard !stems.isEmpty else { return [] }
        selectionExportProgress[sessionID] = BatchProgress(done: 0, total: stems.count)
        defer { selectionExportProgress[sessionID] = nil }
        var urls: [String: URL] = [:]
        var next = 0
        try await withThrowingTaskGroup(of: (String, URL).self) { group in
            while next < min(3, stems.count) {
                let stem = stems[next]
                next += 1
                group.addTask { @MainActor in (stem.id, try await self.losslessFile(for: stem, sessionID: sessionID)) }
            }
            while let (stemID, url) = try await group.next() {
                urls[stemID] = url
                selectionExportProgress[sessionID]?.done += 1
                if next < stems.count {
                    let stem = stems[next]
                    next += 1
                    group.addTask { @MainActor in (stem.id, try await self.losslessFile(for: stem, sessionID: sessionID)) }
                }
            }
        }
        return stems.compactMap { urls[$0.id] }
    }

    private func fetchFile(key: String, path: String, destination: URL, expectedBytes: Int64) async throws -> URL {
        if store.hasFile(at: destination, expectedBytes: expectedBytes) { return destination }
        if let running = fileTasks[key] { return try await running.value }
        transferProgress[key] = 0
        let downloader = self.downloader
        let task = Task<URL, Error> {
            try await downloader.download(path, to: destination, expectedBytes: expectedBytes) { fraction in
                Task { @MainActor [weak model = self] in
                    guard let model, model.fileTasks[key] != nil else { return }
                    model.transferProgress[key] = fraction
                }
            }
        }
        fileTasks[key] = task
        defer {
            fileTasks[key] = nil
            transferProgress[key] = nil
        }
        return try await task.value
    }

    // MARK: - Storage

    func clearDownloadedAudio() {
        for task in previewTasks.values { task.cancel() }
        for task in fileTasks.values { task.cancel() }
        store.clearDownloadedAudio()
    }
}

private extension SessionState {
    /// Already finished from the app's point of view (no second completion feedback).
    var isFinishedLocally: Bool {
        self == .completed || self == .failed || self == .cancelled
    }
}
