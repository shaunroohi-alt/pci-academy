import SwiftUI

/// Home screen: the list of sessions, import and settings.
@MainActor
struct LibraryView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if model.store.sessions.isEmpty {
                EmptyLibraryView {
                    Haptics.tap()
                    model.isImporterPresented = true
                }
            } else {
                sessionList
            }
        }
        .screenBackground()
        .navigationTitle("Stem Master")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                BrandTitle()
            }
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    model.isSettingsPresented = true
                } label: {
                    Image(systemName: "gearshape")
                }
                .accessibilityLabel("Settings")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Haptics.tap()
                    model.isImporterPresented = true
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.title3)
                }
                .accessibilityLabel("Import a track")
            }
        }
    }

    private var sessionList: some View {
        List {
            Section {
                ForEach(model.store.sessions) { session in
                    NavigationLink(value: session.id) {
                        SessionRowView(
                            session: session,
                            uploadProgress: model.uploadProgress[session.id],
                            hasConnectionIssue: model.connectionIssues[session.id] != nil
                        )
                    }
                    .listRowBackground(Color.smPanel)
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            Haptics.warning()
                            model.delete(sessionID: session.id)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            } header: {
                Text("\(model.store.sessions.count) \(model.store.sessions.count == 1 ? "track" : "tracks")")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.smMuted)
            } footer: {
                Text("Swipe left to delete a session from this iPhone and the server.")
                    .font(.caption)
                    .foregroundStyle(Color.smMuted)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }
}

/// One session in the library.
struct SessionRowView: View {
    let session: SessionRecord
    let uploadProgress: Double?
    let hasConnectionIssue: Bool

    private var subtitle: String {
        switch session.state {
        case .completed:
            var parts: [String] = ["\(session.stemCount) stems"]
            if let duration = session.durationSeconds { parts.append(TimeFormatting.clock(duration)) }
            parts.append(session.options.outputFormat.shortTitle)
            return parts.joined(separator: " · ")
        case .uploading:
            return "Uploading \(NumberFormatting.percent(uploadProgress ?? 0))"
        case .queued:
            if let position = session.queuePosition { return "Position \(position) in the queue" }
            return "Waiting for the server"
        case .processing:
            let label = session.stageLabel?.isEmpty == false ? session.stageLabel! : StagePlan.title(for: session.stage)
            return "\(label) · \(NumberFormatting.percent(session.progress))"
        case .failed:
            return session.errorMessage ?? "Separation failed"
        case .cancelled:
            return "Cancelled"
        case .draft:
            return "Choose options to start"
        }
    }

    private var progress: Double? {
        switch session.state {
        case .uploading: return uploadProgress ?? 0
        case .processing: return session.progress
        default: return nil
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(session.title)
                    .font(.headline)
                    .foregroundStyle(Color.smInk)
                    .lineLimit(1)
                Spacer(minLength: 8)
                StatusBadge(state: session.state)
            }
            HStack(spacing: 6) {
                if hasConnectionIssue, session.state.isTrackedOnServer {
                    Image(systemName: "wifi.exclamationmark")
                        .foregroundStyle(Color.smYellow)
                        .accessibilityLabel("Reconnecting")
                }
                Text(subtitle)
                    .font(.footnote)
                    .monospacedDigit()
                    .foregroundStyle(session.state == .failed ? Color.smDanger : Color.smInk2)
                    .lineLimit(2)
            }
            if let progress {
                ProgressView(value: progress)
                    .tint(Color.smAccent)
                    .accessibilityHidden(true)
            }
            Text(session.createdAt, format: .dateTime.day().month(.abbreviated).hour().minute())
                .font(.caption2)
                .foregroundStyle(Color.smMuted)
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }
}

/// First-run state with a big Import button.
struct EmptyLibraryView: View {
    let onImport: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                Image(systemName: "waveform.badge.plus")
                    .font(.system(size: 64, weight: .semibold))
                    .foregroundStyle(Color.smAccent)
                    .padding(.top, 48)
                    .accessibilityHidden(true)
                VStack(spacing: 8) {
                    Text("Split any track into clean stems")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(Color.smInk)
                        .multilineTextAlignment(.center)
                    Text("Vocals, lead and backing, a fully separated drum kit, bass, guitar, keys and synths, with optional Cleanup and AI-artifact Denoise.")
                        .font(.subheadline)
                        .foregroundStyle(Color.smInk2)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button(action: onImport) {
                    Label("Import Audio", systemImage: "square.and.arrow.down")
                }
                .buttonStyle(PrimaryButtonStyle())
                .padding(.horizontal, 24)
                .accessibilityHint("Choose an MP3, WAV, AIFF, FLAC or M4A file")

                VStack(alignment: .leading, spacing: 12) {
                    FeatureLine(icon: "music.mic", tint: .smAccent, text: "Vocal-first separation keeps vocals clean and raw for editing.")
                    FeatureLine(icon: "metronome.fill", tint: .smTeal, text: "Drum split: kick, snare, toms, hi-hat, ride and crash.")
                    FeatureLine(icon: "sparkles", tint: .smViolet, text: "Cleanup removes bleed; Denoise removes AI-generation noise and shimmer.")
                    FeatureLine(icon: "square.and.arrow.up", tint: .smYellow, text: "Export lossless WAVs or a ZIP. You can also open audio from other apps with “Open in Stem Master”.")
                }
                .panel()
                .padding(.horizontal, 8)
            }
            .padding(Theme.gutter)
        }
    }
}

private struct FeatureLine: View {
    let icon: String
    let tint: Color
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(tint)
                .frame(width: 22)
                .accessibilityHidden(true)
            Text(text)
                .font(.footnote)
                .foregroundStyle(Color.smInk2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
