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
