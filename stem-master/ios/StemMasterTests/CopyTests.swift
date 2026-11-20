import Foundation
import XCTest
@testable import StemMaster

/// User-facing claims must match what the server measurably does (SPEC sections 2.1-2.3).
final class CopyTests: XCTestCase {
    func testDenoiseCopyStatesWhatItRemovesAndWhatItDoesNot() {
        let text = OptionText.denoise.lowercased()
        for phrase in ["hiss", "rumble", "flicker", "ai-generated", "old recordings", "depend", "watermark", "removed noise"] {
            XCTAssertTrue(text.contains(phrase), "Denoise copy must mention \(phrase)")
        }
        // The DSP has no hum filter: a 60 Hz hum at -30 dB comes out unchanged (0.00 dB).
        XCTAssertTrue(text.contains("does not target mains hum"), "Denoise must not claim to remove hum")
        XCTAssertFalse(text.contains("leave behind"), "no claim that AI generators leave this behind")
    }

    func testDenoiseStrengthCopyDoesNotPromiseFixedStages() {
        // Every strength runs the same measured stages; only thresholds and depth change.
        XCTAssertFalse(OptionText.denoiseStrength(.light).lowercased().contains("only the steady noise floor"))
        XCTAssertFalse(OptionText.denoiseStrength(.strong).lowercased().contains("heavily artifacted"))
    }

    func testCleanupCopy() {
        let text = OptionText.cleanup.lowercased()
        for phrase in ["bleed from other instruments", "between its notes", "everything removed", "removed bleed", "audition"] {
            XCTAssertTrue(text.contains(phrase), "Cleanup copy must mention \(phrase)")
        }
    }

    func testArtifactLevelCopyDescribesTheMeasurementOnly() {
        let measured = ArtifactText.whatIsMeasured.lowercased()
        XCTAssertTrue(measured.contains("noise-like"))
        XCTAssertTrue(measured.contains("high band"))
        XCTAssertTrue(measured.contains("noise floor"))
        XCTAssertFalse(measured.contains("flicker"), "flicker is measured but not part of the level (SPEC 2.3)")
        XCTAssertFalse(measured.contains("cut-off"), "the band-limit is reported only (SPEC 2.3)")

        let all = ArtifactText.allText.lowercased()
        for banned in ["ai ", "ai-", "neural", "generator", "generated", "codec"] {
            XCTAssertFalse(all.contains(banned), "the artifact popover must not suggest authorship (\(banned))")
        }
        XCTAssertTrue(ArtifactText.notAuthorship.lowercased().contains("not who or what made"))

        let denoise = ArtifactText.denoiseRelation.lowercased()
        XCTAssertTrue(denoise.contains("does not"), "it must not imply that Denoise lowers the reading")
        XCTAssertFalse(denoise.contains("turn on"))
        XCTAssertTrue(ArtifactText.bandLimit(hertz: 16_040).contains("16000 Hz"))
    }

    func testVocalAndQualityCopy() {
        // Fast quality uses one vocal model, so the shared vocal note cannot promise an ensemble.
        XCTAssertFalse(OptionText.vocalFocus.lowercased().contains("ensemble"))
        XCTAssertTrue(Quality.max.explanation.lowercased().contains("vocal ensemble"))
        XCTAssertFalse(Quality.fast.explanation.lowercased().contains("several times"))
    }

    func testDenoiseStageTitleMakesNoAIClaim() {
        XCTAssertFalse(StagePlan.title(for: .denoise).contains("AI"))
        XCTAssertFalse(StagePlan.detail(for: .denoise).contains("AI"))
    }
}
