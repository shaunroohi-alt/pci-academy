import SwiftUI

/// Play/pause, scrubber and elapsed/total time, pinned under the mixer.
@MainActor
struct TransportBar: View {
    let player: StemPlayer

    @State private var scrubTime: Double = 0
    @State private var isScrubbing = false

    private var shownTime: Double { isScrubbing ? scrubTime : player.currentTime }

    var body: some View {
        VStack(spacing: 6) {
            Slider(
                value: Binding(
                    get: { isScrubbing ? scrubTime : player.currentTime },
                    set: { scrubTime = $0 }
                ),
                in: 0...max(player.duration, 0.1),
                onEditingChanged: { editing in
                    if editing {
                        scrubTime = player.currentTime
                        isScrubbing = true
                    } else {
                        player.seek(to: scrubTime)
                        isScrubbing = false
                    }
                }
            )
            .tint(Color.smAccent)
            .disabled(!player.isLoaded)
            .accessibilityLabel("Playback position")
            .accessibilityValue("\(TimeFormatting.spoken(shownTime)) of \(TimeFormatting.spoken(player.duration))")

            HStack(spacing: 0) {
                Text(TimeFormatting.clock(shownTime))
                    .font(.footnote.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(Color.smInk2)
                    .frame(minWidth: 56, alignment: .leading)
                    .accessibilityHidden(true)

                Spacer()

                Button {
                    Haptics.tap()
                    player.seek(to: 0)
                } label: {
                    Image(systemName: "backward.end.fill")
                        .font(.title3)
                        .foregroundStyle(Color.smInk2)
                        .frame(width: 48, height: 48)
                }
                .accessibilityLabel("Back to start")

                Button {
                    Haptics.tap()
                    player.skip(by: -10)
                } label: {
                    Image(systemName: "gobackward.10")
                        .font(.title3)
                        .foregroundStyle(Color.smInk2)
                        .frame(width: 48, height: 48)
                }
                .accessibilityLabel("Back 10 seconds")

                Button {
                    Haptics.tap()
                    player.togglePlayback()
                } label: {
                    Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(Color.smBackground)
                        .frame(width: 62, height: 62)
                        .background(Circle().fill(Color.smAccent))
                        .contentTransition(.symbolEffect(.replace))
                }
                .padding(.horizontal, 8)
                .accessibilityLabel(player.isPlaying ? "Pause" : "Play")

                Button {
                    Haptics.tap()
                    player.skip(by: 10)
                } label: {
                    Image(systemName: "goforward.10")
                        .font(.title3)
                        .foregroundStyle(Color.smInk2)
                        .frame(width: 48, height: 48)
                }
                .accessibilityLabel("Forward 10 seconds")

                Spacer()

                Text(TimeFormatting.clock(player.duration))
                    .font(.footnote.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(Color.smMuted)
                    .frame(minWidth: 56, alignment: .trailing)
                    .accessibilityHidden(true)
            }
            .buttonStyle(.plain)
            .disabled(!player.isLoaded)
        }
        .padding(.horizontal, Theme.gutter)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(Color.smMuted.opacity(0.2))
                .frame(height: 0.5)
        }
    }
}
