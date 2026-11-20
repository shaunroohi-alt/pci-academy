import Foundation

/// Polls `GET /v1/jobs/{id}` every 1.5 s (SPEC section 1) for each in-flight session until the job
/// finishes.
///
/// Polling is paused while the app is in the background and resumed on foreground; tracked jobs
/// are remembered while paused. Network errors back off exponentially (up to 15 s) and are
/// reported so the UI can show "reconnecting" with a Retry button.
@MainActor
final class JobPoller {
    enum Event {
        /// A fresh copy of the job.
        case updated(Job)
        /// A request failed; polling continues with back-off.
        case connectionProblem(APIError)
        /// The server no longer knows the job (deleted or expired); polling stopped.
        case notFound
    }

    typealias Fetch = @Sendable (String) async throws -> Job

    /// Seconds between polls while healthy.
    let interval: Double
    /// Upper bound for the back-off after errors.
    let maxBackoff: Double
    /// Receives every event on the main actor.
    var onEvent: ((UUID, Event) -> Void)?

    private let fetch: Fetch
    private var tracked: [UUID: String] = [:]
    private var tasks: [UUID: Task<Void, Never>] = [:]
    private(set) var isPaused = false

    init(interval: Double = 1.5, maxBackoff: Double = 15, fetch: @escaping Fetch) {
        self.interval = interval
        self.maxBackoff = maxBackoff
        self.fetch = fetch
    }

    /// Sessions currently tracked (running or paused).
    var trackedSessions: Set<UUID> { Set(tracked.keys) }

    func isTracking(_ sessionID: UUID) -> Bool { tracked[sessionID] != nil }

    /// Starts (or restarts) polling `jobID` for `sessionID`.
    func track(sessionID: UUID, jobID: String) {
        tracked[sessionID] = jobID
        if !isPaused {
            startLoop(sessionID: sessionID, jobID: jobID)
        }
    }

    /// Stops polling a session and forgets it.
    func untrack(_ sessionID: UUID) {
        tracked[sessionID] = nil
        tasks[sessionID]?.cancel()
        tasks[sessionID] = nil
    }

    /// Restarts the loop immediately (the user tapped Retry).
    func pollNow(_ sessionID: UUID) {
        guard let jobID = tracked[sessionID], !isPaused else { return }
        startLoop(sessionID: sessionID, jobID: jobID)
    }

    /// Cancels all loops but remembers what was tracked (app went to the background).
    func pause() {
        isPaused = true
        for task in tasks.values { task.cancel() }
        tasks.removeAll()
    }

    /// Restarts loops for everything tracked (app came to the foreground).
    func resume() {
        isPaused = false
        for (sessionID, jobID) in tracked where tasks[sessionID] == nil {
            startLoop(sessionID: sessionID, jobID: jobID)
        }
    }

    /// Delay before the next poll after `failures` consecutive errors.
    nonisolated static func delay(afterFailures failures: Int, interval: Double, maxBackoff: Double) -> Double {
        guard failures > 0 else { return interval }
        let exponent = Double(min(failures, 8))
        return min(maxBackoff, interval * pow(2, exponent))
    }

    private func startLoop(sessionID: UUID, jobID: String) {
        tasks[sessionID]?.cancel()
        let fetch = self.fetch
        let interval = self.interval
        let maxBackoff = self.maxBackoff
        tasks[sessionID] = Task { [weak self] in
            var failures = 0
            while !Task.isCancelled {
                do {
                    let job = try await fetch(jobID)
                    if Task.isCancelled { return }
                    failures = 0
                    self?.onEvent?(sessionID, .updated(job))
                    if job.status.isFinished {
                        self?.finished(sessionID)
                        return
                    }
                } catch {
                    if Task.isCancelled { return }
                    let apiError = APIError.from(error)
                    switch apiError {
                    case .cancelled:
                        return
                    case .notFound:
                        self?.onEvent?(sessionID, .notFound)
                        self?.finished(sessionID)
                        return
                    default:
                        failures += 1
                        self?.onEvent?(sessionID, .connectionProblem(apiError))
                    }
                }
                let delay = JobPoller.delay(afterFailures: failures, interval: interval, maxBackoff: maxBackoff)
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
        }
    }

    private func finished(_ sessionID: UUID) {
        tracked[sessionID] = nil
        tasks[sessionID] = nil
    }
}
