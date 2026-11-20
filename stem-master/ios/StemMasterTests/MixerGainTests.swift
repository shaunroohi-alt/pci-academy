import Foundation
import XCTest
@testable import StemMaster

/// Mute/solo/volume resolution (DAW convention: solo isolates, mute always wins).
final class MixerGainTests: XCTestCase {
    private func channel(muted: Bool = false, soloed: Bool = false, volume: Float = 1) -> MixerChannelState {
        MixerChannelState(isMuted: muted, isSoloed: soloed, volume: volume)
    }

    func testNoMuteNoSoloPlaysEverythingAtFaderVolume() {
        XCTAssertEqual(MixerGain.resolve([channel(), channel(volume: 0.5), channel(volume: 0)]), [1, 0.5, 0])
    }

    func testMuteSilencesOnlyThatChannel() {
        XCTAssertEqual(MixerGain.resolve([channel(muted: true), channel(), channel(volume: 0.25)]), [0, 1, 0.25])
    }

    func testSoloIsolatesSoloedChannels() {
        XCTAssertEqual(MixerGain.resolve([channel(soloed: true), channel(), channel()]), [1, 0, 0])
        XCTAssertEqual(MixerGain.resolve([channel(soloed: true, volume: 0.5), channel(), channel(soloed: true)]), [0.5, 0, 1])
    }

    func testMuteWinsOverSolo() {
        // A muted soloed channel is silent, and still counts as "a solo is active".
        XCTAssertEqual(MixerGain.resolve([channel(muted: true, soloed: true), channel(), channel()]), [0, 0, 0])
        XCTAssertEqual(MixerGain.resolve([channel(muted: true, soloed: true), channel(soloed: true), channel()]), [0, 1, 0])
    }

    /// Exhaustive matrix for one channel against a second, unmuted/unsoloed channel.
    func testTruthTable() {
        for muted in [false, true] {
            for soloed in [false, true] {
                for otherSoloed in [false, true] {
                    let gains = MixerGain.resolve([channel(muted: muted, soloed: soloed), channel(soloed: otherSoloed)])
                    let anySolo = soloed || otherSoloed
                    let expectedAudible = !muted && (!anySolo || soloed)
                    XCTAssertEqual(gains[0], expectedAudible ? 1 : 0, "muted=\(muted) soloed=\(soloed) otherSoloed=\(otherSoloed)")
                    XCTAssertEqual(gains[1], (!anySolo || otherSoloed) ? 1 : 0)
                }
            }
        }
    }

    func testVolumeIsClamped() {
        XCTAssertEqual(MixerGain.resolve([channel(volume: 2), channel(volume: -1), channel(volume: .nan)]), [1, 0, 0])
    }

    func testDictionaryResolution() {
        let gains = MixerGain.resolve([
            "lead_vocals": channel(soloed: true, volume: 0.8),
            "backing_vocals": channel(),
            "removed_bleed": channel(muted: true),
        ])
        XCTAssertEqual(gains["lead_vocals"], 0.8)
        XCTAssertEqual(gains["backing_vocals"], 0)
        XCTAssertEqual(gains["removed_bleed"], 0)
    }

    func testRemovedStemsStartMuted() {
        XCTAssertTrue(MixerChannelState.initial(for: .removed).isMuted)
        XCTAssertFalse(MixerChannelState.initial(for: .primary).isMuted)
        XCTAssertEqual(MixerChannelState.initial(for: .primary).volume, 1)
    }

    func testExportSelectionFollowsWhatIsAudible() {
        let stems = [
            Fixtures.stem("lead_vocals", group: .vocals, role: .primary),
            Fixtures.stem("backing_vocals", group: .vocals, role: .primary),
            Fixtures.stem("vocals", group: .vocals, role: .bus),
            Fixtures.stem("bass", group: .bass, role: .primary),
            Fixtures.stem("removed_bleed", group: .removed, role: .removed),
        ]
        var states: [String: MixerChannelState] = [
            "lead_vocals": .initial(for: .primary),
            "backing_vocals": .initial(for: .primary),
            "bass": .initial(for: .primary),
            "removed_bleed": .initial(for: .removed),
        ]
        XCTAssertEqual(MixerLayout.exportSelection(from: stems, states: states).map(\.id), ["lead_vocals", "backing_vocals", "bass"])

        states["bass"]?.isMuted = true
        XCTAssertEqual(MixerLayout.exportSelection(from: stems, states: states).map(\.id), ["lead_vocals", "backing_vocals"])

        states["lead_vocals"]?.isSoloed = true
        XCTAssertEqual(MixerLayout.exportSelection(from: stems, states: states).map(\.id), ["lead_vocals"])

        // Removed stems are never part of the export selection, even when audible.
        states["removed_bleed"] = MixerChannelState(isMuted: false, isSoloed: true, volume: 1)
        XCTAssertEqual(MixerLayout.exportSelection(from: stems, states: states).map(\.id), ["lead_vocals"])
    }

    func testMixerLayoutGroupsAndOrder() {
        let stems = [
            Fixtures.stem("removed_noise", group: .removed, role: .removed),
            Fixtures.stem("bass", group: .bass, role: .primary),
            Fixtures.stem("kick", group: .drums, role: .primary),
            Fixtures.stem("drums", group: .drums, role: .bus),
            Fixtures.stem("other", group: .instruments, role: .primary),
            Fixtures.stem("snare", group: .drums, role: .primary),
            Fixtures.stem("lead_vocals", group: .vocals, role: .primary),
            Fixtures.stem("vocals", group: .vocals, role: .bus),
            Fixtures.stem("guitar", group: .instruments, role: .primary),
        ]
        let layout = MixerLayout(stems: stems)
        XCTAssertEqual(layout.sections.map(\.group), [.vocals, .drums, .bass, .instruments])
        XCTAssertEqual(layout.sections[0].playable.map(\.id), ["lead_vocals"])
        XCTAssertEqual(layout.sections[0].buses.map(\.id), ["vocals"])
        XCTAssertEqual(layout.sections[1].playable.map(\.id), ["kick", "snare"])
        XCTAssertEqual(layout.sections[1].buses.map(\.id), ["drums"])
        XCTAssertEqual(layout.sections[3].playable.map(\.id), ["guitar", "other"])
        XCTAssertEqual(layout.removed.map(\.id), ["removed_noise"])
        XCTAssertEqual(layout.playableStems.map(\.id), ["lead_vocals", "kick", "snare", "bass", "guitar", "other", "removed_noise"])
    }
}
