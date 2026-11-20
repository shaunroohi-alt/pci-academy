import Foundation

// Codable mirrors of the Stem Master REST API (SPEC section 4).
//
// The wire format is snake_case. Every type maps it with explicit `CodingKeys`
// (no key-decoding strategy), so `zip_url`, `gain_offset_db`, `peak_dbfs` and
// friends decode exactly and the contract test can compare key sets 1:1.
//
// Enums the server may grow (status, stage, group, role, ...) decode leniently:
// an unknown raw value maps to `.unknown` (or to the documented default for
// option enums) instead of failing the whole job.

// MARK: - Lenient enum decoding

/// Decodes a `String`-backed enum, returning `fallback` for raw values this build does not know.
func decodeLenientEnum<T: RawRepresentable>(_ decoder: Decoder, fallback: T) throws -> T where T.RawValue == String {
    let container = try decoder.singleValueContainer()
    let raw = try container.decode(String.self)
    return T(rawValue: raw) ?? fallback
}

/// `status` of a job.
enum JobStatus: String, Codable, Hashable, Sendable {
    case queued
    case processing
    case completed
    case failed
    case cancelled
    case unknown

    init(from decoder: Decoder) throws {
        self = try decodeLenientEnum(decoder, fallback: .unknown)
    }

    /// `true` once the server will not change the job any more.
    var isFinished: Bool {
        switch self {
        case .completed, .failed, .cancelled: return true
        case .queued, .processing, .unknown: return false
        }
    }
}

/// `stage` of a job: a pipeline stage id from SPEC section 2, or `queued` / `done`.
enum JobStage: String, Codable, Hashable, Sendable, CaseIterable {
    case queued
    case analyze
    case vocals
    case debleed
    case instruments
    case drums
    case vocalSplit = "vocal_split"
    case dereverb
    case cleanup
    case denoise
    case finalize
    case done
    case unknown

    init(from decoder: Decoder) throws {
        self = try decodeLenientEnum(decoder, fallback: .unknown)
    }
}

/// `group` of a stem, in display order.
enum StemGroup: String, Codable, Hashable, Sendable, CaseIterable {
    case vocals
    case drums
    case bass
    case instruments
    case removed
    case unknown

    init(from decoder: Decoder) throws {
        self = try decodeLenientEnum(decoder, fallback: .unknown)
    }
}

/// `role` of a stem: `primary` plays in the mixer, `bus` is export-only, `removed` is what
/// Cleanup/Denoise took out.
enum StemRole: String, Codable, Hashable, Sendable {
    case primary
    case bus
    case removed
    case unknown

    init(from decoder: Decoder) throws {
        self = try decodeLenientEnum(decoder, fallback: .unknown)
    }
}

/// `artifact_label` of the analysis.
enum ArtifactLabel: String, Codable, Hashable, Sendable {
    case low
    case moderate
    case high
    case unknown

    init(from decoder: Decoder) throws {
        self = try decodeLenientEnum(decoder, fallback: .unknown)
    }
}

/// `device` reported by `/v1/health`.
enum ComputeDevice: String, Codable, Hashable, Sendable {
    case cuda
    case mps
    case cpu
    case unknown

    init(from decoder: Decoder) throws {
        self = try decodeLenientEnum(decoder, fallback: .unknown)
    }
}

/// `quality` option. Unknown values decode as the SPEC default (`max`).
enum Quality: String, Codable, Hashable, Sendable, CaseIterable {
    case max
    case fast

    init(from decoder: Decoder) throws {
        self = try decodeLenientEnum(decoder, fallback: .max)
    }
}

/// `cleanup_strength` / `denoise_strength`. Unknown values decode as `standard`.
enum Strength: String, Codable, Hashable, Sendable, CaseIterable {
    case light
    case standard
    case strong

    init(from decoder: Decoder) throws {
        self = try decodeLenientEnum(decoder, fallback: .standard)
    }
}

/// `output_format` of the lossless stems. Unknown values decode as `wav24`.
enum OutputFormat: String, Codable, Hashable, Sendable, CaseIterable {
    case wav24
    case wav32f
    case wav16

    init(from decoder: Decoder) throws {
        self = try decodeLenientEnum(decoder, fallback: .wav24)
    }
}

// MARK: - JobOptions

/// Processing options sent with `POST /v1/jobs` (the `options` form field, as JSON).
struct JobOptions: Codable, Hashable, Sendable {
    var quality: Quality = .max
    var drumSplit: Bool = true
    var vocalSplit: Bool = true
    var dereverb: Bool = false
    var cleanup: Bool = true
    var cleanupStrength: Strength = .standard
    var denoise: Bool = false
    var denoiseStrength: Strength = .standard
    var outputFormat: OutputFormat = .wav24

    enum CodingKeys: String, CodingKey, CaseIterable {
        case quality
        case drumSplit = "drum_split"
        case vocalSplit = "vocal_split"
        case dereverb
        case cleanup
        case cleanupStrength = "cleanup_strength"
        case denoise
        case denoiseStrength = "denoise_strength"
        case outputFormat = "output_format"
    }
}

extension JobOptions {
    /// Missing keys take the SPEC defaults ("defaults apply per field").
    init(from decoder: Decoder) throws {
        self.init()
        let container = try decoder.container(keyedBy: CodingKeys.self)
        quality = try container.decodeIfPresent(Quality.self, forKey: .quality) ?? quality
        drumSplit = try container.decodeIfPresent(Bool.self, forKey: .drumSplit) ?? drumSplit
        vocalSplit = try container.decodeIfPresent(Bool.self, forKey: .vocalSplit) ?? vocalSplit
        dereverb = try container.decodeIfPresent(Bool.self, forKey: .dereverb) ?? dereverb
        cleanup = try container.decodeIfPresent(Bool.self, forKey: .cleanup) ?? cleanup
        cleanupStrength = try container.decodeIfPresent(Strength.self, forKey: .cleanupStrength) ?? cleanupStrength
        denoise = try container.decodeIfPresent(Bool.self, forKey: .denoise) ?? denoise
        denoiseStrength = try container.decodeIfPresent(Strength.self, forKey: .denoiseStrength) ?? denoiseStrength
        outputFormat = try container.decodeIfPresent(OutputFormat.self, forKey: .outputFormat) ?? outputFormat
    }
}

// MARK: - Analysis

/// Track analysis produced by the `analyze` stage.
struct Analysis: Codable, Hashable, Sendable {
    var durationSeconds: Double
    var sampleRate: Int
    var channels: Int
    var codec: String
    var bpm: Double
    var bpmConfidence: Double
    var key: String
    var camelot: String
    var keyConfidence: Double
    var loudnessLUFS: Double
    var peakDBFS: Double
    /// 0...1. How noise-like the high band is, plus an audible static noise floor (SPEC 2.3);
    /// never an authorship claim.
    var artifactLevel: Double
    var artifactLabel: ArtifactLabel
    /// `nil` when no hard spectral cut-off was detected.
    var spectralCutoffHz: Double?

    enum CodingKeys: String, CodingKey, CaseIterable {
        case durationSeconds = "duration_seconds"
        case sampleRate = "sample_rate"
        case channels
        case codec
        case bpm
        case bpmConfidence = "bpm_confidence"
        case key
        case camelot
        case keyConfidence = "key_confidence"
        case loudnessLUFS = "loudness_lufs"
        case peakDBFS = "peak_dbfs"
        case artifactLevel = "artifact_level"
        case artifactLabel = "artifact_label"
        case spectralCutoffHz = "spectral_cutoff_hz"
    }
}

// MARK: - Stem

/// One delivered stem.
struct Stem: Codable, Identifiable, Hashable, Sendable {
    /// Fixed catalogue id, e.g. `lead_vocals` (SPEC section 3).
    var id: String
    var name: String
    var group: StemGroup
    var role: StemRole
    /// `#RRGGBB`.
    var color: String
    /// Relative to the server base URL.
    var wavURL: String
    /// Relative to the server base URL (AAC preview, `.m4a`).
    var previewURL: String
    var wavBytes: Int64
    var previewBytes: Int64
    var peakDBFS: Double
    var rmsDBFS: Double
    var activeRatio: Double
    /// Exactly 256 linear peaks in 0...1.
    var waveform: [Double]

    enum CodingKeys: String, CodingKey, CaseIterable {
        case id
        case name
        case group
        case role
        case color
        case wavURL = "wav_url"
        case previewURL = "preview_url"
        case wavBytes = "wav_bytes"
        case previewBytes = "preview_bytes"
        case peakDBFS = "peak_dbfs"
        case rmsDBFS = "rms_dbfs"
        case activeRatio = "active_ratio"
        case waveform
    }

    /// Primary and removed stems are loaded into the mixer; buses are export-only.
    var isPlayable: Bool { role == .primary || role == .removed }
}

// MARK: - Job

/// A separation job as returned by `GET /v1/jobs/{id}`.
struct Job: Codable, Identifiable, Hashable, Sendable {
    /// 32 lowercase hex characters.
    var id: String
    var status: JobStatus
    var createdAt: Date
    var updatedAt: Date
    var filename: String
    var options: JobOptions
    /// 0...1.
    var progress: Double
    var stage: JobStage
    var stageLabel: String
    /// 1-based while queued, else `nil`.
    var queuePosition: Int?
    var error: String?
    var analysis: Analysis?
    var stems: [Stem]
    /// `/v1/jobs/{id}/download.zip` once completed.
    var zipURL: String?
    /// Common gain applied to every stem to avoid clipping (0 when untouched).
    var gainOffsetDB: Double

    enum CodingKeys: String, CodingKey, CaseIterable {
        case id
        case status
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case filename
        case options
        case progress
        case stage
        case stageLabel = "stage_label"
        case queuePosition = "queue_position"
        case error
        case analysis
        case stems
        case zipURL = "zip_url"
        case gainOffsetDB = "gain_offset_db"
    }
}

extension Job {
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        status = try container.decode(JobStatus.self, forKey: .status)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        filename = try container.decode(String.self, forKey: .filename)
        options = try container.decodeIfPresent(JobOptions.self, forKey: .options) ?? JobOptions()
        progress = try container.decode(Double.self, forKey: .progress)
        stage = try container.decode(JobStage.self, forKey: .stage)
        stageLabel = try container.decodeIfPresent(String.self, forKey: .stageLabel) ?? ""
        queuePosition = try container.decodeIfPresent(Int.self, forKey: .queuePosition)
        error = try container.decodeIfPresent(String.self, forKey: .error)
        analysis = try container.decodeIfPresent(Analysis.self, forKey: .analysis)
        stems = try container.decodeIfPresent([Stem].self, forKey: .stems) ?? []
        zipURL = try container.decodeIfPresent(String.self, forKey: .zipURL)
        gainOffsetDB = try container.decodeIfPresent(Double.self, forKey: .gainOffsetDB) ?? 0
    }

    /// Stems in manifest order that the mixer plays (primary + removed).
    var playableStems: [Stem] { stems.filter(\.isPlayable) }
}

// MARK: - Other responses

/// `GET /v1/health`.
struct Health: Codable, Hashable, Sendable {
    var status: String
    var version: String
    var device: ComputeDevice
    var queueLength: Int
    var authRequired: Bool

    enum CodingKeys: String, CodingKey, CaseIterable {
        case status
        case version
        case device
        case queueLength = "queue_length"
        case authRequired = "auth_required"
    }
}

/// `GET /v1/capabilities`.
struct Capabilities: Codable, Hashable, Sendable {
    var maxUploadMB: Int
    var maxDurationSeconds: Int
    var outputFormats: [OutputFormat]
    var defaultOptions: JobOptions

    enum CodingKeys: String, CodingKey, CaseIterable {
        case maxUploadMB = "max_upload_mb"
        case maxDurationSeconds = "max_duration_seconds"
        case outputFormats = "output_formats"
        case defaultOptions = "default_options"
    }
}

/// `GET /v1/jobs`.
struct JobList: Codable, Hashable, Sendable {
    var jobs: [Job]
}

/// `{"detail": ...}` error body. FastAPI uses a string for handled errors and a list of
/// `{"loc": [...], "msg": "..."}` objects for request-validation errors; both are accepted.
struct APIErrorBody: Decodable, Sendable {
    let message: String?

    private enum CodingKeys: String, CodingKey {
        case detail
    }

    private struct ValidationIssue: Decodable {
        let msg: String?
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let text = try? container.decode(String.self, forKey: .detail) {
            message = text
        } else if let issues = try? container.decode([ValidationIssue].self, forKey: .detail) {
            let texts = issues.compactMap(\.msg).filter { !$0.isEmpty }
            message = texts.isEmpty ? nil : texts.joined(separator: "; ")
        } else {
            message = nil
        }
    }
}
