import Foundation
import Observation

/// User preferences, persisted in `UserDefaults`: the server URL (defaulting to the build's
/// `SMDefaultServerURL`) and the default processing options for new imports.
/// The API key is not stored here; it lives in the Keychain.
@Observable
@MainActor
final class AppSettings {
    enum Keys {
        static let serverURL = "SMServerURL"
        static let defaultOptions = "SMDefaultOptions"
    }

    /// Used when Info.plist carries no usable `SMDefaultServerURL`.
    nonisolated static let fallbackServerURL = "https://mpindahouse-stem-master.hf.space"

    /// The default server baked in at build time (`STEM_MASTER_SERVER_URL`), normalised.
    nonisolated static func bundledServerURL(bundle: Bundle = .main) -> String {
        if let raw = bundle.object(forInfoDictionaryKey: "SMDefaultServerURL") as? String,
           !raw.contains("$("),
           let normalized = ServerURL.normalizedString(raw) {
            return normalized
        }
        return fallbackServerURL
    }

    /// Exactly what the user entered (normalised on commit by `AppModel`).
    var serverURLString: String {
        didSet { defaults.set(serverURLString, forKey: Keys.serverURL) }
    }

    /// Options pre-selected in the options sheet for new imports.
    var defaultOptions: JobOptions {
        didSet {
            if let data = try? StemMasterJSON.makeEncoder().encode(defaultOptions) {
                defaults.set(data, forKey: Keys.defaultOptions)
            }
        }
    }

    @ObservationIgnored let bundledServerURL: String
    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard, bundle: Bundle = .main) {
        self.defaults = defaults
        let bundled = AppSettings.bundledServerURL(bundle: bundle)
        self.bundledServerURL = bundled
        let stored = defaults.string(forKey: Keys.serverURL)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.serverURLString = stored.isEmpty ? bundled : stored
        if let data = defaults.data(forKey: Keys.defaultOptions),
           let options = try? StemMasterJSON.makeDecoder().decode(JobOptions.self, from: data) {
            self.defaultOptions = options
        } else {
            self.defaultOptions = JobOptions()
        }
    }

    /// The normalised base URL, or `nil` if the entry is unusable.
    var serverURL: URL? { ServerURL.normalize(serverURLString) }

    var isUsingBundledServer: Bool { serverURL?.absoluteString == bundledServerURL }
}

/// The random per-install id sent as `X-Client-Id` (SPEC section 4).
enum ClientIdentity {
    static let defaultsKey = "SMClientID"

    /// Returns the persisted id, creating it on first use.
    static func current(defaults: UserDefaults = .standard) -> String {
        if let existing = defaults.string(forKey: defaultsKey), UUID(uuidString: existing) != nil {
            return existing.lowercased()
        }
        let created = UUID().uuidString.lowercased()
        defaults.set(created, forKey: defaultsKey)
        return created
    }
}
