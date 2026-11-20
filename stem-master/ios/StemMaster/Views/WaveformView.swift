import SwiftUI

/// Static waveform drawn from the API's 256 linear peaks with `Canvas`.
///
/// `Equatable`, so SwiftUI skips redrawing it while only the playhead moves.
struct WaveformCanvas: View, Equatable {
    let peaks: [Double]
    let color: Color

    var body: some View {
        Canvas { context, size in
            guard !peaks.isEmpty, size.width > 0, size.height > 0 else { return }
            let step = size.width / CGFloat(peaks.count)
            let barWidth = max(1, step * 0.6)
            let middle = size.height / 2
            let radius = barWidth / 2
            var path = Path()
            for (index, peak) in peaks.enumerated() {
                let height = max(1.5, CGFloat(WaveformCurve.displayLevel(peak)) * size.height)
                let x = CGFloat(index) * step + (step - barWidth) / 2
                let rect = CGRect(x: x, y: middle - height / 2, width: barWidth, height: height)
                path.addRoundedRect(in: rect, cornerSize: CGSize(width: radius, height: radius))
            }
            context.fill(path, with: .color(color))
        }
        .accessibilityHidden(true)
    }
}

/// A stem's waveform with the played part highlighted, a playhead line, and tap-to-seek.
@MainActor
struct StemWaveformView: View {
    let peaks: [Double]
    let color: Color
    let player: StemPlayer
    var height: CGFloat = 44

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            ZStack(alignment: .leading) {
                WaveformCanvas(peaks: peaks, color: color.opacity(0.32))
                    .equatable()
                PlayedWaveformOverlay(peaks: peaks, color: color, width: width, player: player)
            }
            .contentShape(Rectangle())
            .gesture(
                SpatialTapGesture()
                    .onEnded { value in
                        guard width > 0, player.duration > 0 else { return }
                        let fraction = min(max(value.location.x / width, 0), 1)
                        player.seek(to: Double(fraction) * player.duration)
                    }
            )
        }
        .frame(height: height)
        .accessibilityElement()
        .accessibilityLabel("Waveform")
        .accessibilityHint("Tap to move the playhead")
    }
}

/// The bright copy of the waveform masked to the played fraction, plus the playhead line.
/// Only this small view re-renders as the playhead moves.
@MainActor
private struct PlayedWaveformOverlay: View {
    let peaks: [Double]
    let color: Color
    let width: CGFloat
    let player: StemPlayer

    var body: some View {
        let fraction = player.duration > 0 ? min(max(player.currentTime / player.duration, 0), 1) : 0
        let x = width * CGFloat(fraction)
        WaveformCanvas(peaks: peaks, color: color)
            .equatable()
            .mask(alignment: .leading) {
                Rectangle().frame(width: x)
            }
            .overlay(alignment: .leading) {
                Rectangle()
                    .fill(Color.smInk.opacity(0.9))
                    .frame(width: 1.5)
                    .offset(x: max(0, x - 0.75))
                    .opacity(player.isLoaded ? 1 : 0)
            }
            .allowsHitTesting(false)
    }
}
