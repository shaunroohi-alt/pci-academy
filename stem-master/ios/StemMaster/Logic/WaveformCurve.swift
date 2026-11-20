import Foundation

/// Maps the API's linear 0...1 waveform peaks to bar heights.
enum WaveformCurve {
    /// A gentle power curve (exponent 0.7): quiet stems stay visible without hiding the level
    /// difference between loud and soft stems. Invalid input draws nothing; values above 1 clip.
    static func displayLevel(_ peak: Double) -> Double {
        guard peak.isFinite, peak > 0 else { return 0 }
        return min(1, pow(peak, 0.7))
    }
}
