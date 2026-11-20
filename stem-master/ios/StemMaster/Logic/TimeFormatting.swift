import Foundation

/// Clock-style time strings for the transport bar and analysis chips.
enum TimeFormatting {
    /// `0:00`, `3:07`, `59:59`, `1:02:03`. Fractions are truncated (a playhead at 9.99 s shows
    /// `0:09`); negative, NaN and infinite inputs show `0:00`.
    static func clock(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds > 0 else { return "0:00" }
        let total = Int(seconds.rounded(.down))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        if hours > 0 {
            return "\(hours):\(twoDigits(minutes)):\(twoDigits(secs))"
        }
        return "\(minutes):\(twoDigits(secs))"
    }

    /// Spoken form for VoiceOver, e.g. "3 minutes 7 seconds".
    static func spoken(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds > 0 else { return "0 seconds" }
        let total = Int(seconds.rounded(.down))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        var parts: [String] = []
        if hours > 0 { parts.append("\(hours) \(hours == 1 ? "hour" : "hours")") }
        if minutes > 0 { parts.append("\(minutes) \(minutes == 1 ? "minute" : "minutes")") }
        if secs > 0 || parts.isEmpty { parts.append("\(secs) \(secs == 1 ? "second" : "seconds")") }
        return parts.joined(separator: " ")
    }

    private static func twoDigits(_ value: Int) -> String {
        value < 10 ? "0\(value)" : "\(value)"
    }
}

/// Small number formatters shared by the views (locale-independent where the value is a
/// technical unit).
enum NumberFormatting {
    /// `92 BPM` style: whole numbers when the value is integral, else one decimal.
    static func bpm(_ value: Double) -> String {
        guard value.isFinite, value > 0 else { return "-" }
        let rounded = (value * 10).rounded() / 10
        if rounded == rounded.rounded() { return String(Int(rounded)) }
        return String(format: "%.1f", rounded)
    }

    /// `-9.1` (one decimal, explicit minus), for LUFS and dBFS values.
    static func decibels(_ value: Double) -> String {
        guard value.isFinite else { return "-inf" }
        return String(format: "%.1f", value)
    }

    /// `128.4 MB` style.
    static func bytes(_ count: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: max(0, count), countStyle: .file)
    }

    /// `42%`.
    static func percent(_ fraction: Double) -> String {
        guard fraction.isFinite else { return "0%" }
        return "\(Int((min(max(fraction, 0), 1) * 100).rounded()))%"
    }
}
