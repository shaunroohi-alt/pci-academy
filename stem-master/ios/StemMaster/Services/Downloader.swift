import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Downloads a job's audio: AAC previews for the mixer (in parallel, at most 4 at a time),
/// lossless WAVs on demand, and the ZIP of everything.
final class Downloader: @unchecked Sendable {
    /// One file to fetch.
    struct Item: Sendable, Equatable {
        let stemID: String
        let path: String
        let destination: URL
        /// Expected size, or 0 if unknown.
        let expectedBytes: Int64
    }

    private enum Outcome: Sendable {
        case success(String)
        case failure(String, Error)
    }

    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    /// `true` if `url` already holds a complete copy (non-empty, and the expected size when known).
    static func isComplete(_ url: URL, expectedBytes: Int64) -> Bool {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = (attributes[.size] as? NSNumber)?.int64Value, size > 0 else {
            return false
        }
        return expectedBytes <= 0 || size == expectedBytes
    }

    /// Fetches every item that isn't already on disk, `maxConcurrent` at a time. `onFinished` is
    /// called with each stem id as its file lands. Keeps going when one file fails and throws the
    /// first failure at the end, so a flaky connection still leaves most previews in place.
    func downloadAll(_ items: [Item], maxConcurrent: Int = 4, onFinished: (String) -> Void) async throws {
        let pending = items.filter { !Self.isComplete($0.destination, expectedBytes: $0.expectedBytes) }
        for item in items where !pending.contains(item) {
            onFinished(item.stemID)
        }
        guard !pending.isEmpty else { return }
        let limit = max(1, maxConcurrent)
        var firstError: Error?

        await withTaskGroup(of: Outcome.self) { group in
            var next = 0
            while next < min(limit, pending.count) {
                let item = pending[next]
                next += 1
                group.addTask { await self.fetch(item) }
            }
            while let outcome = await group.next() {
                switch outcome {
                case let .success(stemID):
                    onFinished(stemID)
                case let .failure(_, error):
                    if firstError == nil { firstError = error }
                }
                if next < pending.count, !Task.isCancelled {
                    let item = pending[next]
                    next += 1
                    group.addTask { await self.fetch(item) }
                }
            }
        }
        try Task.checkCancellation()
        if let firstError { throw firstError }
    }

    private func fetch(_ item: Item) async -> Outcome {
        do {
            _ = try await api.download(item.path, to: item.destination)
            return .success(item.stemID)
        } catch {
            return .failure(item.stemID, APIError.from(error))
        }
    }

    /// Downloads one file (lossless WAV or ZIP) with progress; returns the local URL. A complete
    /// existing copy is reused.
    func download(_ path: String, to destination: URL, expectedBytes: Int64 = 0, progress: TransferProgressHandler? = nil) async throws -> URL {
        if Self.isComplete(destination, expectedBytes: expectedBytes) {
            progress?(1)
            return destination
        }
        return try await api.download(path, to: destination, timeout: 300, progress: progress)
    }
}
