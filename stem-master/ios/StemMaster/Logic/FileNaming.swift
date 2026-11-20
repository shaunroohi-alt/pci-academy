import Foundation

/// File naming rules for imported sources and exported stems.
enum FileNaming {
    /// Characters that are illegal or awkward in file names on iOS, macOS, Windows and in ZIPs.
    private static let forbidden = CharacterSet(charactersIn: "/\\:*?\"<>|")
        .union(.controlCharacters)
        .union(.newlines)

    /// A file-system-safe version of `name` (no path separators, no leading dots, at most
    /// `maxLength` characters and `maxBytes` UTF-8 bytes: file names are limited to 255 bytes,
    /// which 85 CJK characters already fill). Falls back to "Untitled".
    static func sanitize(_ name: String, maxLength: Int = 120, maxBytes: Int = 200) -> String {
        let cleaned = String(name.unicodeScalars.map { forbidden.contains($0) ? "_" : Character($0) })
        var result = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
        while result.hasPrefix(".") {
            result.removeFirst()
        }
        if result.count > maxLength {
            result = String(result.prefix(maxLength))
        }
        while result.utf8.count > maxBytes {
            result.removeLast()
        }
        result = result.trimmingCharacters(in: .whitespaces)
        return result.isEmpty ? "Untitled" : result
    }

    /// A safe file name that keeps the extension, e.g. `My:Song.mp3` -> `My_Song.mp3`.
    static func sanitizeKeepingExtension(_ filename: String) -> String {
        let url = URL(fileURLWithPath: filename)
        let ext = url.pathExtension
        let base = ext.isEmpty ? filename : String(filename.dropLast(ext.count + 1))
        let safeBase = sanitize(base, maxLength: 100)
        let safeExt = sanitize(ext, maxLength: 10)
        return ext.isEmpty ? safeBase : "\(safeBase).\(safeExt.lowercased())"
    }

    /// Track title shown in the library: the file name without its extension.
    static func title(fromFilename filename: String) -> String {
        let url = URL(fileURLWithPath: filename)
        let base = url.deletingPathExtension().lastPathComponent
        let trimmed = base.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? filename : trimmed
    }

    /// `"My Song - Lead Vocals (Dry).wav"`. A long title is shortened, never the stem name,
    /// so every stem of a track keeps its own file name.
    static func stemWAVName(trackTitle: String, stemName: String) -> String {
        "\(sanitize(trackTitle, maxLength: 100, maxBytes: 150)) - \(sanitize(stemName, maxLength: 60, maxBytes: 80)).wav"
    }

    /// `"My Song - Stem Master.zip"` (the server's ZIP naming, SPEC section 4).
    static func zipName(trackTitle: String) -> String {
        "\(sanitize(trackTitle, maxLength: 100, maxBytes: 150)) - Stem Master.zip"
    }

    /// Audio extensions the server decodes (SPEC section 4).
    static let supportedExtensions: Set<String> = ["mp3", "wav", "wave", "aif", "aiff", "aifc", "flac", "m4a", "mp4", "aac", "ogg", "oga", "opus"]

    /// MIME type sent with the upload, by file extension.
    static func mimeType(forPathExtension ext: String) -> String {
        switch ext.lowercased() {
        case "mp3": return "audio/mpeg"
        case "wav", "wave": return "audio/wav"
        case "aif", "aiff", "aifc": return "audio/aiff"
        case "flac": return "audio/flac"
        case "m4a", "mp4": return "audio/mp4"
        case "aac": return "audio/aac"
        case "ogg", "oga": return "audio/ogg"
        case "opus": return "audio/opus"
        default: return "application/octet-stream"
        }
    }
}
