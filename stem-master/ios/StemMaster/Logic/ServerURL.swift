import Foundation

/// Server base-URL normalisation and resolution of the API's relative URLs.
enum ServerURL {
    /// Normalises what a user typed into a base URL:
    ///
    /// * trims whitespace; empty input is invalid,
    /// * a missing scheme becomes `https://`,
    /// * scheme and host are lower-cased; only `http` and `https` are accepted,
    /// * trailing slashes, the query and the fragment are removed,
    /// * a path prefix is kept (`https://host/stem-master`), for servers behind a reverse proxy,
    /// * a pasted API path is cut off (`https://host/v1/health` -> `https://host`): every API
    ///   path starts with `/v1`, so a base URL ending in one would request `/v1/v1/...`.
    ///
    /// Returns `nil` when the result is not a usable http(s) URL with a host.
    static func normalize(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.contains("://") {
            text = "https://" + text
        }
        guard var components = URLComponents(string: text) else { return nil }
        guard let scheme = components.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            return nil
        }
        guard let host = components.host, !host.isEmpty else { return nil }
        components.scheme = scheme
        components.host = host.lowercased()
        var path = components.path
        while path.hasSuffix("/") {
            path.removeLast()
        }
        var searchStart = path.startIndex
        while let api = path.range(of: "/v1", range: searchStart..<path.endIndex) {
            if api.upperBound == path.endIndex || path[api.upperBound] == "/" {
                path = String(path[..<api.lowerBound])
                break
            }
            searchStart = api.upperBound
        }
        components.path = path
        components.query = nil
        components.fragment = nil
        return components.url
    }

    /// The normalised URL as a string, or `nil` if invalid.
    static func normalizedString(_ raw: String) -> String? {
        normalize(raw)?.absoluteString
    }

    /// Resolves an API path (`/v1/jobs/{id}/stems/vocals.wav`) against the base URL, keeping the
    /// base URL's path prefix. Absolute `http(s)` URLs are returned unchanged.
    static func resolve(_ path: String, against base: URL) -> URL? {
        let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = trimmed.lowercased()
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") {
            return URL(string: trimmed)
        }
        var baseString = base.absoluteString
        while baseString.hasSuffix("/") {
            baseString.removeLast()
        }
        let suffix = trimmed.hasPrefix("/") ? trimmed : "/" + trimmed
        return URL(string: baseString + suffix)
    }
}
