import SwiftUI
import UniformTypeIdentifiers

/// MP Audio graphite + signal orange. Named colours live in Assets.xcassets.
extension Color {
    static let smBackground = Color("Background")
    static let smPanel = Color("Panel")
    static let smPanel2 = Color("Panel2")
    static let smInk = Color("Ink")
    static let smInk2 = Color("Ink2")
    static let smMuted = Color("Muted")
    static let smTeal = Color("Teal")
    static let smAccent = Color("AccentColor")
    static let smViolet = Color(hex: "#7C5CFF")
    static let smYellow = Color(hex: "#F5D547")
    static let smDanger = Color(hex: "#FF5A52")

    /// `#RRGGBB` (as sent by the API), falling back to neutral grey.
    init(hex: String) {
        let rgb = HexColor.parse(hex) ?? RGBColor(red: 0.63, green: 0.65, blue: 0.71)
        self.init(.sRGB, red: rgb.red, green: rgb.green, blue: rgb.blue, opacity: 1)
    }

    /// The colour of a stem (its own, else the catalogue colour).
    static func stem(_ stem: Stem) -> Color {
        Color(hex: StemCatalog.colorHex(for: stem))
    }
}

enum Theme {
    static let panelRadius: CGFloat = 16
    static let rowRadius: CGFloat = 14
    static let gutter: CGFloat = 16
}

/// Rounded graphite panel.
struct PanelModifier: ViewModifier {
    var padding: CGFloat = 16
    var fill: Color = .smPanel

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: Theme.panelRadius, style: .continuous)
                    .fill(fill)
            )
    }
}

extension View {
    func panel(padding: CGFloat = 16, fill: Color = .smPanel) -> some View {
        modifier(PanelModifier(padding: padding, fill: fill))
    }

    /// Full-bleed graphite background behind the view.
    func screenBackground() -> some View {
        background(Color.smBackground.ignoresSafeArea())
    }
}

/// Big filled call-to-action button.
struct PrimaryButtonStyle: ButtonStyle {
    var tint: Color = .smAccent

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(Color.smBackground)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(
                RoundedRectangle(cornerRadius: Theme.rowRadius, style: .continuous)
                    .fill(tint.opacity(configuration.isPressed ? 0.75 : 1))
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// Outlined secondary button.
struct SecondaryButtonStyle: ButtonStyle {
    var tint: Color = .smInk

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(tint)
            .frame(maxWidth: .infinity, minHeight: 46)
            .background(
                RoundedRectangle(cornerRadius: Theme.rowRadius, style: .continuous)
                    .fill(Color.smPanel2.opacity(configuration.isPressed ? 0.7 : 1))
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.rowRadius, style: .continuous)
                    .strokeBorder(Color.smMuted.opacity(0.35), lineWidth: 1)
            )
    }
}

/// Audio types offered in the Files picker (the server decodes mp3 wav aiff flac m4a aac ogg opus).
enum ImportableAudio {
    static let contentTypes: [UTType] = {
        var types: [UTType] = [.audio, .mp3, .wav, .aiff, .mpeg4Audio]
        let identifiers = ["org.xiph.flac", "public.aac-audio", "org.xiph.ogg-vorbis", "org.xiph.opus"]
        types.append(contentsOf: identifiers.compactMap { UTType($0) })
        let extensions = ["flac", "ogg", "oga", "opus", "aac"]
        types.append(contentsOf: extensions.compactMap { UTType(filenameExtension: $0, conformingTo: .audio) })
        var seen = Set<String>()
        return types.filter { seen.insert($0.identifier).inserted }
    }()
}
