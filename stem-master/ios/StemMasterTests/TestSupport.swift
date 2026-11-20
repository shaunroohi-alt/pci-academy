import Foundation
import XCTest
@testable import StemMaster

/// Anchor class for locating the test bundle.
final class FixtureBundleToken {}

enum Fixtures {
    /// URL of a resource copied into the test bundle (Xcode) or the package's resource bundle
    /// (SwiftPM, used for running the Foundation-only tests on Linux).
    static func url(_ name: String, ext: String) -> URL? {
        #if SWIFT_PACKAGE
        return Bundle.module.url(forResource: name, withExtension: ext)
        #else
        return Bundle(for: FixtureBundleToken.self).url(forResource: name, withExtension: ext)
        #endif
    }

    /// Decodes with the app's API decoder.
    static func decode<T: Decodable>(_ type: T.Type, from json: String) throws -> T {
        try StemMasterJSON.makeDecoder().decode(T.self, from: Data(json.utf8))
    }

    /// A fresh, empty temporary folder.
    static func temporaryDirectory(_ label: String = #function) throws -> URL {
        let safe = label.filter { $0.isLetter || $0.isNumber }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("StemMasterTests-\(safe)-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    /// 256-point waveform for embedded fixtures.
    static func waveformJSON(_ value: Double = 0.25) -> String {
        "[" + Array(repeating: String(value), count: 256).joined(separator: ", ") + "]"
    }

    static let jobID = "3f2c9a0b1c2d3e4f5a6b7c8d9e0f1a2b"

    static let optionsJSON = """
    {"quality": "max", "drum_split": true, "vocal_split": true, "dereverb": false,
     "cleanup": true, "cleanup_strength": "standard", "denoise": false,
     "denoise_strength": "standard", "output_format": "wav24"}
    """

    static let analysisJSON = """
    {"duration_seconds": 213.41, "sample_rate": 48000, "channels": 2, "codec": "mp3",
     "bpm": 92.0, "bpm_confidence": 0.81, "key": "A minor", "camelot": "8A", "key_confidence": 0.64,
     "loudness_lufs": -9.1, "peak_dbfs": -0.4, "artifact_level": 0.62, "artifact_label": "high",
     "spectral_cutoff_hz": 16000.0}
    """

    static func stemJSON(id: String, name: String, group: String, role: String, color: String = "#FF7A1A") -> String {
        """
        {"id": "\(id)", "name": "\(name)", "group": "\(group)", "role": "\(role)", "color": "\(color)",
         "wav_url": "/v1/jobs/\(jobID)/stems/\(id).wav", "preview_url": "/v1/jobs/\(jobID)/stems/\(id).m4a",
         "wav_bytes": 75432112, "preview_bytes": 6843210, "peak_dbfs": -3.2, "rms_dbfs": -19.8,
         "active_ratio": 0.71, "waveform": \(waveformJSON())}
        """
    }

    static func stem(_ id: String, group: StemGroup, role: StemRole, name: String? = nil) -> Stem {
        Stem(
            id: id,
            name: name ?? id,
            group: group,
            role: role,
            color: "#FF7A1A",
            wavURL: "/v1/jobs/\(jobID)/stems/\(id).wav",
            previewURL: "/v1/jobs/\(jobID)/stems/\(id).m4a",
            wavBytes: 100,
            previewBytes: 10,
            peakDBFS: -3,
            rmsDBFS: -20,
            activeRatio: 0.5,
            waveform: Array(repeating: 0.5, count: 256)
        )
    }
}
