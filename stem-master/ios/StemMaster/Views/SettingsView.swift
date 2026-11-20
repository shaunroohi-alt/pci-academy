import SwiftUI

/// Server URL, API key, connection test, default options, storage and About.
@MainActor
struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var serverDraft = ""
    @State private var keyDraft = ""
    @State private var urlError: String?
    @State private var storageUsed: Int64 = 0
    @State private var downloadedBytes: Int64 = 0
    @State private var confirmClear = false
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case server
        case key
    }

    var body: some View {
        NavigationStack {
            Form {
                serverSection
                connectionSection
                Section {
                    NavigationLink {
                        DefaultOptionsView()
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Default Options")
                                .foregroundStyle(Color.smInk)
                            Text(OptionText.summary(model.settings.defaultOptions))
                                .font(.caption)
                                .foregroundStyle(Color.smMuted)
                        }
                    }
                } header: {
                    Text("Separation")
                } footer: {
                    Text("Pre-selected in the options sheet for every new import.")
                }
                .listRowBackground(Color.smPanel)
                storageSection
                aboutSection
            }
            .scrollContentBackground(.hidden)
            .background(Color.smBackground)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        commitDrafts()
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .onAppear {
                serverDraft = model.settings.serverURLString
                keyDraft = model.apiKey
                refreshStorage()
            }
            .onDisappear {
                commitDrafts()
            }
            .confirmationDialog("Clear downloaded audio?", isPresented: $confirmClear, titleVisibility: .visible) {
                Button("Clear \(NumberFormatting.bytes(downloadedBytes))", role: .destructive) {
                    Haptics.warning()
                    model.clearDownloadedAudio()
                    refreshStorage()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Removes previews, lossless stems and ZIPs from this iPhone. Your sessions stay, and stems download again on demand while the server keeps the job (24 hours).")
            }
        }
        .tint(Color.smAccent)
    }

    // MARK: Sections

    private var serverSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                Text("Server URL")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.smMuted)
                TextField("https://your-server.example.com", text: $serverDraft)
                    .keyboardType(.URL)
                    .textContentType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .focused($focusedField, equals: .server)
                    .onSubmit { commitServerURL() }
                    .foregroundStyle(Color.smInk)
                    .accessibilityLabel("Server URL")
                if let urlError {
                    Text(urlError)
                        .font(.caption)
                        .foregroundStyle(Color.smDanger)
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("API key")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.smMuted)
                SecureField("Only if your server requires one", text: $keyDraft)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .focused($focusedField, equals: .key)
                    .onSubmit { model.setAPIKey(keyDraft) }
                    .foregroundStyle(Color.smInk)
                    .accessibilityLabel("API key")
            }
            if !model.settings.isUsingBundledServer {
                Button("Use Default Server") {
                    Haptics.selection()
                    model.resetServerURL()
                    serverDraft = model.settings.serverURLString
                    urlError = nil
                }
            }
        } header: {
            Text("Server")
        } footer: {
            Text("Separation runs on a Stem Master GPU server. The API key is stored in the iOS Keychain. Plain http:// works for servers on your local network only.")
        }
        .listRowBackground(Color.smPanel)
    }

    private var connectionSection: some View {
        Section {
            Button {
                commitDrafts()
                Haptics.tap()
                Task { await model.testConnection() }
            } label: {
                HStack {
                    Label("Test Connection", systemImage: "antenna.radiowaves.left.and.right")
                    Spacer()
                    if model.connectionTest == .testing {
                        ProgressView()
                    }
                }
            }
            .disabled(model.connectionTest == .testing)

            switch model.connectionTest {
            case .idle, .testing:
                EmptyView()
            case let .success(health):
                VStack(alignment: .leading, spacing: 6) {
                    Label("Connected", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(Color.smTeal)
                        .font(.subheadline.weight(.semibold))
                    LabeledContent("Device", value: health.device.title)
                    LabeledContent("Server version", value: health.version)
                    LabeledContent("Jobs in queue", value: "\(health.queueLength)")
                    LabeledContent("API key required", value: health.authRequired ? "Yes" : "No")
                    if health.device == .cpu {
                        Text("This server has no GPU: separations will be slow.")
                            .font(.caption)
                            .foregroundStyle(Color.smYellow)
                    }
                }
                .font(.footnote)
                .accessibilityElement(children: .combine)
            case let .failure(message):
                Label(message, systemImage: "xmark.octagon.fill")
                    .font(.footnote)
                    .foregroundStyle(Color.smDanger)
            }
        } header: {
            Text("Connection")
        }
        .listRowBackground(Color.smPanel)
    }

    private var storageSection: some View {
        Section {
            LabeledContent("Total storage used", value: NumberFormatting.bytes(storageUsed))
            LabeledContent("Downloaded audio", value: NumberFormatting.bytes(downloadedBytes))
            Button("Clear Downloaded Audio", role: .destructive) {
                confirmClear = true
            }
            .disabled(downloadedBytes == 0)
            if let problem = model.store.lastError {
                Label(problem, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(Color.smYellow)
            }
        } header: {
            Text("Storage")
        } footer: {
            Text("Exported stems are also visible in the Files app under On My iPhone › Stem Master.")
        }
        .listRowBackground(Color.smPanel)
    }

    private var aboutSection: some View {
        Section {
            HStack(spacing: 14) {
                Image(systemName: "waveform.path")
                    .font(.title)
                    .foregroundStyle(Color.smAccent)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.smPanel2))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Stem Master")
                        .font(.headline)
                        .foregroundStyle(Color.smInk)
                    Text("by MP Audio")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.smAccent)
                }
            }
            .accessibilityElement(children: .combine)
            LabeledContent("Version", value: Self.versionString)
            Text("Studio-grade stem separation: vocal-first RoFormer ensembles, a fully split drum kit, auditable Cleanup and AI-artifact Denoise. Every removal is kept as its own stem, and the stems sum back to the original mix.")
                .font(.footnote)
                .foregroundStyle(Color.smInk2)
                .fixedSize(horizontal: false, vertical: true)
        } header: {
            Text("About")
        }
        .listRowBackground(Color.smPanel)
    }

    // MARK: Actions

    private func commitDrafts() {
        commitServerURL()
        model.setAPIKey(keyDraft)
    }

    private func commitServerURL() {
        let trimmed = serverDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed == model.settings.serverURLString {
            urlError = nil
            return
        }
        if model.setServerURL(trimmed) {
            serverDraft = model.settings.serverURLString
            urlError = nil
        } else {
            urlError = "Enter a valid http(s) address, e.g. https://stems.example.com"
            Haptics.error()
        }
    }

    private func refreshStorage() {
        storageUsed = model.store.storageUsedBytes()
        downloadedBytes = model.store.downloadedAudioBytes()
    }

    static var versionString: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }
}

/// Settings > Default Options.
@MainActor
struct DefaultOptionsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Form {
            OptionsFormSections(options: Binding(
                get: { model.settings.defaultOptions },
                set: { model.settings.defaultOptions = $0 }
            ))
            Section {
                Button("Restore Recommended Defaults") {
                    Haptics.selection()
                    model.settings.defaultOptions = JobOptions()
                }
            }
            .listRowBackground(Color.smPanel)
        }
        .scrollContentBackground(.hidden)
        .background(Color.smBackground)
        .navigationTitle("Default Options")
        .navigationBarTitleDisplayMode(.inline)
    }
}
