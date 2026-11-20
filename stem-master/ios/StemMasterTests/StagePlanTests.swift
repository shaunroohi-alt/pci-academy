import Foundation
import XCTest
@testable import StemMaster

/// The processing checklist derived from the options (SPEC section 2).
final class StagePlanTests: XCTestCase {
    func testDefaultOptionsPlan() {
        XCTAssertEqual(
            StagePlan.stages(for: JobOptions()),
            [.analyze, .vocals, .debleed, .instruments, .drums, .vocalSplit, .cleanup, .finalize]
        )
    }

    func testEveryOptionalStage() {
        let all = JobOptions(drumSplit: true, vocalSplit: true, dereverb: true, cleanup: true, denoise: true)
        XCTAssertEqual(
            StagePlan.stages(for: all),
            [.analyze, .vocals, .debleed, .instruments, .drums, .vocalSplit, .dereverb, .cleanup, .denoise, .finalize]
        )
        let minimal = JobOptions(quality: .fast, drumSplit: false, vocalSplit: false, dereverb: false, cleanup: false, denoise: false)
        XCTAssertEqual(StagePlan.stages(for: minimal), [.analyze, .vocals, .instruments, .finalize])
    }

    private func session(state: SessionState, stage: JobStage, jobID: String? = Fixtures.jobID, label: String? = nil, queuePosition: Int? = nil) -> SessionRecord {
        var record = SessionRecord(title: "T", originalFilename: "T.wav", sourceFileName: "T.wav", sourceBytes: 1, options: JobOptions())
        record.state = state
        record.stage = stage
        record.jobID = jobID
        record.stageLabel = label
        record.queuePosition = queuePosition
        return record
    }

    private func states(_ steps: [ChecklistStep]) -> [String: StepState] {
        Dictionary(uniqueKeysWithValues: steps.map { ($0.id, $0.state) })
    }

    func testProcessingHighlightsCurrentStage() {
        let steps = ProcessingChecklist.steps(for: session(state: .processing, stage: .instruments, label: "Splitting bass, drums, guitar, piano"))
        XCTAssertEqual(steps.map(\.id), ["upload", "queue", "analyze", "vocals", "debleed", "instruments", "drums", "vocal_split", "cleanup", "finalize"])
        let map = states(steps)
        XCTAssertEqual(map["upload"], .done)
        XCTAssertEqual(map["queue"], .done)
        XCTAssertEqual(map["analyze"], .done)
        XCTAssertEqual(map["vocals"], .done)
        XCTAssertEqual(map["debleed"], .done)
        XCTAssertEqual(map["instruments"], .current)
        XCTAssertEqual(map["drums"], .pending)
        XCTAssertEqual(map["finalize"], .pending)
        XCTAssertEqual(steps.first { $0.id == "instruments" }?.detail, "Splitting bass, drums, guitar, piano", "the server's stage_label is shown")
        XCTAssertNil(steps.first { $0.id == "drums" }?.detail)
        XCTAssertEqual(steps.filter { $0.state == .current }.count, 1)
    }

    func testCurrentStageFallsBackToBuiltInDetail() {
        let steps = ProcessingChecklist.steps(for: session(state: .processing, stage: .cleanup, label: ""))
        XCTAssertEqual(steps.first { $0.id == "cleanup" }?.detail, StagePlan.detail(for: .cleanup))
    }

    func testUploadingAndQueued() {
        let uploading = states(ProcessingChecklist.steps(for: session(state: .uploading, stage: .queued, jobID: nil)))
        XCTAssertEqual(uploading["upload"], .current)
        XCTAssertEqual(uploading["queue"], .pending)
        XCTAssertEqual(uploading["analyze"], .pending)

        let queuedSteps = ProcessingChecklist.steps(for: session(state: .queued, stage: .queued, queuePosition: 3))
        let queued = states(queuedSteps)
        XCTAssertEqual(queued["upload"], .done)
        XCTAssertEqual(queued["queue"], .current)
        XCTAssertEqual(queuedSteps.first { $0.id == "queue" }?.detail, "Position 3 in the queue")
        XCTAssertEqual(queued["analyze"], .pending)
    }

    func testCompletedAndFailed() {
        let completed = ProcessingChecklist.steps(for: session(state: .completed, stage: .done))
        XCTAssertTrue(completed.allSatisfy { $0.state == .done })

        let failed = states(ProcessingChecklist.steps(for: session(state: .failed, stage: .drums)))
        XCTAssertEqual(failed["instruments"], .done)
        XCTAssertEqual(failed["drums"], .failed)
        XCTAssertEqual(failed["vocal_split"], .pending)

        let uploadFailed = states(ProcessingChecklist.steps(for: session(state: .failed, stage: .queued, jobID: nil)))
        XCTAssertEqual(uploadFailed["upload"], .failed)
    }

    func testSessionStateMapping() {
        XCTAssertEqual(SessionState(jobStatus: .queued), .queued)
        XCTAssertEqual(SessionState(jobStatus: .processing), .processing)
        XCTAssertEqual(SessionState(jobStatus: .completed), .completed)
        XCTAssertEqual(SessionState(jobStatus: .failed), .failed)
        XCTAssertEqual(SessionState(jobStatus: .cancelled), .cancelled)
        XCTAssertTrue(SessionState.queued.isTrackedOnServer)
        XCTAssertFalse(SessionState.uploading.isTrackedOnServer)
        XCTAssertTrue(SessionState.uploading.isInFlight)
    }
}
