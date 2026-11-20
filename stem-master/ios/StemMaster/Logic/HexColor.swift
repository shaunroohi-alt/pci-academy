import Foundation

/// An sRGB colour with 0...1 components.
struct RGBColor: Hashable, Sendable {
    let red: Double
    let green: Double
    let blue: Double
}

/// Parses the API's `#RRGGBB` stem colours.
enum HexColor {
    /// Accepts `#RRGGBB`, `RRGGBB` and the short `#RGB` form (case-insensitive).
    static func parse(_ hex: String) -> RGBColor? {
        var text = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.hasPrefix("#") { text.removeFirst() }
        if text.count == 3 {
            text = text.map { "\($0)\($0)" }.joined()
        }
        guard text.count == 6, text.allSatisfy(\.isHexDigit), let value = UInt32(text, radix: 16) else {
            return nil
        }
        return RGBColor(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
