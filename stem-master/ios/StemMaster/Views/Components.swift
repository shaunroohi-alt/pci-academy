import SwiftUI

/// Coloured capsule showing a session's state.
struct StatusBadge: View {
    let state: SessionState

    private var tint: Color {
        switch state {
        case .draft: return .smMuted
        case .uploading, .queued, .processing: return .smAccent
        case .completed: return .smTeal
        case .failed: return .smDanger
        case .cancelled: return .smMuted
        }
    }

    private var icon: String {
        switch state {
        case .draft: return "slider.horizontal.3"
        case .uploading: return "arrow.up.circle.fill"
        case .queued: return "hourglass"
        case .processing: return "waveform"
        case .completed: return "checkmark.circle.fill"
        case .failed: return "exclamationmark.triangle.fill"
        case .cancelled: return "xmark.circle.fill"
        }
    }

    var body: some View {
        Label(state.label, systemImage: icon)
            .font(.caption.weight(.semibold))
            .labelStyle(.titleAndIcon)
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(tint.opacity(0.15)))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Status: \(state.label)")
    }
}

/// Circular progress ring with a percentage in the middle.
struct ProgressRing: View {
    let progress: Double
    var lineWidth: CGFloat = 10
    var tint: Color = .smAccent
    var caption: String?
    var indeterminate = false

    @State private var spin = false

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.smPanel2, lineWidth: lineWidth)
            if indeterminate {
                Circle()
                    .trim(from: 0, to: 0.25)
                    .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(spin ? 360 : 0))
                    .animation(.linear(duration: 1.2).repeatForever(autoreverses: false), value: spin)
                    .onAppear { spin = true }
            } else {
                Circle()
                    .trim(from: 0, to: CGFloat(min(max(progress, 0), 1)))
                    .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut(duration: 0.35), value: progress)
            }
            VStack(spacing: 2) {
                Text(indeterminate ? "" : NumberFormatting.percent(progress))
                    .font(.system(.title, design: .rounded).weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(Color.smInk)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                if let caption {
                    Text(caption)
                        .font(.caption)
                        .foregroundStyle(Color.smMuted)
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                        .minimumScaleFactor(0.6)
                }
            }
            .padding(lineWidth * 2)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(caption ?? "Progress")
        .accessibilityValue(indeterminate ? "In progress" : NumberFormatting.percent(progress))
    }
}

/// Compact info chip for the analysis row.
struct InfoChip: View {
    let systemImage: String
    let text: String
    var tint: Color = .smInk2

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(tint)
            Text(text)
                .font(.footnote.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(Color.smInk)
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(Capsule().fill(Color.smPanel2))
        .accessibilityElement(children: .combine)
    }
}

/// Header above a group of stems.
struct SectionHeader: View {
    let title: String
    let systemImage: String
    var count: Int?
    var tint: Color = .smInk2

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            Text(title)
                .font(.headline)
                .foregroundStyle(Color.smInk)
            if let count {
                Text("\(count)")
                    .font(.caption.weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(Color.smMuted)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Color.smPanel2))
            }
            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// "Can't reach the server" banner with a Retry button.
struct ConnectionBanner: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.title3)
                .foregroundStyle(Color.smYellow)
            VStack(alignment: .leading, spacing: 4) {
                Text("Reconnecting…")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.smInk)
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(Color.smInk2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Button("Retry", action: retry)
                .font(.subheadline.weight(.semibold))
                .buttonStyle(.bordered)
                .tint(Color.smYellow)
                .accessibilityHint("Checks the server again now")
        }
        .panel(fill: Color.smYellow.opacity(0.12))
    }
}

/// Horizontal brand lock-up: "Stem Master / by MP Audio".
struct BrandTitle: View {
    var body: some View {
        VStack(spacing: 0) {
            Text("Stem Master")
                .font(.headline)
                .foregroundStyle(Color.smInk)
            Text("by MP Audio")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Color.smAccent)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Stem Master by MP Audio")
    }
}
