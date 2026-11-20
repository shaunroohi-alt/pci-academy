import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Fraction 0...1 of a transfer. Called on a background queue, throttled to ~0.5 % steps.
typealias TransferProgressHandler = @Sendable (Double) -> Void

/// A delegate-based `URLSession` that offers async uploads/downloads with byte-level progress.
///
/// The classic delegate API is used (rather than the per-task delegates of the async
/// convenience methods) because it reports upload and download progress reliably on every
/// iOS version. Each call registers a continuation keyed by task identifier; Swift task
/// cancellation cancels the underlying `URLSessionTask`.
final class TransferSession: NSObject, @unchecked Sendable {
    private final class UploadState {
        let continuation: CheckedContinuation<(Data, HTTPURLResponse), Error>
        let progress: TransferProgressHandler?
        var data = Data()
        var lastReported: Double = -1

        init(continuation: CheckedContinuation<(Data, HTTPURLResponse), Error>, progress: TransferProgressHandler?) {
            self.continuation = continuation
            self.progress = progress
        }
    }

    private final class DownloadState {
        let continuation: CheckedContinuation<URL, Error>
        let destination: URL
        let progress: TransferProgressHandler?
        var lastReported: Double = -1
        var failure: Error?
        var moved = false

        init(continuation: CheckedContinuation<URL, Error>, destination: URL, progress: TransferProgressHandler?) {
            self.continuation = continuation
            self.destination = destination
            self.progress = progress
        }
    }

    /// Cancels a task that may not have been created yet when Swift cancellation arrives.
    private final class TaskHandle: @unchecked Sendable {
        private let lock = NSLock()
        private var task: URLSessionTask?
        private var isCancelled = false

        func attach(_ task: URLSessionTask) {
            lock.lock()
            self.task = task
            let cancelled = isCancelled
            lock.unlock()
            if cancelled { task.cancel() }
        }

        func cancel() {
            lock.lock()
            isCancelled = true
            let task = self.task
            lock.unlock()
            task?.cancel()
        }
    }

    private let lock = NSLock()
    private var uploads: [Int: UploadState] = [:]
    private var downloads: [Int: DownloadState] = [:]
    private var session: URLSession!

    init(configuration: URLSessionConfiguration = TransferSession.defaultConfiguration()) {
        super.init()
        let queue = OperationQueue()
        queue.name = "com.mpaudio.stemmaster.transfers"
        queue.maxConcurrentOperationCount = 1
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
    }

    static func defaultConfiguration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 120
        configuration.timeoutIntervalForResource = 2 * 60 * 60
        configuration.httpMaximumConnectionsPerHost = 6
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        return configuration
    }

    private func withLock<T>(_ body: () throws -> T) rethrows -> T {
        lock.lock()
        defer { lock.unlock() }
        return try body()
    }

    /// Only report meaningful steps so the UI isn't flooded.
    private static func shouldReport(_ fraction: Double, last: Double) -> Bool {
        fraction >= 1 || fraction - last >= 0.005
    }

    /// Uploads `fileURL` as the request body. Returns the response body and HTTP response for any
    /// status code; the caller decides what a non-2xx status means.
    func upload(_ request: URLRequest, fromFile fileURL: URL, progress: TransferProgressHandler?) async throws -> (Data, HTTPURLResponse) {
        let handle = TaskHandle()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<(Data, HTTPURLResponse), Error>) in
                let task = self.session.uploadTask(with: request, fromFile: fileURL)
                let state = UploadState(continuation: continuation, progress: progress)
                self.withLock { self.uploads[task.taskIdentifier] = state }
                handle.attach(task)
                task.resume()
            }
        } onCancel: {
            handle.cancel()
        }
    }

    /// Downloads to `destination` (replacing an existing file atomically). A non-2xx status
    /// throws the matching `APIError`, with the server's `detail`.
    func download(_ request: URLRequest, to destination: URL, progress: TransferProgressHandler?) async throws -> URL {
        let handle = TaskHandle()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
                let task = self.session.downloadTask(with: request)
                let state = DownloadState(continuation: continuation, destination: destination, progress: progress)
                self.withLock { self.downloads[task.taskIdentifier] = state }
                handle.attach(task)
                task.resume()
            }
        } onCancel: {
            handle.cancel()
        }
    }

    /// Moves a finished download into place, creating folders and replacing an older copy.
    static func moveReplacing(_ source: URL, to destination: URL) throws {
        let manager = FileManager.default
        try manager.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        let staging = destination.deletingLastPathComponent()
            .appendingPathComponent(".\(UUID().uuidString).part")
        try manager.moveItem(at: source, to: staging)
        if manager.fileExists(atPath: destination.path) {
            try manager.removeItem(at: destination)
        }
        try manager.moveItem(at: staging, to: destination)
    }
}

extension TransferSession: URLSessionDataDelegate, URLSessionDownloadDelegate {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        guard totalBytesExpectedToSend > 0 else { return }
        let fraction = min(1, Double(totalBytesSent) / Double(totalBytesExpectedToSend))
        let handler: TransferProgressHandler? = withLock {
            guard let state = uploads[task.taskIdentifier],
                  Self.shouldReport(fraction, last: state.lastReported) else { return nil }
            state.lastReported = fraction
            return state.progress
        }
        handler?(fraction)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        withLock { uploads[dataTask.taskIdentifier]?.data.append(data) }
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        guard totalBytesExpectedToWrite > 0 else { return }
        let fraction = min(1, Double(totalBytesWritten) / Double(totalBytesExpectedToWrite))
        let handler: TransferProgressHandler? = withLock {
            guard let state = downloads[downloadTask.taskIdentifier],
                  Self.shouldReport(fraction, last: state.lastReported) else { return nil }
            state.lastReported = fraction
            return state.progress
        }
        handler?(fraction)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        // The temporary file is deleted when this method returns, so it must be moved now.
        guard let state = withLock({ downloads[downloadTask.taskIdentifier] }) else { return }
        let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 0
        if (200..<300).contains(status) {
            do {
                try Self.moveReplacing(location, to: state.destination)
                state.moved = true
            } catch {
                state.failure = APIError.file("The download couldn't be saved: \(error.localizedDescription)")
            }
        } else {
            let body = try? Data(contentsOf: location)
            state.failure = APIError.from(statusCode: status, body: body)
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let identifier = task.taskIdentifier
        let (upload, download) = withLock {
            (uploads.removeValue(forKey: identifier), downloads.removeValue(forKey: identifier))
        }
        if let upload {
            if let error {
                upload.continuation.resume(throwing: APIError.from(error))
            } else if let response = task.response as? HTTPURLResponse {
                upload.continuation.resume(returning: (upload.data, response))
            } else {
                upload.continuation.resume(throwing: APIError.network("The server sent an invalid response."))
            }
        } else if let download {
            if let failure = download.failure {
                download.continuation.resume(throwing: failure)
            } else if let error {
                download.continuation.resume(throwing: APIError.from(error))
            } else if download.moved {
                download.continuation.resume(returning: download.destination)
            } else {
                download.continuation.resume(throwing: APIError.network("The download didn't complete."))
            }
        }
    }
}
