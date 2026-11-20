import Foundation

/// JSON coders configured for the Stem Master API and the app's on-disk files.
///
/// Keys are mapped by explicit `CodingKeys` on each model. Dates are ISO-8601 UTC; the server
/// sends whole seconds (`2026-11-20T10:00:00Z`) but fractional seconds and numeric offsets are
/// accepted too so a server-side formatting change cannot break decoding.
enum StemMasterJSON {
    static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = ISO8601Timestamp.parse(raw) else {
                throw DecodingError.dataCorruptedError(
                    in: container,
                    debugDescription: "Expected an ISO-8601 timestamp, got \"\(raw)\"."
                )
            }
            return date
        }
        return decoder
    }

    static func makeEncoder(pretty: Bool = false) -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(ISO8601Timestamp.format(date))
        }
        encoder.outputFormatting = pretty ? [.sortedKeys, .prettyPrinted] : [.sortedKeys]
        return encoder
    }
}

/// ISO-8601 parsing/formatting tolerant of the variants Python emits.
enum ISO8601Timestamp {
    private static let wholeSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let fractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let lock = NSLock()

    /// Parses `2026-11-20T10:00:00Z`, `2026-11-20T10:00:00.123456Z` and `...+00:00`.
    static func parse(_ raw: String) -> Date? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        lock.lock()
        defer { lock.unlock() }
        if let date = wholeSeconds.date(from: text) { return date }
        if let date = fractionalSeconds.date(from: text) { return date }
        // Some formatter builds reject more than 3 fractional digits: drop the fraction.
        if let dot = text.firstIndex(of: "."), let tz = text[dot...].firstIndex(where: { $0 == "Z" || $0 == "+" || $0 == "-" }) {
            let trimmed = String(text[..<dot]) + String(text[tz...])
            return wholeSeconds.date(from: trimmed)
        }
        return nil
    }

    /// Formats with whole seconds unless the date carries a sub-second part.
    static func format(_ date: Date) -> String {
        let seconds = date.timeIntervalSince1970
        let hasFraction = abs(seconds - seconds.rounded()) >= 0.0005
        lock.lock()
        defer { lock.unlock() }
        return hasFraction ? fractionalSeconds.string(from: date) : wholeSeconds.string(from: date)
    }
}
