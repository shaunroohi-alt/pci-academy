import SwiftUI

/// Navigation stack, sheets, the Files importer, alerts and scene-phase handling.
@MainActor
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var model = model
        NavigationStack(path: $model.path) {
            LibraryView()
                .navigationDestination(for: UUID.self) { sessionID in
                    SessionDetailView(sessionID: sessionID)
                }
        }
        .overlay(alignment: .bottom) {
            if model.isImporting {
                ImportingBanner()
                    .padding(.bottom, 24)
            }
        }
        .fileImporter(
            isPresented: $model.isImporterPresented,
            allowedContentTypes: ImportableAudio.contentTypes
        ) { result in
            switch result {
            case let .success(url):
                model.importAudio(from: url)
            case let .failure(error):
                model.alert = AppAlert(title: "Couldn't open the file", message: error.localizedDescription)
            }
        }
        .sheet(item: $model.optionsRequest) { request in
            OptionsSheet(request: request)
        }
        .sheet(isPresented: $model.isSettingsPresented) {
            SettingsView()
        }
        .alert(
            model.alert?.title ?? "",
            isPresented: Binding(
                get: { model.alert != nil },
                set: { isPresented in
                    if !isPresented { model.alert = nil }
                }
            ),
            presenting: model.alert
        ) { _ in
            Button("OK", role: .cancel) {}
        } message: { alert in
            Text(alert.message)
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                model.appDidBecomeActive()
            case .background:
                model.appDidEnterBackground()
            case .inactive:
                break
            @unknown default:
                break
            }
        }
    }
}

/// Shown while an imported file is copied (or downloaded from iCloud Drive first).
struct ImportingBanner: View {
    var body: some View {
        HStack(spacing: 10) {
            ProgressView()
            Text("Importing the track…")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.smInk)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Capsule().fill(Color.smPanel2))
        .accessibilityElement(children: .combine)
    }
}
