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
    /// Uploads the user cancelled after the whole file was sent: the app waits for the job id,
    /// then cancels and deletes that job on the server.
    private(set) var cancellingUploads: Set<UUID> = []
    /// Imports whose file is still being copied (or downloaded from iCloud Drive).
    private(set) var importsInProgress = 0
    private(set) var connectionIssues: [UUID: String] = [:]
    private(set) var previewProgress: [UUID: BatchProgress] = [:]
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
    /// Id of the current upload attempt per session; completions of superseded attempts are ignored.
    @ObservationIgnored private var uploadAttempts: [UUID: UUID] = [:]
    @ObservationIgnored private var previewTasks: [UUID: Task<Void, Error>] = [:]
    @ObservationIgnored private var fileTasks: [String: Task<URL, Error>] = [:]
    /// Sessions whose upload was cut off by termination, until their job is found or retried.
    @ObservationIgnored private var interruptedUploads: Set<UUID> = []
    /// "Export Mixer Selection" runs the user cancelled.
    @ObservationIgnored private var cancelledSelections: Set<UUID> = []

    init(
        settings: AppSettings? = nil,
        store: SessionStore? = nil,
        hooks: PlatformHooks = .inert,
        clientID: String = ClientIdentity.current(),
        api injected: APIClient? = nil
    ) {
        let settings = settings ?? AppSettings()
        let store = store ?? SessionStore()
        self.settings = settings
        self.store = store
        self.hooks = hooks
        self.clientID = clientID
        let key = hooks.loadAPIKey() ?? ""
        self.apiKey = key
        let configuration = APIClient.Configuration(baseURL: settings.serverURL, apiKey: key, clientID: clientID)
        let api = injected ?? APIClient(configuration: configuration)
        api.updateConfiguration(configuration)
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
            if health.authRequired {
                // /v1/health answers without a key: check the key on a route that needs one.
                _ = try await api.capabilities()
            }
            connectionTest = .success(health)
            hooks.feedback(.success)
        } catch {
            if case .notFound = APIError.from(error) {
                connectionTest = .failure("No Stem Master server answered at this address (HTTP 404). Enter the server's base address, without /v1.")
            } else {
                connectionTest = .failure(userFacingMessage(for: error))
            }
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
    /// cut off by termination cannot continue, so it is marked failed with a retry, unless the
    /// server got the whole file and created the job (`recoverInterruptedUploads`).
    private func restoreInFlightSessions() {
        APIClient.removeStaleUploadBodies()
        for session in store.sessions {
            switch session.state {
            case .uploading:
                store.update(session.id) { record in
                    record.state = .failed
                    record.errorMessage = "The upload was interrupted. Tap Try Again to send the track again."
                }
                interruptedUploads.insert(session.id)
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
        if !interruptedUploads.isEmpty {
            Task { [weak self] in
                await self?.recoverInterruptedUploads()
            }
        }
    }

    /// Looks for the jobs of interrupted uploads in this client's job list (`GET /v1/jobs`)
    /// and picks up each one that matches its session unambiguously.
    private func recoverInterruptedUploads() async {
        guard let jobs = try? await api.listJobs() else { return }
        let interrupted = interruptedUploads
            .compactMap { store.session(id: $0) }
            .filter { $0.state == .failed && $0.jobID == nil }
        let claimed = Set(store.sessions.compactMap(\.jobID))
        for (sessionID, job) in UploadRecovery.matches(interrupted: interrupted, jobs: jobs, claimed: claimed) {
            interruptedUploads.remove(sessionID)
            store.saveJob(job, for: sessionID)
            if job.status.isFinished {
                handleFinished(job, sessionID: sessionID)
            } else {
                poller.track(sessionID: sessionID, jobID: job.id)
            }
        }
    }

    // MARK: - Import

    var isImporting: Bool { importsInProgress > 0 }

    /// Imports a picked or "Open in" file and shows the options sheet for it. The copy runs off
    /// the main actor: an iCloud Drive file may have to download first, and a 200 MB copy takes
    /// a moment.
    func importAudio(from url: URL) {
        importsInProgress += 1
        let rootURL = store.rootURL
        let options = settings.defaultOptions
        Task {
            defer { importsInProgress -= 1 }
            do {
                let source = try await Task.detached(priority: .userInitiated) {
                    try SessionStore.copySource(from: url, rootURL: rootURL)
                }.value
                let record = store.addImported(source, options: options)
                optionsRequest = OptionsRequest(id: record.id, options: record.options)
            } catch {
                alert = AppAlert(title: "Couldn't import the track", message: userFacingMessage(for: error))
                hooks.feedback(.error)
            }
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
        cancellingUploads.remove(sessionID)
        interruptedUploads.remove(sessionID)
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
            record.updatedAt = Date().wholeSeconds
        }
        uploadProgress[sessionID] = 0

        let attempt = UUID()
        uploadAttempts[sessionID] = attempt
        let sourceURL = store.sourceURL(for: session)
        let filename = session.originalFilename
        let sourceBytes = session.sourceBytes
        let api = self.api
        let hooks = self.hooks
        // Keep uploading for a while if the user leaves the app mid-upload.
        let token = hooks.beginBackgroundActivity("Uploading \(session.title)")
        uploadTasks[sessionID] = Task {
            defer { hooks.endBackgroundActivity(token) }
            do {
                try await Self.checkUploadAllowed(api: api, sourceBytes: sourceBytes)
                let job = try await api.createJob(sourceURL: sourceURL, filename: filename, options: options) { fraction in
                    Task { @MainActor [weak model = self] in
                        model?.setUploadProgress(fraction, for: sessionID, attempt: attempt)
                    }
                }
                self.uploadFinished(job, sessionID: sessionID, attempt: attempt, taskCancelled: Task.isCancelled)
            } catch {
                self.uploadFailed(error, sessionID: sessionID, attempt: attempt)
            }
        }
    }

    /// `GET /v1/capabilities` before sending the file: a rejected API key or a file over the
    /// server's limit fails at once instead of after a long upload.
    private nonisolated static func checkUploadAllowed(api: APIClient, sourceBytes: Int64) async throws {
        let capabilities = try await api.capabilities()
        let limit = Int64(capabilities.maxUploadMB) * 1024 * 1024
        guard sourceBytes <= limit else {
            throw APIError.payloadTooLarge("This file is \(NumberFormatting.bytes(sourceBytes)); the server accepts files up to \(NumberFormatting.bytes(limit)).")
        }
    }

    private func setUploadProgress(_ fraction: Double, for sessionID: UUID, attempt: UUID) {
        guard uploadAttempts[sessionID] == attempt else { return }
        uploadProgress[sessionID] = fraction
    }

    private func uploadFinished(_ job: Job, sessionID: UUID, attempt: UUID, taskCancelled: Bool) {
        guard uploadAttempts[sessionID] == attempt, store.session(id: sessionID) != nil else {
            // Deleted or restarted while uploading: don't leave this job running on the server.
            discardServerJob(job.id)
            return
        }
        uploadAttempts[sessionID] = nil
        uploadTasks[sessionID] = nil
        uploadProgress[sessionID] = nil
        if cancellingUploads.remove(sessionID) != nil || taskCancelled {
            // Cancelled, but the server had already created the job.
            discardServerJob(job.id)
            store.update(sessionID) { record in
                record.state = .cancelled
                record.errorMessage = "The upload was cancelled."
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

    private func uploadFailed(_ error: Error, sessionID: UUID, attempt: UUID) {
        // A superseded attempt (restarted upload) must not touch the new one's state.
        guard uploadAttempts[sessionID] == attempt else { return }
        uploadAttempts[sessionID] = nil
        uploadTasks[sessionID] = nil
        uploadProgress[sessionID] = nil
        let cancelRequested = cancellingUploads.remove(sessionID) != nil
        let apiError = APIError.from(error)
        if cancelRequested || apiError == .cancelled {
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

    func isCancellingUpload(_ sessionID: UUID) -> Bool {
        cancellingUploads.contains(sessionID)
    }

    /// Cancels the upload, or asks the server to cancel the job.
    func cancelProcessing(sessionID: UUID) {
        guard let session = store.session(id: sessionID) else { return }
        if session.state == .uploading {
            if (uploadProgress[sessionID] ?? 0) >= 1 {
                // The server has the whole file and is creating the job. Cancelling the request
                // now could leave that job running out of reach: wait for its id, then cancel it.
                cancellingUploads.insert(sessionID)
            } else {
                uploadTasks[sessionID]?.cancel()
            }
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

    /// Cancels and deletes a server job nobody will use (best effort).
    private func discardServerJob(_ jobID: String) {
        let api = self.api
        Task {
            _ = try? await api.cancelJob(id: jobID)
            try? await api.deleteJob(id: jobID)
        }
    }

    // MARK: - Delete

    /// Deletes the local session and, best effort, the server job.
    func delete(sessionID: UUID) {
        let session = store.session(id: sessionID)
        uploadTasks[sessionID]?.cancel()
        uploadTasks[sessionID] = nil
        uploadAttempts[sessionID] = nil
        cancellingUploads.remove(sessionID)
        interruptedUploads.remove(sessionID)
        previewTasks[sessionID]?.cancel()
        previewTasks[sessionID] = nil
        for (key, task) in fileTasks where key.hasPrefix(sessionID.uuidString) {
            task.cancel()
        }
        poller.untrack(sessionID)
        uploadProgress[sessionID] = nil
        connectionIssues[sessionID] = nil
        previewProgress[sessionID] = nil
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
        defer {
            previewTasks[sessionID] = nil
            previewProgress[sessionID] = nil
        }
        try await task.value
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

    /// Stops a lossless WAV or ZIP download (`item` is a stem id or `"zip"`).
    func cancelTransfer(sessionID: UUID, item: String) {
        fileTasks[Self.transferKey(sessionID: sessionID, item: item)]?.cancel()
    }

    /// Stops a running "Export Mixer Selection" and its WAV downloads.
    func cancelSelectionExport(sessionID: UUID) {
        guard selectionExportProgress[sessionID] != nil else { return }
        cancelledSelections.insert(sessionID)
        let zip = Self.transferKey(sessionID: sessionID, item: "zip")
        for (key, task) in fileTasks where key.hasPrefix(sessionID.uuidString) && key != zip {
            task.cancel()
        }
    }

    /// Downloads the WAVs of `stems` (3 at a time) for "Export Mixer Selection".
    func losslessFiles(for stems: [Stem], sessionID: UUID) async throws -> [URL] {
        guard !stems.isEmpty else { return [] }
        cancelledSelections.remove(sessionID)
        selectionExportProgress[sessionID] = BatchProgress(done: 0, total: stems.count)
        defer {
            selectionExportProgress[sessionID] = nil
            cancelledSelections.remove(sessionID)
        }
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
                if next < stems.count, !cancelledSelections.contains(sessionID) {
                    let stem = stems[next]
                    next += 1
                    group.addTask { @MainActor in (stem.id, try await self.losslessFile(for: stem, sessionID: sessionID)) }
                }
            }
        }
        if cancelledSelections.contains(sessionID) { throw APIError.cancelled }
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
