import SwiftUI

/// Mixer header: title, options summary and the analysis chips (BPM, key + Camelot, LUFS,
/// duration, artifact level).
@MainActor
struct AnalysisHeader: View {
    let session: SessionRecord
    let job: Job

    @State private var showArtifactInfo = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(session.title)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Color.smInk)
                    .lineLimit(2)
                Text(OptionText.summary(job.options))
                    .font(.footnote)
                    .foregroundStyle(Color.smMuted)
            }

            if let analysis = job.analysis {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        InfoChip(systemImage: "metronome", text: "\(NumberFormatting.bpm(analysis.bpm)) BPM", tint: .smAccent)
                            .accessibilityLabel("Tempo \(NumberFormatting.bpm(analysis.bpm)) beats per minute")
                        InfoChip(systemImage: "music.note", text: keyText(analysis), tint: .smTeal)
                            .accessibilityLabel("Key \(analysis.key), Camelot \(analysis.camelot)")
                        InfoChip(systemImage: "speaker.wave.2.fill", text: "\(NumberFormatting.decibels(analysis.loudnessLUFS)) LUFS", tint: .smViolet)
                            .accessibilityLabel("Integrated loudness \(NumberFormatting.decibels(analysis.loudnessLUFS)) LUFS")
                        InfoChip(systemImage: "clock", text: TimeFormatting.clock(analysis.durationSeconds), tint: .smInk2)
                            .accessibilityLabel("Duration \(TimeFormatting.spoken(analysis.durationSeconds))")
                        Button {
                            showArtifactInfo = true
                        } label: {
                            InfoChip(
                                systemImage: "info.circle",
                                text: "Artifacts \(analysis.artifactLabel.title)",
                                tint: artifactTint(analysis.artifactLabel)
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Artifact level \(analysis.artifactLabel.title), \(NumberFormatting.percent(analysis.artifactLevel))")
                        .accessibilityHint("Explains what the artifact level measures")
                        .popover(isPresented: $showArtifactInfo) {
                            ArtifactInfoView(analysis: analysis)
                                .presentationCompactAdaptation(.popover)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }

            if abs(job.gainOffsetDB) >= 0.05 {
                Label {
                    Text("All stems were lowered by \(NumberFormatting.decibels(abs(job.gainOffsetDB))) dB together to avoid clipping. Their balance is unchanged.")
                } icon: {
                    Image(systemName: "dial.low")
                }
                .font(.caption)
                .foregroundStyle(Color.smInk2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .panel()
    }

    private func keyText(_ analysis: Analysis) -> String {
        analysis.camelot.isEmpty ? analysis.key : "\(analysis.key) · \(analysis.camelot)"
    }

    private func artifactTint(_ label: ArtifactLabel) -> Color {
        switch label {
        case .low: return .smTeal
        case .moderate: return .smYellow
        case .high: return .smAccent
        case .unknown: return .smMuted
        }
    }
}

/// Popover explaining the artifact level.
struct ArtifactInfoView: View {
    let analysis: Analysis

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Artifact level")
                    .font(.headline)
                    .foregroundStyle(Color.smInk)
                Spacer()
                Text("\(analysis.artifactLabel.title) · \(NumberFormatting.percent(analysis.artifactLevel))")
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(Color.smAccent)
            }
            Text("A measurement of the static noise floor, high-band flicker (\"shimmer\") and hard spectral cut-off in this audio: the kind of residue neural codecs leave behind.")
                .font(.footnote)
                .foregroundStyle(Color.smInk2)
                .fixedSize(horizontal: false, vertical: true)
            Text("It describes noise and flicker only. It is not a claim about who or what made the track.")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color.smInk)
                .fixedSize(horizontal: false, vertical: true)
            if let cutoff = analysis.spectralCutoffHz {
                Label("Spectral cut-off near \(Int((cutoff / 100).rounded()) * 100) Hz", systemImage: "chart.line.downtrend.xyaxis")
                    .font(.caption)
                    .foregroundStyle(Color.smMuted)
            }
            Text("Turn on AI artifact denoise to reduce it; whatever is removed is kept in a Removed Noise stem.")
                .font(.caption)
                .foregroundStyle(Color.smMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(width: 300)
        .background(Color.smPanel)
    }
}
