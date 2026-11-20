import Foundation
import XCTest
@testable import StemMaster

/// Decoding of in-flight jobs, forward compatibility and error bodies.
final class JobDecodingTests: XCTestCase {
    private let queuedJSON = """
    {"id": "\(Fixtures.jobID)", "status": "queued",
     "created_at": "2026-11-20T10:00:00Z", "updated_at": "2026-11-20T10:00:01Z",
     "filename": "My Song.mp3", "options": \(Fixtures.optionsJSON),
     "progress": 0.0, "stage": "queued", "stage_label": "Waiting in queue",
     "queue_position": 2, "error": null, "analysis": null, "stems": [],
     "zip_url": null, "gain_offset_db": 0.0}
    """

    private let processingJSON = """
    {"id": "\(Fixtures.jobID)", "status": "processing",
     "created_at": "2026-11-20T10:00:00Z", "updated_at": "2026-11-20T10:01:12Z",
     "filename": "My Song.mp3", "options": \(Fixtures.optionsJSON),
     "progress": 0.42, "stage": "instruments", "stage_label": "Splitting bass, drums, guitar, piano",
     "queue_position": null, "error": null, "analysis": \(Fixtures.analysisJSON), "stems": [],
     "zip_url": null, "gain_offset_db": 0.0}
    """

    private let failedJSON = """
    {"id": "\(Fixtures.jobID)", "status": "failed",
     "created_at": "2026-11-20T10:00:00Z", "updated_at": "2026-11-20T10:02:00Z",
     "filename": "Broken.wav", "options": \(Fixtures.optionsJSON),
     "progress": 0.12, "stage": "vocals", "stage_label": "Separating vocals",
     "queue_position": null, "error": "CUDA out of memory while separating vocals",
     "analysis": null, "stems": [], "zip_url": null, "gain_offset_db": 0.0}
    """

    func testDecodesQueuedJob() throws {
        let job = try Fixtures.decode(Job.self, from: queuedJSON)
        XCTAssertEqual(job.id, Fixtures.jobID)
        XCTAssertEqual(job.status, .queued)
        XCTAssertFalse(job.status.isFinished)
        XCTAssertEqual(job.stage, .queued)
        XCTAssertEqual(job.stageLabel, "Waiting in queue")
        XCTAssertEqual(job.queuePosition, 2)
        XCTAssertNil(job.analysis)
        XCTAssertTrue(job.stems.isEmpty)
        XCTAssertNil(job.zipURL)
        XCTAssertEqual(job.filename, "My Song.mp3")
        XCTAssertEqual(job.createdAt, Date(timeIntervalSince1970: 1_795_168_800))
        XCTAssertEqual(job.updatedAt.timeIntervalSince(job.createdAt), 1, accuracy: 1e-6)
        XCTAssertEqual(job.options, JobOptions())
    }

    func testDecodesProcessingJobWithAnalysis() throws {
        let job = try Fixtures.decode(Job.self, from: processingJSON)
        XCTAssertEqual(job.status, .processing)
        XCTAssertEqual(job.stage, .instruments)
        XCTAssertEqual(job.progress, 0.42, accuracy: 1e-9)
        XCTAssertNil(job.queuePosition)
        let analysis = try XCTUnwrap(job.analysis)
        XCTAssertEqual(analysis.durationSeconds, 213.41, accuracy: 1e-9)
        XCTAssertEqual(analysis.sampleRate, 48000)
        XCTAssertEqual(analysis.channels, 2)
        XCTAssertEqual(analysis.codec, "mp3")
        XCTAssertEqual(analysis.bpm, 92)
        XCTAssertEqual(analysis.key, "A minor")
        XCTAssertEqual(analysis.camelot, "8A")
        XCTAssertEqual(analysis.loudnessLUFS, -9.1, accuracy: 1e-9)
        XCTAssertEqual(analysis.peakDBFS, -0.4, accuracy: 1e-9)
        XCTAssertEqual(analysis.artifactLevel, 0.62, accuracy: 1e-9)
        XCTAssertEqual(analysis.artifactLabel, .high)
        XCTAssertEqual(analysis.spectralCutoffHz, 16000)
    }

    func testDecodesFailedJob() throws {
        let job = try Fixtures.decode(Job.self, from: failedJSON)
        XCTAssertEqual(job.status, .failed)
        XCTAssertTrue(job.status.isFinished)
        XCTAssertEqual(job.stage, .vocals)
        XCTAssertEqual(job.error, "CUDA out of memory while separating vocals")

        var record = SessionRecord(title: "Broken", originalFilename: "Broken.wav", sourceFileName: "Broken.wav", sourceBytes: 10, options: JobOptions())
        record.apply(job)
        XCTAssertEqual(record.state, .failed)
        XCTAssertEqual(record.errorMessage, "CUDA out of memory while separating vocals")
        XCTAssertEqual(record.jobID, Fixtures.jobID)
    }

    func testDecodesCompletedStem() throws {
        let json = Fixtures.stemJSON(id: "lead_vocals", name: "Lead Vocals (Dry)", group: "vocals", role: "primary")
        let stem = try Fixtures.decode(Stem.self, from: json)
        XCTAssertEqual(stem.id, "lead_vocals")
        XCTAssertEqual(stem.name, "Lead Vocals (Dry)")
        XCTAssertEqual(stem.group, .vocals)
        XCTAssertEqual(stem.role, .primary)
        XCTAssertEqual(stem.wavURL, "/v1/jobs/\(Fixtures.jobID)/stems/lead_vocals.wav")
        XCTAssertEqual(stem.previewURL, "/v1/jobs/\(Fixtures.jobID)/stems/lead_vocals.m4a")
        XCTAssertEqual(stem.wavBytes, 75_432_112)
        XCTAssertEqual(stem.previewBytes, 6_843_210)
        XCTAssertEqual(stem.peakDBFS, -3.2, accuracy: 1e-9)
        XCTAssertEqual(stem.rmsDBFS, -19.8, accuracy: 1e-9)
        XCTAssertEqual(stem.activeRatio, 0.71, accuracy: 1e-9)
        XCTAssertEqual(stem.waveform.count, 256)
        XCTAssertTrue(stem.isPlayable)
    }

    func testUnknownEnumValuesFallBackInsteadOfFailing() throws {
        let json = """
        {"id": "\(Fixtures.jobID)", "status": "paused",
         "created_at": "2026-11-20T10:00:00Z", "updated_at": "2026-11-20T10:00:00Z",
         "filename": "x.wav",
         "options": {"quality": "ultra", "cleanup_strength": "nuclear", "denoise_strength": "max", "output_format": "flac", "future_flag": true},
         "progress": 0.5, "stage": "mastering", "stage_label": "Mastering",
         "queue_position": null, "error": null,
         "analysis": {"duration_seconds": 1.0, "sample_rate": 44100, "channels": 2, "codec": "wav",
                      "bpm": 120.0, "bpm_confidence": 0.5, "key": "C major", "camelot": "8B", "key_confidence": 0.5,
                      "loudness_lufs": -14.0, "peak_dbfs": -1.0, "artifact_level": 0.1, "artifact_label": "extreme",
                      "spectral_cutoff_hz": null},
         "stems": [\(Fixtures.stemJSON(id: "theremin", name: "Theremin", group: "fx", role: "aux"))],
         "zip_url": null, "gain_offset_db": 0.0, "new_top_level_field": [1, 2, 3]}
        """
        let job = try Fixtures.decode(Job.self, from: json)
        XCTAssertEqual(job.status, .unknown)
        XCTAssertFalse(job.status.isFinished, "unknown statuses keep polling")
        XCTAssertEqual(job.stage, .unknown)
        XCTAssertEqual(job.options.quality, .max)
        XCTAssertEqual(job.options.cleanupStrength, .standard)
        XCTAssertEqual(job.options.denoiseStrength, .standard)
        XCTAssertEqual(job.options.outputFormat, .wav24)
        XCTAssertEqual(job.analysis?.artifactLabel, .unknown)
        XCTAssertNil(job.analysis?.spectralCutoffHz)
        XCTAssertEqual(job.stems.first?.group, .unknown)
        XCTAssertEqual(job.stems.first?.role, .unknown)
        XCTAssertEqual(job.stems.first?.isPlayable, false)
        XCTAssertEqual(SessionState(jobStatus: job.status), .processing)
    }

    func testEachEnumDecodesItsKnownValues() throws {
        func decode<T: Decodable>(_ type: T.Type, _ raw: String) throws -> T {
            try Fixtures.decode([T].self, from: "[\"\(raw)\"]")[0]
        }
        XCTAssertEqual(try decode(JobStatus.self, "cancelled"), .cancelled)
        XCTAssertEqual(try decode(JobStage.self, "vocal_split"), .vocalSplit)
        XCTAssertEqual(try decode(JobStage.self, "done"), .done)
        XCTAssertEqual(try decode(StemGroup.self, "instruments"), .instruments)
        XCTAssertEqual(try decode(StemRole.self, "bus"), .bus)
        XCTAssertEqual(try decode(StemRole.self, "removed"), .removed)
        XCTAssertEqual(try decode(ComputeDevice.self, "mps"), .mps)
        XCTAssertEqual(try decode(ComputeDevice.self, "tpu"), .unknown)
        XCTAssertEqual(try decode(Quality.self, "fast"), .fast)
        XCTAssertEqual(try decode(OutputFormat.self, "wav32f"), .wav32f)
        XCTAssertEqual(try decode(ArtifactLabel.self, "moderate"), .moderate)
    }

    func testMissingOptionalFieldsUseDefaults() throws {
        let json = """
        {"id": "\(Fixtures.jobID)", "status": "processing",
         "created_at": "2026-11-20T10:00:00Z", "updated_at": "2026-11-20T10:00:00Z",
         "filename": "x.wav", "progress": 0.1, "stage": "analyze"}
        """
        let job = try Fixtures.decode(Job.self, from: json)
        XCTAssertEqual(job.options, JobOptions())
        XCTAssertEqual(job.stageLabel, "")
        XCTAssertTrue(job.stems.isEmpty)
        XCTAssertEqual(job.gainOffsetDB, 0)
        XCTAssertNil(job.zipURL)
    }

    func testTimestampVariants() throws {
        let base = Date(timeIntervalSince1970: 1_795_168_800)
        XCTAssertEqual(ISO8601Timestamp.parse("2026-11-20T10:00:00Z"), base)
        XCTAssertEqual(ISO8601Timestamp.parse("2026-11-20T10:00:00+00:00"), base)
        XCTAssertEqual(ISO8601Timestamp.parse("2026-11-20T12:00:00+02:00"), base)
        let fractional = try XCTUnwrap(ISO8601Timestamp.parse("2026-11-20T10:00:00.123456Z"))
        XCTAssertEqual(fractional.timeIntervalSince(base), 0.123, accuracy: 0.001)
        let fractionalOffset = try XCTUnwrap(ISO8601Timestamp.parse("2026-11-20T10:00:00.5+00:00"))
        XCTAssertEqual(fractionalOffset.timeIntervalSince(base), 0.5, accuracy: 0.001)
        XCTAssertNil(ISO8601Timestamp.parse("yesterday"))
        XCTAssertEqual(ISO8601Timestamp.format(base), "2026-11-20T10:00:00Z")

        let bad = """
        {"id": "x", "status": "queued", "created_at": "not a date", "updated_at": "2026-11-20T10:00:00Z",
         "filename": "x", "progress": 0, "stage": "queued"}
        """
        XCTAssertThrowsError(try Fixtures.decode(Job.self, from: bad))
    }

    func testDecodesHealthCapabilitiesAndJobList() throws {
        let health = try Fixtures.decode(Health.self, from: """
        {"status": "ok", "version": "1.0.0", "device": "cuda", "queue_length": 0, "auth_required": true}
        """)
        XCTAssertEqual(health.device, .cuda)
        XCTAssertEqual(health.version, "1.0.0")
        XCTAssertTrue(health.authRequired)
        XCTAssertEqual(health.queueLength, 0)

        let capabilities = try Fixtures.decode(Capabilities.self, from: """
        {"max_upload_mb": 200, "max_duration_seconds": 900, "output_formats": ["wav24", "wav32f", "wav16"],
         "default_options": \(Fixtures.optionsJSON)}
        """)
        XCTAssertEqual(capabilities.maxUploadMB, 200)
        XCTAssertEqual(capabilities.maxDurationSeconds, 900)
        XCTAssertEqual(capabilities.outputFormats, [.wav24, .wav32f, .wav16])
        XCTAssertEqual(capabilities.defaultOptions, JobOptions())

        let list = try Fixtures.decode(JobList.self, from: "{\"jobs\": [\(queuedJSON), \(failedJSON)]}")
        XCTAssertEqual(list.jobs.map(\.status), [.queued, .failed])
    }

    func testErrorBodies() {
        let plain = Data(#"{"detail": "File too large (max 200 MB)."}"#.utf8)
        XCTAssertEqual(APIError.from(statusCode: 413, body: plain), .payloadTooLarge("File too large (max 200 MB)."))

        let validation = Data(#"{"detail": [{"loc": ["body", "options"], "msg": "Input should be 'max' or 'fast'", "type": "literal_error"}]}"#.utf8)
        XCTAssertEqual(APIError.from(statusCode: 422, body: validation), .invalidRequest("Input should be 'max' or 'fast'"))

        XCTAssertEqual(APIError.from(statusCode: 401, body: Data(#"{"detail": "Invalid API key"}"#.utf8)), .unauthorized("Invalid API key"))
        XCTAssertEqual(APIError.from(statusCode: 404, body: nil), .notFound(nil))
        XCTAssertEqual(APIError.from(statusCode: 415, body: Data()), .unsupportedMedia(nil))
        XCTAssertEqual(APIError.from(statusCode: 503, body: Data("<html>busy</html>".utf8)), .serverUnavailable(status: 503, detail: nil))
        XCTAssertEqual(APIError.from(statusCode: 500, body: Data("Internal Server Error".utf8)), .server(status: 500, detail: "Internal Server Error"))

        XCTAssertTrue(APIError.serverUnavailable(status: 503, detail: nil).isRetryable)
        XCTAssertFalse(APIError.unauthorized(nil).isRetryable)
        XCTAssertEqual(APIError.from(CancellationError()), .cancelled)
        XCTAssertEqual(APIError.from(URLError(.cancelled)), .cancelled)
        XCTAssertEqual(APIError.from(URLError(.notConnectedToInternet)), .network("You're offline. Check your connection and try again."))
        XCTAssertTrue(APIError.payloadTooLarge("File too large (max 200 MB).").errorDescription?.contains("200 MB") == true)
    }
}
