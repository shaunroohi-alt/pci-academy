import Foundation

/// Local lifecycle of a session (one imported track and its separation job).
enum SessionState: String, Codable, Hashable, Sendable {
    /// Imported, options not confirmed yet.
    case draft
    /// Multipart upload in progress.
    case uploading
    /// Accepted by the server, waiting for a worker.
    case queued
    /// Running on the server.
    case processing
    case completed
    case failed
    case cancelled

    init(from decoder: Decoder) throws {
        self = try decodeLenientEnum(decoder, fallback: .failed)
    }

    /// Maps a server job status to the local state.
    init(jobStatus: JobStatus) {
        switch jobStatus {
        case .queued: self = .queued
        case .processing, .unknown: self = .processing
        case .completed: self = .completed
        case .failed: self = .failed
        case .cancelled: self = .cancelled
        }
    }

    /// The server is (or will be) working on it: keep polling.
    var isTrackedOnServer: Bool { self == .queued || self == .processing }

    /// Upload or server processing in progress.
    var isInFlight: Bool { self == .uploading || isTrackedOnServer }

    /// Status badge text.
    var label: String {
        switch self {
        case .draft: return "Ready"
        case .uploading: return "Uploading"
        case .queued: return "Queued"
        case .processing: return "Separating"
        case .completed: return "Stems ready"
        case .failed: return "Failed"
        case .cancelled: return "Cancelled"
        }
    }
}

/// One entry of the library index (`Documents/sessions.json`). The full job, with stems and
/// waveforms, lives next to the audio in `Documents/Sessions/<id>/job.json`.
struct SessionRecord: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    /// Track title (source file name without extension).
    var title: String
    /// Name sent to the server as the upload's file name.
    var originalFilename: String
    /// File name of the local copy inside `Sessions/<id>/source/`.
    var sourceFileName: String
    var sourceBytes: Int64
    var createdAt: Date
    var updatedAt: Date
    var options: JobOptions
    var jobID: String?
    var state: SessionState
    /// Server progress 0...1.
    var progress: Double
    var stage: JobStage
    var stageLabel: String?
    var queuePosition: Int?
    var errorMessage: String?
    var durationSeconds: Double?
    /// Number of primary stems once completed.
    var stemCount: Int

    init(
        id: UUID = UUID(),
        title: String,
        originalFilename: String,
        sourceFileName: String,
        sourceBytes: Int64,
        createdAt: Date = Date(),
        options: JobOptions
    ) {
        self.id = id
        self.title = title
        self.originalFilename = originalFilename
        self.sourceFileName = sourceFileName
        self.sourceBytes = sourceBytes
        self.createdAt = createdAt.wholeSeconds
        self.updatedAt = createdAt.wholeSeconds
        self.options = options
        self.jobID = nil
        self.state = .draft
        self.progress = 0
        self.stage = .queued
        self.stageLabel = nil
        self.queuePosition = nil
        self.errorMessage = nil
        self.durationSeconds = nil
        self.stemCount = 0
    }

    /// Copies the server's view of the job into the summary.
    mutating func apply(_ job: Job, now: Date = Date()) {
        jobID = job.id
        state = SessionState(jobStatus: job.status)
        progress = min(max(job.progress, 0), 1)
        stage = job.stage
        stageLabel = job.stageLabel
        queuePosition = job.queuePosition
        options = job.options
        if job.status == .failed {
            let message = job.error?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            errorMessage = message.isEmpty ? "The server could not separate this track." : message
        } else {
            errorMessage = nil
        }
        if let analysis = job.analysis {
            durationSeconds = analysis.durationSeconds
        }
        if job.status == .completed {
            stemCount = job.stems.filter { $0.role == .primary }.count
            progress = 1
        }
        updatedAt = now.wholeSeconds
    }
}

extension Date {
    /// The date truncated to whole seconds. Library dates are stored at this precision so they
    /// round-trip exactly through the ISO-8601 index file.
    var wholeSeconds: Date {
        Date(timeIntervalSince1970: timeIntervalSince1970.rounded(.down))
    }
}

/// A user-facing alert.
struct AppAlert: Identifiable, Equatable, Sendable {
    let id = UUID()
    let title: String
    let message: String
}

/// Count-based progress for a batch (preview downloads, multi-stem export).
struct BatchProgress: Equatable, Sendable {
    var done: Int
    var total: Int

    var fraction: Double { total > 0 ? Double(done) / Double(total) : 0 }
}
