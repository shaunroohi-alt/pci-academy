import UIKit

extension PlatformHooks {
    /// The iOS implementations: Keychain for the API key, `UIApplication` background tasks for
    /// uploads, and haptics for completion/failure.
    @MainActor
    static func live() -> PlatformHooks {
        let keychain = Keychain.stemMaster
        return PlatformHooks(
            loadAPIKey: { keychain.string(for: Keychain.apiKeyAccount) },
            saveAPIKey: { value in try keychain.set(value, for: Keychain.apiKeyAccount) },
            beginBackgroundActivity: { name in BackgroundActivity.begin(name: name) },
            endBackgroundActivity: { token in BackgroundActivity.end(token) },
            feedback: { kind in
                switch kind {
                case .success: Haptics.success()
                case .warning: Haptics.warning()
                case .error: Haptics.error()
                }
            }
        )
    }
}

/// `UIApplication.beginBackgroundTask` bookkeeping with integer tokens.
///
/// Used while uploading so a track keeps uploading for a while after the user leaves the app.
/// Each task is ended exactly once: by the caller, or by the system's expiration handler.
@MainActor
enum BackgroundActivity {
    private static var identifiers: [Int: UIBackgroundTaskIdentifier] = [:]
    private static var nextToken = 1

    static func begin(name: String) -> Int {
        let token = nextToken
        nextToken += 1
        let identifier = UIApplication.shared.beginBackgroundTask(withName: name) {
            MainActor.assumeIsolated {
                BackgroundActivity.end(token)
            }
        }
        if identifier != .invalid {
            identifiers[token] = identifier
        }
        return token
    }

    static func end(_ token: Int) {
        guard let identifier = identifiers.removeValue(forKey: token) else { return }
        UIApplication.shared.endBackgroundTask(identifier)
    }
}

/// Haptic feedback for key actions.
@MainActor
enum Haptics {
    static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }

    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}

/// Presents the system share sheet (AirDrop, Save to Files, other apps) from the top-most view
/// controller, so it works from inside sheets too.
@MainActor
enum ActivityPresenter {
    static func share(_ urls: [URL]) {
        guard !urls.isEmpty, let presenter = topViewController() else { return }
        let controller = UIActivityViewController(activityItems: urls, applicationActivities: nil)
        if let popover = controller.popoverPresentationController {
            popover.sourceView = presenter.view
            popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY - 80, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        presenter.present(controller, animated: true)
    }

    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let activeScenes = scenes.filter { $0.activationState == .foregroundActive }
        let windows = (activeScenes.isEmpty ? scenes : activeScenes).flatMap(\.windows)
        let window = windows.first(where: \.isKeyWindow) ?? windows.first
        var top = window?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}
