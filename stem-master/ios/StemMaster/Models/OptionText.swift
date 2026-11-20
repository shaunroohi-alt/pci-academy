import Foundation

// Display titles and one-line explanations for the options sheet and Settings.

extension Quality {
    var title: String {
        switch self {
        case .max: return "Max"
        case .fast: return "Fast"
        }
    }

    var explanation: String {
        switch self {
        case .max: return "A three-model vocal ensemble and the highest overlap on every stage: the cleanest stems, slower."
        case .fast: return "One vocal model and half the overlap: faster, with slightly more bleed."
        }
    }
}

extension Strength {
    var title: String {
        switch self {
        case .light: return "Light"
        case .standard: return "Standard"
        case .strong: return "Strong"
        }
    }
}

extension OutputFormat {
    var title: String {
        switch self {
        case .wav24: return "WAV 24-bit"
        case .wav32f: return "WAV 32-bit float"
        case .wav16: return "WAV 16-bit"
        }
    }

    var shortTitle: String {
        switch self {
        case .wav24: return "24-bit"
        case .wav32f: return "32f"
        case .wav16: return "16-bit"
        }
    }

    var explanation: String {
        switch self {
        case .wav24: return "Studio standard. Lossless, ready for any DAW."
        case .wav32f: return "Floating point: never clips, keeps every bit of headroom."
        case .wav16: return "CD resolution, smallest files."
        }
    }
}

/// One-line explanations for the toggles.
enum OptionText {
    static let drumSplit = "Kick, snare, toms, hi-hat, ride and crash each on their own lane instead of one drum bus."
    static let vocalSplit = "Separates the lead vocal from harmonies, doubles and ad-libs."
    static let dereverb = "Takes the room and reverb off the vocals for a dry, raw take; the reverb gets its own stem."
    static let cleanup = "Removes bleed from other instruments and silences each stem between its notes. Everything removed is kept in a Removed Bleed stem you can audition."
    static let denoise = "Removes measurable hiss, sub-sonic rumble and high-band flicker, often found in AI-generated or old recordings. Results depend on the source: audio without measurable noise passes through unchanged. It does not target mains hum and does not remove watermarks. Everything removed goes to a Removed Noise stem you can audition."
    static let vocalFocus = "Vocals are separated first, with the vocal models that scored best in our measurements, so the vocal stems stay clean and raw enough to use on their own."

    static func cleanupStrength(_ strength: Strength) -> String {
        switch strength {
        case .light: return "Gentle: only removes obvious bleed."
        case .standard: return "Balanced cleanup for most mixes."
        case .strong: return "Aggressive: maximum isolation, may thin out busy passages."
        }
    }

    static func denoiseStrength(_ strength: Strength) -> String {
        switch strength {
        case .light: return "Gentle: acts only on clearly measured noise and flicker."
        case .standard: return "Balanced for most material."
        case .strong: return "Removes more where noise is measured; on dense stems it can also take some cymbal wash or air."
        }
    }

    /// Compact summary, e.g. "Max · Drum split · Lead/backing · Cleanup · WAV 24-bit".
    static func summary(_ options: JobOptions) -> String {
        var parts: [String] = [options.quality.title]
        if options.drumSplit { parts.append("Drum split") }
        if options.vocalSplit { parts.append("Lead/backing") }
        if options.dereverb { parts.append("Dry vocals") }
        if options.cleanup { parts.append("Cleanup") }
        if options.denoise { parts.append("Denoise") }
        parts.append(options.outputFormat.title)
        return parts.joined(separator: " · ")
    }
}

/// The artifact-level popover (SPEC section 2.3).
enum ArtifactText {
    static let whatIsMeasured = "Measures two things in the full mix: how noise-like the high band (4-16 kHz) is, and whether a static noise floor is audible in the quietest passages."
    static let notAuthorship = "It describes the sound, not who or what made the track."
    static let denoiseRelation = "Denoise does not lower this reading: a noise-like high band is usually part of the music itself, so Denoise leaves it in place and only removes noise it can measure apart from the music."

    /// The reported band-limit, rounded to 100 Hz.
    static func bandLimit(hertz: Double) -> String {
        "Band-limited near \(Int((hertz / 100).rounded()) * 100) Hz (reported only; MP3 and AAC files are often band-limited too)."
    }

    static var allText: String { [whatIsMeasured, notAuthorship, denoiseRelation].joined(separator: " ") }
}

extension ArtifactLabel {
    var title: String {
        switch self {
        case .low: return "Low"
        case .moderate: return "Moderate"
        case .high: return "High"
        case .unknown: return "Unrated"
        }
    }
}

extension ComputeDevice {
    var title: String {
        switch self {
        case .cuda: return "NVIDIA GPU (CUDA)"
        case .mps: return "Apple GPU (Metal)"
        case .cpu: return "CPU only"
        case .unknown: return "Unknown device"
        }
    }
}
