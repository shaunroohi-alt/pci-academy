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
        case .max: return "Ensembles of the strongest RoFormer models: the cleanest stems, slower."
        case .fast: return "One model per stage: several times faster, slightly more bleed."
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
    static let cleanup = "Removes what doesn't belong in each stem: bleed from other instruments, noise between phrases, out-of-range rumble. Everything taken out is kept in a Removed Bleed stem."
    static let denoise = "Reduces the static noise floor, high-band shimmer/flicker and rumble that AI music generators leave behind. Removed audio goes to a Removed Noise stem."
    static let vocalFocus = "Vocals are separated first with a bleed-minimising ensemble, so the vocal stems stay clean and raw for editing on their own."

    static func cleanupStrength(_ strength: Strength) -> String {
        switch strength {
        case .light: return "Gentle: only removes obvious bleed."
        case .standard: return "Balanced cleanup for most mixes."
        case .strong: return "Aggressive: maximum isolation, may thin out busy passages."
        }
    }

    static func denoiseStrength(_ strength: Strength) -> String {
        switch strength {
        case .light: return "Subtle: only the steady noise floor."
        case .standard: return "Noise floor plus high-band flicker."
        case .strong: return "Maximum reduction for heavily artifacted tracks."
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
