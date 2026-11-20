import Foundation

/// User-controlled state of one mixer channel.
struct MixerChannelState: Hashable, Sendable {
    var isMuted: Bool = false
    var isSoloed: Bool = false
    /// Linear fader gain, 0...`MixerGain.maxVolume`. 1 = unity (stems sum to the mix at unity).
    var volume: Float = 1

    /// Initial state for a stem: removed stems (what Cleanup/Denoise took out) start muted.
    static func initial(for role: StemRole) -> MixerChannelState {
        MixerChannelState(isMuted: role == .removed, isSoloed: false, volume: 1)
    }
}

/// Pure gain resolution for mute/solo/volume, following the usual DAW convention:
///
/// * If any channel is soloed, only soloed channels are audible.
/// * Mute always wins: a muted channel is silent even when it is soloed.
/// * An audible channel plays at its fader volume (clamped to 0...maxVolume).
/// A short stepped fade for gain changes. An instant jump of a channel's volume (mute, solo)
/// is audible as a click; `StemPlayer` applies these values one by one instead.
///
/// shortcut: the mixer reads its volume once per render cycle (about 5-23 ms on iOS), so this
/// is a few steps, not a sample-accurate ramp. Upgrade to AU parameter ramps if clicks remain.
enum GainRamp {
    static let steps = 8
    static let stepSeconds = 0.008

    /// The values to apply, in order; the last one is exactly `target`.
    static func values(from start: Float, to target: Float) -> [Float] {
        guard start != target else { return [target] }
        return (1...steps).map { step in
            step == steps ? target : start + (target - start) * Float(step) / Float(steps)
        }
    }
}

enum MixerGain {
    static let maxVolume: Float = 1

    static func clampedVolume(_ volume: Float) -> Float {
        guard volume.isFinite else { return 0 }
        return Swift.min(Swift.max(volume, 0), maxVolume)
    }

    static func isAudible(_ channel: MixerChannelState, anySolo: Bool) -> Bool {
        if channel.isMuted { return false }
        return anySolo ? channel.isSoloed : true
    }

    /// Effective output gain per channel, in input order.
    static func resolve(_ channels: [MixerChannelState]) -> [Float] {
        let anySolo = channels.contains { $0.isSoloed }
        return channels.map { isAudible($0, anySolo: anySolo) ? clampedVolume($0.volume) : 0 }
    }

    /// Effective output gain per channel id.
    static func resolve(_ channels: [String: MixerChannelState]) -> [String: Float] {
        let anySolo = channels.values.contains { $0.isSoloed }
        return channels.mapValues { isAudible($0, anySolo: anySolo) ? clampedVolume($0.volume) : 0 }
    }
}
