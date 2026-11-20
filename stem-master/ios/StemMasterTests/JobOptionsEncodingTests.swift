import Foundation
import XCTest
@testable import StemMaster

/// The `options` form field must use exactly the SPEC keys and values.
final class JobOptionsEncodingTests: XCTestCase {
    private func encodedObject(_ options: JobOptions) throws -> [String: Any] {
        let data = try StemMasterJSON.makeEncoder().encode(options)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func testDefaultsMatchSpec() throws {
        let object = try encodedObject(JobOptions())
        XCTAssertEqual(Set(object.keys), [
            "quality", "drum_split", "vocal_split", "dereverb", "cleanup",
            "cleanup_strength", "denoise", "denoise_strength", "output_format",
        ])
        XCTAssertEqual(object["quality"] as? String, "max")
        XCTAssertEqual(object["drum_split"] as? Bool, true)
        XCTAssertEqual(object["vocal_split"] as? Bool, true)
        XCTAssertEqual(object["dereverb"] as? Bool, false)
        XCTAssertEqual(object["cleanup"] as? Bool, true)
        XCTAssertEqual(object["cleanup_strength"] as? String, "standard")
        XCTAssertEqual(object["denoise"] as? Bool, false)
        XCTAssertEqual(object["denoise_strength"] as? String, "standard")
        XCTAssertEqual(object["output_format"] as? String, "wav24")
    }

    func testCustomOptionsEncodeEveryField() throws {
        let options = JobOptions(
            quality: .fast,
            drumSplit: false,
            vocalSplit: false,
            dereverb: true,
            cleanup: false,
            cleanupStrength: .strong,
            denoise: true,
            denoiseStrength: .light,
            outputFormat: .wav32f
        )
        let object = try encodedObject(options)
        XCTAssertEqual(object["quality"] as? String, "fast")
        XCTAssertEqual(object["drum_split"] as? Bool, false)
        XCTAssertEqual(object["vocal_split"] as? Bool, false)
        XCTAssertEqual(object["dereverb"] as? Bool, true)
        XCTAssertEqual(object["cleanup"] as? Bool, false)
        XCTAssertEqual(object["cleanup_strength"] as? String, "strong")
        XCTAssertEqual(object["denoise"] as? Bool, true)
        XCTAssertEqual(object["denoise_strength"] as? String, "light")
        XCTAssertEqual(object["output_format"] as? String, "wav32f")

        let decoded = try StemMasterJSON.makeDecoder().decode(JobOptions.self, from: StemMasterJSON.makeEncoder().encode(options))
        XCTAssertEqual(decoded, options)
    }

    func testEncodingIsStableAndCompact() throws {
        let data = try StemMasterJSON.makeEncoder().encode(JobOptions())
        let text = String(decoding: data, as: UTF8.self)
        let expected = #"{"cleanup":true,"cleanup_strength":"standard","dereverb":false,"denoise":false,"#
            + #""denoise_strength":"standard","drum_split":true,"output_format":"wav24","quality":"max","vocal_split":true}"#
        XCTAssertEqual(text, expected, "sorted keys, no whitespace")
        XCTAssertFalse(text.contains("\n"), "the options form field is a single-line JSON string")
    }

    func testPartialOptionsTakeDefaultsPerField() throws {
        let options = try Fixtures.decode(JobOptions.self, from: #"{"quality": "fast", "denoise": true}"#)
        XCTAssertEqual(options.quality, .fast)
        XCTAssertTrue(options.denoise)
        XCTAssertTrue(options.drumSplit)
        XCTAssertTrue(options.vocalSplit)
        XCTAssertFalse(options.dereverb)
        XCTAssertTrue(options.cleanup)
        XCTAssertEqual(options.cleanupStrength, .standard)
        XCTAssertEqual(options.denoiseStrength, .standard)
        XCTAssertEqual(options.outputFormat, .wav24)

        XCTAssertEqual(try Fixtures.decode(JobOptions.self, from: "{}"), JobOptions())
    }

    func testOptionsSummary() {
        XCTAssertEqual(OptionText.summary(JobOptions()), "Max · Drum split · Lead/backing · Cleanup · WAV 24-bit")
        let fast = JobOptions(quality: .fast, drumSplit: false, vocalSplit: false, dereverb: true, cleanup: false, denoise: true, outputFormat: .wav16)
        XCTAssertEqual(OptionText.summary(fast), "Fast · Dry vocals · Denoise · WAV 16-bit")
    }
}
