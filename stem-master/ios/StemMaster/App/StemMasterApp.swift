import SwiftUI

/// Stem Master by MP Audio.
@main
@MainActor
struct StemMasterApp: App {
    @State private var model = AppModel(hooks: .live())

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(.dark)
                .tint(Color.smAccent)
                .onOpenURL { url in
                    // "Open in Stem Master" from Files, Mail, AirDrop, ...
                    guard url.isFileURL else { return }
                    model.importAudio(from: url)
                }
        }
    }
}
