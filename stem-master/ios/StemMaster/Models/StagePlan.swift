import Foundation

/// Which pipeline stages (SPEC section 2) a job runs for given options, and their checklist titles.
enum StagePlan {
    /// The stages the server runs for `options`, in pipeline order (the server's
    /// `pipeline.stage_plan`). `debleed` is not listed: the server runs it for no cleanup
    /// strength (SPEC section 2).
    static func stages(for options: JobOptions) -> [JobStage] {
        var stages: [JobStage] = [.analyze, .vocals, .instruments]
        if options.drumSplit { stages.append(.drums) }
        if options.vocalSplit { stages.append(.vocalSplit) }
        if options.dereverb { stages.append(.dereverb) }
        if options.cleanup { stages.append(.cleanup) }
        if options.denoise { stages.append(.denoise) }
        stages.append(.finalize)
        return stages
    }

    /// Short checklist title for a stage.
    static func title(for stage: JobStage) -> String {
        switch stage {
        case .queued: return "Waiting in queue"
        case .analyze: return "Analyze track"
        case .vocals: return "Separate vocals"
        case .debleed: return "Remove vocal bleed"
        case .instruments: return "Split bass, drums, guitar, piano"
        case .drums: return "Split the drum kit"
        case .vocalSplit: return "Split lead & backing vocals"
        case .dereverb: return "Remove vocal reverb"
        case .cleanup: return "Clean up stems"
        case .denoise: return "Denoise"
        case .finalize: return "Write stems"
        case .done: return "Done"
        case .unknown: return "Processing"
        }
    }

    /// One-line explanation shown under the current stage when the server sent no label.
    static func detail(for stage: JobStage) -> String {
        switch stage {
        case .analyze: return "Loudness, tempo, key and artifact level"
        case .vocals: return "Vocal / instrumental split"
        case .debleed: return "Strips vocal bleed out of the instrumental"
        case .instruments: return "Bass, drums, guitar, piano and synths"
        case .drums: return "Kick, snare, toms, hi-hat, ride and crash"
        case .vocalSplit: return "Lead vocal vs. harmonies and doubles"
        case .dereverb: return "Dry vocals plus a separate reverb stem"
        case .cleanup: return "Bleed masking, gating and range filters"
        case .denoise: return "Measured hiss, sub-sonic rumble and flicker"
        case .finalize: return "Lossless WAVs and previews"
        case .queued, .done, .unknown: return ""
        }
    }
}

/// State of one step in the processing checklist.
enum StepState: Equatable, Sendable {
    case pending
    case current
    case done
    case failed
}

/// One row of the processing checklist.
struct ChecklistStep: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let detail: String?
    let state: StepState
}

/// Builds the processing checklist (upload, queue, then the pipeline stages for the session's
/// options) from a session's current state.
enum ProcessingChecklist {
    static func steps(for session: SessionRecord) -> [ChecklistStep] {
        var plan = StagePlan.stages(for: session.options)
        // A stage the server reports that the plan does not expect (a newer server) is shown at
        // its pipeline position, so the checklist does not fall back to "all waiting".
        let pipeline = JobStage.allCases
        if ![.queued, .done, .unknown].contains(session.stage), !plan.contains(session.stage),
           let reported = pipeline.firstIndex(of: session.stage) {
            let insertAt = plan.firstIndex { (pipeline.firstIndex(of: $0) ?? 0) > reported } ?? plan.endIndex
            plan.insert(session.stage, at: insertAt)
        }
        let currentIndex = plan.firstIndex(of: session.stage)
        var steps: [ChecklistStep] = []

        // Upload
        let uploadState: StepState
        switch session.state {
        case .draft: uploadState = .pending
        case .uploading: uploadState = .current
        case .failed where session.jobID == nil: uploadState = .failed
        default: uploadState = session.jobID == nil && session.state != .completed ? .pending : .done
        }
        steps.append(ChecklistStep(id: "upload", title: "Upload", detail: uploadState == .current ? "Sending the track to the server" : nil, state: uploadState))

        // Queue
        let queueState: StepState
        var queueDetail: String?
        switch session.state {
        case .draft, .uploading:
            queueState = .pending
        case .queued:
            queueState = .current
            if let position = session.queuePosition {
                queueDetail = position == 1 ? "Next up" : "Position \(position) in the queue"
            } else {
                queueDetail = "Waiting for a free GPU"
            }
        default:
            queueState = session.jobID == nil ? .pending : .done
        }
        steps.append(ChecklistStep(id: "queue", title: "Queue", detail: queueDetail, state: queueState))

        // Pipeline stages
        for (index, stage) in plan.enumerated() {
            let state: StepState
            switch session.state {
            case .completed:
                state = .done
            case .draft, .uploading, .queued:
                state = .pending
            case .processing:
                if session.stage == .done {
                    state = .done
                } else if let currentIndex {
                    state = index < currentIndex ? .done : (index == currentIndex ? .current : .pending)
                } else {
                    state = .pending
                }
            case .failed, .cancelled:
                if let currentIndex {
                    if index < currentIndex {
                        state = .done
                    } else if index == currentIndex {
                        state = session.state == .failed ? .failed : .pending
                    } else {
                        state = .pending
                    }
                } else {
                    state = .pending
                }
            }
            var detail: String?
            if state == .current {
                let label = session.stageLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                detail = label.isEmpty ? StagePlan.detail(for: stage) : label
            }
            steps.append(ChecklistStep(id: stage.rawValue, title: StagePlan.title(for: stage), detail: detail, state: state))
        }
        return steps
    }
}
