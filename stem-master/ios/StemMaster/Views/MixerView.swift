import SwiftUI

/// Loads a completed session (downloads missing previews, builds the player), then shows the mixer.
@MainActor
struct MixerContainerView: View {
    let session: SessionRecord

    @Environment(AppModel.self) private var model
    @State private var player: StemPlayer?
    @State private var job: Job?
    @State private var loadError: String?
    @State private var attempt = 0

    var body: some View {
        Group {
            if let job, let player, player.isLoaded {
                MixerView(session: session, job: job, player: player)
            } else if let loadError {
                MixerLoadFailedView(message: loadError) {
                    attempt += 1
                }
            } else {
                MixerPreparingView(progress: model.previewProgress[session.id])
            }
        }
        .task(id: attempt) {
            await prepare()
        }
        .onDisappear {
            player?.shutdown()
        }
    }

    private func prepare() async {
        loadError = nil
        guard let job = model.store.job(for: session.id) else {
            loadError = "This session's stem list is missing. Delete it and run the separation again."
            return
        }
        self.job = job
        if let player, player.isLoaded { return }
        do {
            try await model.ensurePreviews(for: session.id)
            try Task.checkCancellation()
            let layout = MixerLayout(stems: job.stems)
            var urls: [String: URL] = [:]
            for stem in layout.playableStems {
                urls[stem.id] = model.store.previewURL(for: stem, sessionID: session.id)
            }
            let player = self.player ?? StemPlayer()
            try player.load(stems: layout.playableStems, fileURLs: urls, title: session.title)
            self.player = player
        } catch {
            if Task.isCancelled || APIError.from(error) == .cancelled { return }
            loadError = userFacingMessage(for: error)
        }
    }
}

/// Shown while previews download.
struct MixerPreparingView: View {
    let progress: BatchProgress?

    var body: some View {
        VStack(spacing: 20) {
            ProgressRing(
                progress: progress?.fraction ?? 0,
                caption: progress.map { "\($0.done) of \($0.total) stems" },
                indeterminate: progress == nil
            )
            .frame(width: 150, height: 150)
            Text("Loading stem previews")
                .font(.headline)
                .foregroundStyle(Color.smInk)
            Text("Lossless WAVs download when you export.")
                .font(.footnote)
                .foregroundStyle(Color.smMuted)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .screenBackground()
    }
}

/// Shown when previews could not be downloaded or opened.
struct MixerLoadFailedView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "waveform.badge.exclamationmark")
                .font(.system(size: 48))
                .foregroundStyle(Color.smAccent)
                .accessibilityHidden(true)
            Text("Couldn't load the stems")
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.smInk)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Color.smInk2)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Haptics.tap()
                retry()
            } label: {
                Label("Try Again", systemImage: "arrow.clockwise")
            }
            .buttonStyle(PrimaryButtonStyle())
            .frame(maxWidth: 260)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .screenBackground()
    }
}

/// The mixer: analysis header, stem sections (Vocals first), the collapsed removed section,
/// export actions, and the transport bar.
@MainActor
struct MixerView: View {
    let session: SessionRecord
    let job: Job
    let player: StemPlayer

    @Environment(AppModel.self) private var model
    @State private var showRemoved = false
    @State private var confirmDelete = false

    var body: some View {
        let layout = MixerLayout(stems: job.stems)
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                AnalysisHeader(session: session, job: job)

                if let message = player.errorMessage {
                    Label(message, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(Color.smDanger)
                        .panel(fill: Color.smDanger.opacity(0.12))
                }

                if player.hasSolo {
                    soloBanner
                }

                ForEach(layout.sections) { section in
                    StemSectionView(section: section, sessionID: session.id, player: player)
                }

                if !layout.removed.isEmpty {
                    removedSection(layout.removed)
                }

                exportFooter
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .screenBackground()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            TransportBar(player: player)
        }
        .navigationTitle(session.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        Haptics.tap()
                        player.resetMixer()
                    } label: {
                        Label("Reset Mixer", systemImage: "slider.horizontal.below.rectangle")
                    }
                    Button {
                        Task { await exportZIP() }
                    } label: {
                        Label("Export All (ZIP)", systemImage: "archivebox")
                    }
                    Divider()
                    Button(role: .destructive) {
                        confirmDelete = true
                    } label: {
                        Label("Delete Session", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .accessibilityLabel("More actions")
                }
            }
        }
        .confirmationDialog("Delete “\(session.title)”?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete Session", role: .destructive) {
                Haptics.warning()
                player.shutdown()
                model.delete(sessionID: session.id)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Removes the stems from this iPhone and from the server.")
        }
    }

    private var soloBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "s.circle.fill")
                .foregroundStyle(Color.smYellow)
            Text("Solo is on: only soloed stems are playing.")
                .font(.footnote)
                .foregroundStyle(Color.smInk2)
            Spacer(minLength: 8)
            Button("Clear") {
                Haptics.selection()
                for (id, state) in player.channelStates where state.isSoloed {
                    player.toggleSolo(id)
                }
            }
            .font(.footnote.weight(.semibold))
            .tint(Color.smYellow)
            .accessibilityLabel("Clear all solos")
        }
        .panel(padding: 12, fill: Color.smYellow.opacity(0.1))
    }

    private func removedSection(_ stems: [Stem]) -> some View {
        DisclosureGroup(isExpanded: $showRemoved) {
            VStack(alignment: .leading, spacing: 10) {
                Text("What Cleanup and Denoise took out, muted by default. Unmute to audition it: with every stem playing, the mixer sums back to the original track.")
                    .font(.footnote)
                    .foregroundStyle(Color.smMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
                ForEach(stems) { stem in
                    StemRowView(stem: stem, sessionID: session.id, player: player)
                }
            }
        } label: {
            SectionHeader(
                title: StemGroup.removed.title,
                systemImage: StemGroup.removed.systemImage,
                count: stems.count,
                tint: .smMuted
            )
        }
        .tint(Color.smInk2)
    }

    private var exportFooter: some View {
        let zipProgress = model.transferProgress(sessionID: session.id, item: "zip")
        let selection = model.selectionExportProgress[session.id]
        return VStack(spacing: 10) {
            Button {
                Haptics.tap()
                Task { await exportZIP() }
            } label: {
                if let zipProgress {
                    Label("Downloading ZIP… \(NumberFormatting.percent(zipProgress))", systemImage: "arrow.down.circle")
                } else {
                    Label("Export All (ZIP)", systemImage: "archivebox.fill")
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(zipProgress != nil)
            .accessibilityHint("Every stem as lossless WAV, plus manifest and readme")

            Button {
                Haptics.tap()
                Task { await exportSelection() }
            } label: {
                if let selection {
                    Label("Preparing \(min(selection.done + 1, selection.total)) of \(selection.total)…", systemImage: "arrow.down.circle")
                } else {
                    Label("Export Mixer Selection", systemImage: "square.and.arrow.up.on.square")
                }
            }
            .buttonStyle(SecondaryButtonStyle())
            .disabled(selection != nil)
            .accessibilityHint("Exports the WAVs of the stems you can currently hear")

            Text("Lossless \(job.options.outputFormat.title). Exports are also kept in the Files app under On My iPhone › Stem Master.")
                .font(.caption)
                .foregroundStyle(Color.smMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
        .padding(.top, 4)
    }

    private func exportZIP() async {
        do {
            let url = try await model.zipFile(sessionID: session.id)
            Haptics.success()
            ActivityPresenter.share([url])
        } catch {
            if APIError.from(error) == .cancelled { return }
            model.alert = AppAlert(title: "Couldn't export the ZIP", message: userFacingMessage(for: error))
            Haptics.error()
        }
    }

    private func exportSelection() async {
        let stems = MixerLayout.exportSelection(from: job.stems, states: player.channelStates)
        guard !stems.isEmpty else {
            model.alert = AppAlert(title: "Nothing to export", message: "Unmute (or solo) at least one stem, then try again.")
            Haptics.warning()
            return
        }
        do {
            let urls = try await model.losslessFiles(for: stems, sessionID: session.id)
            Haptics.success()
            ActivityPresenter.share(urls)
        } catch {
            if APIError.from(error) == .cancelled { return }
            model.alert = AppAlert(title: "Couldn't export the selection", message: userFacingMessage(for: error))
            Haptics.error()
        }
    }
}

/// One group of stems (header, mixer rows, export-only buses).
@MainActor
struct StemSectionView: View {
    let section: MixerLayout.Section
    let sessionID: UUID
    let player: StemPlayer

    private var tint: Color {
        switch section.group {
        case .vocals: return .smAccent
        case .drums: return .smTeal
        case .bass: return .smViolet
        case .instruments: return .smYellow
        case .removed, .unknown: return .smInk2
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(
                title: section.group.title,
                systemImage: section.group.systemImage,
                count: section.playable.count,
                tint: tint
            )
            ForEach(section.playable) { stem in
                StemRowView(stem: stem, sessionID: sessionID, player: player)
            }
            ForEach(section.buses) { stem in
                BusExportRow(stem: stem, sessionID: sessionID)
            }
        }
    }
}

/// A bus stem (e.g. the full drum kit when the kit is split): not in the mixer, export only.
@MainActor
struct BusExportRow: View {
    let stem: Stem
    let sessionID: UUID

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "square.stack.3d.down.right.fill")
                .foregroundStyle(Color.stem(stem))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(stem.name) (full)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.smInk)
                Text("Sum of the parts above · export only")
                    .font(.caption)
                    .foregroundStyle(Color.smMuted)
            }
            Spacer()
            StemShareButton(stem: stem, sessionID: sessionID)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: Theme.rowRadius, style: .continuous)
                .strokeBorder(Color.smPanel2, lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
    }
}
