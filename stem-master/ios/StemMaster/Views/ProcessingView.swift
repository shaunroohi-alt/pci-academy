import SwiftUI

/// Upload, queue and processing progress with the stage checklist.
@MainActor
struct ProcessingView: View {
    let session: SessionRecord

    @Environment(AppModel.self) private var model
    @State private var confirmCancel = false

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                header
                ring
                if let issue = model.connectionIssues[session.id] {
                    ConnectionBanner(message: issue) {
                        Haptics.tap()
                        model.pollNow(sessionID: session.id)
                    }
                }
                checklist
                if session.state == .uploading {
                    Label("Keep Stem Master open until the upload finishes: iOS stops uploads shortly after an app leaves the screen.", systemImage: "iphone")
                        .font(.footnote)
                        .foregroundStyle(Color.smInk2)
                        .fixedSize(horizontal: false, vertical: true)
                        .panel(padding: 12)
                }
                Text(OptionText.vocalFocus)
                    .font(.footnote)
                    .foregroundStyle(Color.smMuted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 8)
                Button(role: .destructive) {
                    confirmCancel = true
                } label: {
                    if model.isCancellingUpload(session.id) {
                        Label("Cancelling…", systemImage: "hourglass")
                    } else {
                        Label(session.state == .uploading ? "Cancel Upload" : "Cancel Separation", systemImage: "xmark")
                    }
                }
                .buttonStyle(SecondaryButtonStyle(tint: .smDanger))
                .disabled(model.isCancellingUpload(session.id))
            }
            .padding(Theme.gutter)
        }
        .screenBackground()
        .navigationTitle(session.title)
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(
            session.state == .uploading ? "Cancel the upload?" : "Cancel this separation?",
            isPresented: $confirmCancel,
            titleVisibility: .visible
        ) {
            Button(session.state == .uploading ? "Cancel Upload" : "Cancel Separation", role: .destructive) {
                Haptics.warning()
                model.cancelProcessing(sessionID: session.id)
            }
            Button("Keep Going", role: .cancel) {}
        }
    }

    private var header: some View {
        VStack(spacing: 6) {
            Text(session.title)
                .font(.title2.weight(.bold))
                .foregroundStyle(Color.smInk)
                .multilineTextAlignment(.center)
                .lineLimit(3)
            Text("\(NumberFormatting.bytes(session.sourceBytes)) · \(OptionText.summary(session.options))")
                .font(.footnote)
                .foregroundStyle(Color.smMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private var ring: some View {
        let upload = model.uploadProgress[session.id]
        let progress: Double
        let caption: String
        var indeterminate = false
        switch session.state {
        case .uploading:
            progress = upload ?? 0
            caption = (upload ?? 0) >= 1 ? "Checking the file" : "Uploading"
        case .queued:
            progress = 0
            indeterminate = true
            if let position = session.queuePosition {
                caption = position == 1 ? "Next in queue" : "Queue position \(position)"
            } else {
                caption = "In queue"
            }
        default:
            progress = session.progress
            caption = StagePlan.title(for: session.stage)
        }
        return ProgressRing(progress: progress, lineWidth: 12, caption: caption, indeterminate: indeterminate)
            .frame(width: 190, height: 190)
            .padding(.vertical, 4)
    }

    private var checklist: some View {
        let steps = ProcessingChecklist.steps(for: session)
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                ChecklistRow(step: step, isLast: index == steps.count - 1)
            }
        }
        .panel(padding: 14)
    }
}

/// One step of the checklist with a status icon and a connector line.
struct ChecklistRow: View {
    let step: ChecklistStep
    let isLast: Bool

    private var tint: Color {
        switch step.state {
        case .done: return .smTeal
        case .current: return .smAccent
        case .pending: return .smMuted
        case .failed: return .smDanger
        }
    }

    private var icon: String {
        switch step.state {
        case .done: return "checkmark.circle.fill"
        case .current: return "smallcircle.filled.circle"
        case .pending: return "circle"
        case .failed: return "xmark.circle.fill"
        }
    }

    private var stateText: String {
        switch step.state {
        case .done: return "done"
        case .current: return "in progress"
        case .pending: return "waiting"
        case .failed: return "failed"
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 0) {
                Image(systemName: icon)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(tint)
                    .symbolEffect(.pulse, isActive: step.state == .current)
                    .frame(width: 24, height: 24)
                if !isLast {
                    Rectangle()
                        .fill(step.state == .done ? Color.smTeal.opacity(0.5) : Color.smPanel2)
                        .frame(width: 2)
                        .frame(minHeight: 14)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(step.title)
                    .font(.subheadline.weight(step.state == .current ? .semibold : .regular))
                    .foregroundStyle(step.state == .pending ? Color.smMuted : Color.smInk)
                if let detail = step.detail, !detail.isEmpty {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(step.state == .current ? Color.smAccent : Color.smMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.top, 2)
            .padding(.bottom, isLast ? 0 : 10)
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(step.title), \(stateText)")
        .accessibilityValue(step.detail ?? "")
    }
}

/// Failed or cancelled session: the reason, Try Again, Change Options, Delete.
@MainActor
struct FailureView: View {
    let session: SessionRecord

    @Environment(AppModel.self) private var model
    @State private var confirmDelete = false

    private var isCancelled: Bool { session.state == .cancelled }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: isCancelled ? "xmark.circle" : "exclamationmark.triangle.fill")
                    .font(.system(size: 52))
                    .foregroundStyle(isCancelled ? Color.smMuted : Color.smDanger)
                    .padding(.top, 24)
                    .accessibilityHidden(true)
                Text(isCancelled ? "Separation cancelled" : "Separation failed")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Color.smInk)
                Text(session.errorMessage ?? (isCancelled ? "You cancelled this separation." : "Something went wrong."))
                    .font(.subheadline)
                    .foregroundStyle(Color.smInk2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .panel()

                if !isCancelled, session.jobID != nil {
                    VStack(alignment: .leading, spacing: 0) {
                        let steps = ProcessingChecklist.steps(for: session)
                        ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                            ChecklistRow(step: step, isLast: index == steps.count - 1)
                        }
                    }
                    .panel(padding: 14)
                }

                Button {
                    Haptics.tap()
                    model.retry(sessionID: session.id)
                } label: {
                    Label(isCancelled ? "Start Again" : "Try Again", systemImage: "arrow.clockwise")
                }
                .buttonStyle(PrimaryButtonStyle())

                Button {
                    model.editOptions(for: session.id)
                } label: {
                    Label("Change Options", systemImage: "slider.horizontal.3")
                }
                .buttonStyle(SecondaryButtonStyle())

                Button(role: .destructive) {
                    confirmDelete = true
                } label: {
                    Label("Delete", systemImage: "trash")
                }
                .buttonStyle(SecondaryButtonStyle(tint: .smDanger))
            }
            .padding(Theme.gutter)
        }
        .screenBackground()
        .navigationTitle(session.title)
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Delete “\(session.title)”?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Haptics.warning()
                model.delete(sessionID: session.id)
            }
            Button("Cancel", role: .cancel) {}
        }
    }
}

/// Imported but not started: summary and a button to open the options.
@MainActor
struct DraftSessionView: View {
    let session: SessionRecord

    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "waveform.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(Color.smAccent)
                .accessibilityHidden(true)
            Text(session.title)
                .font(.title2.weight(.bold))
                .foregroundStyle(Color.smInk)
                .multilineTextAlignment(.center)
            Text("\(NumberFormatting.bytes(session.sourceBytes)) · ready to separate")
                .font(.footnote)
                .foregroundStyle(Color.smMuted)
            Button {
                Haptics.tap()
                model.editOptions(for: session.id)
            } label: {
                Label("Choose Options & Separate", systemImage: "slider.horizontal.3")
            }
            .buttonStyle(PrimaryButtonStyle())
            .padding(.top, 8)
            Spacer()
        }
        .padding(Theme.gutter)
        .frame(maxWidth: .infinity)
        .screenBackground()
        .navigationTitle(session.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Routes a session to the screen for its state.
@MainActor
struct SessionDetailView: View {
    let sessionID: UUID

    @Environment(AppModel.self) private var model

    var body: some View {
        if let session = model.store.session(id: sessionID) {
            switch session.state {
            case .draft:
                DraftSessionView(session: session)
            case .uploading, .queued, .processing:
                ProcessingView(session: session)
            case .completed:
                MixerContainerView(session: session)
                    .id(session.jobID ?? session.id.uuidString)
            case .failed, .cancelled:
                FailureView(session: session)
            }
        } else {
            ContentUnavailableView(
                "Session not found",
                systemImage: "questionmark.folder",
                description: Text("It may have been deleted.")
            )
            .screenBackground()
        }
    }
}
