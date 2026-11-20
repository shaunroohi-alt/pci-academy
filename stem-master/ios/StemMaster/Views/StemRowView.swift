import SwiftUI

/// One mixer channel: colour bar, name, M/S, share (lossless WAV), waveform with playhead, fader.
@MainActor
struct StemRowView: View {
    let stem: Stem
    let sessionID: UUID
    let player: StemPlayer

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var color: Color { Color.stem(stem) }
    private var state: MixerChannelState { player.state(for: stem.id) }
    private var audible: Bool { player.isAudible(stem.id) }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(color.opacity(audible ? 1 : 0.35))
                .frame(width: 5)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 10) {
                if dynamicTypeSize.isAccessibilitySize {
                    // Large text: the name gets the full width, the buttons go below it.
                    VStack(alignment: .leading, spacing: 8) {
                        titleBlock
                        channelButtons
                    }
                } else {
                    HStack(spacing: 8) {
                        titleBlock
                        Spacer(minLength: 4)
                        channelButtons
                    }
                }

                StemWaveformView(peaks: stem.waveform, color: color, player: player, label: "\(stem.name) waveform")

                HStack(spacing: 10) {
                    Image(systemName: state.volume <= 0.001 ? "speaker.slash.fill" : "speaker.wave.2.fill")
                        .font(.caption)
                        .foregroundStyle(Color.smMuted)
                        .frame(width: 18)
                        .accessibilityHidden(true)
                    Slider(value: volumeBinding, in: 0...1)
                        .tint(color)
                        .accessibilityLabel("\(stem.name) volume")
                        .accessibilityValue(volumeText)
                    Text(volumeText)
                        .font(.caption2)
                        .monospacedDigit()
                        .foregroundStyle(Color.smMuted)
                        .frame(minWidth: 52, alignment: .trailing)
                        .accessibilityHidden(true)
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: Theme.rowRadius, style: .continuous)
                .fill(Color.smPanel)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.rowRadius, style: .continuous)
                .strokeBorder(state.isSoloed ? Color.smYellow.opacity(0.6) : Color.clear, lineWidth: 1)
        )
    }

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(stem.name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(audible ? Color.smInk : Color.smMuted)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
                .minimumScaleFactor(0.8)
            if let detail = StemCatalog.detail(for: stem.id) {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Color.smInk2)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
            }
            Text(levelText)
                .font(.caption2)
                .monospacedDigit()
                .foregroundStyle(Color.smMuted)
        }
    }

    private var channelButtons: some View {
        HStack(spacing: 8) {
            ChannelToggle(
                letter: "M",
                isOn: state.isMuted,
                onColor: Color.smAccent,
                label: "Mute \(stem.name)"
            ) {
                Haptics.selection()
                player.toggleMute(stem.id)
            }
            ChannelToggle(
                letter: "S",
                isOn: state.isSoloed,
                onColor: Color.smYellow,
                label: "Solo \(stem.name)"
            ) {
                Haptics.selection()
                player.toggleSolo(stem.id)
            }
            StemShareButton(stem: stem, sessionID: sessionID)
        }
    }

    private var volumeBinding: Binding<Double> {
        Binding(
            get: { Double(player.state(for: stem.id).volume) },
            set: { player.setVolume(Float($0), for: stem.id) }
        )
    }

    private var volumeText: String {
        let volume = Double(state.volume)
        guard volume > 0.0001 else { return "-inf dB" }
        return "\(NumberFormatting.decibels(20 * log10(volume))) dB"
    }

    private var levelText: String {
        "Peak \(NumberFormatting.decibels(stem.peakDBFS)) dBFS · \(Int((stem.activeRatio * 100).rounded()))% active"
    }
}

/// Square M / S button.
struct ChannelToggle: View {
    let letter: String
    let isOn: Bool
    let onColor: Color
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(letter)
                .font(.system(.subheadline, design: .rounded).weight(.heavy))
                .foregroundStyle(isOn ? Color.smBackground : Color.smInk2)
                .frame(minWidth: 34, minHeight: 30)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(isOn ? onColor : Color.smPanel2)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityValue(isOn ? "On" : "Off")
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : [.isButton])
    }
}

/// Downloads the stem's lossless WAV on demand (with progress), then opens the share sheet.
@MainActor
struct StemShareButton: View {
    let stem: Stem
    let sessionID: UUID

    @Environment(AppModel.self) private var model

    var body: some View {
        let progress = model.transferProgress(sessionID: sessionID, item: stem.id)
        Button {
            Haptics.tap()
            if progress != nil {
                model.cancelTransfer(sessionID: sessionID, item: stem.id)
            } else {
                Task { await share() }
            }
        } label: {
            ZStack {
                if let progress {
                    MiniProgressRing(progress: progress)
                        .frame(width: 18, height: 18)
                    Image(systemName: "xmark")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundStyle(Color.smInk2)
                } else {
                    Image(systemName: "square.and.arrow.up")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.smInk2)
                }
            }
            .frame(minWidth: 34, minHeight: 30)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.smPanel2)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(progress == nil ? "Export \(stem.name) as lossless WAV" : "Cancel the \(stem.name) download")
        .accessibilityValue(progress.map { "Downloading \(NumberFormatting.percent($0))" } ?? "")
    }

    private func share() async {
        do {
            let url = try await model.losslessFile(for: stem, sessionID: sessionID)
            ActivityPresenter.share([url])
        } catch {
            if APIError.from(error) == .cancelled { return }
            model.alert = AppAlert(title: "Couldn't export \(stem.name)", message: userFacingMessage(for: error))
            Haptics.error()
        }
    }
}


/// Small determinate ring for per-file download progress.
struct MiniProgressRing: View {
    let progress: Double

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.smMuted.opacity(0.35), lineWidth: 2.5)
            Circle()
                .trim(from: 0, to: CGFloat(min(max(progress, 0.02), 1)))
                .stroke(Color.smAccent, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 0.2), value: progress)
        }
        .accessibilityHidden(true)
    }
}
