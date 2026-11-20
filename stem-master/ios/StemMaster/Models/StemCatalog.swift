import Foundation

/// The fixed stem catalogue (SPEC section 3) and the mixer layout derived from a job's stems.
enum StemCatalog {
    /// Catalogue ids in manifest/display order.
    static let orderedIDs: [String] = [
        "vocals", "lead_vocals", "backing_vocals", "vocals_dry", "vocal_reverb", "vocal_ambience",
        "drums", "kick", "snare", "toms", "hihat", "ride", "crash", "drum_room",
        "bass",
        "guitar", "piano", "other",
        "removed_bleed", "removed_noise",
    ]

    /// Colours from SPEC section 3, used when a stem's own colour is missing or malformed.
    static let colors: [String: String] = [
        "vocals": "#FF7A1A", "lead_vocals": "#FF7A1A", "backing_vocals": "#FFB066",
        "vocals_dry": "#FF9A4D", "vocal_reverb": "#C46A2B", "vocal_ambience": "#8F5A33",
        "drums": "#3AD6C5", "kick": "#3AD6C5", "snare": "#5BE3D5", "toms": "#2BA89B",
        "hihat": "#9CF0E6", "ride": "#77C9F0", "crash": "#4FA8E0", "drum_room": "#2D7F78",
        "bass": "#7C5CFF", "guitar": "#F5D547", "piano": "#E86AF0", "other": "#A0A7B4",
        "removed_bleed": "#5A5F6B", "removed_noise": "#454952",
    ]

    /// Groups in display order (Vocals first). `unknown` collects stems from a newer server.
    static let groupOrder: [StemGroup] = [.vocals, .drums, .bass, .instruments, .unknown, .removed]

    /// Position of `id` in the catalogue; unknown ids sort last.
    static func sortIndex(of id: String) -> Int {
        orderedIDs.firstIndex(of: id) ?? orderedIDs.count
    }

    /// Stable sort into catalogue order (unknown ids keep their relative order at the end).
    static func sorted(_ stems: [Stem]) -> [Stem] {
        stems.enumerated()
            .sorted { lhs, rhs in
                let left = sortIndex(of: lhs.element.id)
                let right = sortIndex(of: rhs.element.id)
                return left == right ? lhs.offset < rhs.offset : left < right
            }
            .map(\.element)
    }

    /// The stem's own colour if it parses, else the catalogue colour, else neutral grey.
    static func colorHex(for stem: Stem) -> String {
        if HexColor.parse(stem.color) != nil { return stem.color }
        return colors[stem.id] ?? "#A0A7B4"
    }
}

extension StemGroup {
    /// Section header shown in the mixer.
    var title: String {
        switch self {
        case .vocals: return "Vocals"
        case .drums: return "Drums"
        case .bass: return "Bass"
        case .instruments: return "Instruments"
        case .removed: return "Removed by Cleanup/Denoise"
        case .unknown: return "Other"
        }
    }

    /// SF Symbol for the section header.
    var systemImage: String {
        switch self {
        case .vocals: return "music.mic"
        case .drums: return "metronome.fill"
        case .bass: return "waveform.path"
        case .instruments: return "pianokeys"
        case .removed: return "scissors"
        case .unknown: return "music.note"
        }
    }
}

/// How a completed job's stems are arranged in the mixer.
struct MixerLayout: Equatable, Sendable {
    struct Section: Identifiable, Equatable, Sendable {
        let group: StemGroup
        /// Primary stems: loaded into the mixer with mute/solo/volume.
        let playable: [Stem]
        /// Bus stems (sum of primaries): export only.
        let buses: [Stem]

        var id: String { group.rawValue }
    }

    /// Vocals, drums, bass, instruments (and `unknown`), in that order, empty groups omitted.
    let sections: [Section]
    /// `role == removed` stems, shown in the collapsed "Removed by Cleanup/Denoise" section.
    let removed: [Stem]

    init(stems: [Stem]) {
        let ordered = StemCatalog.sorted(stems)
        var sections: [Section] = []
        for group in StemCatalog.groupOrder where group != .removed {
            let inGroup = ordered.filter { $0.group == group && $0.role != .removed }
            let playable = inGroup.filter { $0.role == .primary }
            let buses = inGroup.filter { $0.role == .bus }
            if !playable.isEmpty || !buses.isEmpty {
                sections.append(Section(group: group, playable: playable, buses: buses))
            }
        }
        self.sections = sections
        self.removed = ordered.filter { $0.role == .removed }
    }

    /// Every stem the player loads, in display order.
    var playableStems: [Stem] { sections.flatMap(\.playable) + removed }

    /// Primary stems that are currently audible (respecting mute and solo): the
    /// "Export Mixer Selection" set.
    static func exportSelection(from stems: [Stem], states: [String: MixerChannelState]) -> [Stem] {
        let primaries = StemCatalog.sorted(stems).filter { $0.role == .primary }
        let anySolo = states.values.contains { $0.isSoloed }
        return primaries.filter { stem in
            let state = states[stem.id] ?? MixerChannelState()
            return MixerGain.isAudible(state, anySolo: anySolo)
        }
    }
}
