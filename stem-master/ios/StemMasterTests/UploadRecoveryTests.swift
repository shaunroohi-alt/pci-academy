import Foundation
import XCTest
@testable import StemMaster

/// Matching an upload cut off by termination to the job the server created from it.
final class UploadRecoveryTests: XCTestCase {
    private let started = Date(timeIntervalSince1970: 1_795_168_800)

    private func session(_ filename: String = "My Song.mp3", options: JobOptions = JobOptions()) -> SessionRecord {
        var record = SessionRecord(title: "T", originalFilename: filename, sourceFileName: filename, sourceBytes: 1, options: options)
        record.state = .failed
        record.updatedAt = started
        return record
    }

    private func job(_ id: String, filename: String = "My Song.mp3", createdAt: Date? = nil, options: String = Fixtures.optionsJSON) throws -> Job {
        try Fixtures.decode(Job.self, from: Fixtures.jobJSON(id: id, status: "processing", filename: filename, createdAt: createdAt ?? started.addingTimeInterval(20), options: options))
    }

    func testAdoptsTheOnlyMatchingJob() throws {
        let record = session()
        let jobs = [try job("a"), try job("b", filename: "Other.wav")]
        XCTAssertEqual(UploadRecovery.matches(interrupted: [record], jobs: jobs, claimed: [])[record.id]?.id, "a")
    }

    func testIgnoresJobsThatCannotBeThisUpload() throws {
        let record = session()
        let older = try job("old", createdAt: started.addingTimeInterval(-3600))
        let fast = try job("fast", options: #"{"quality": "fast"}"#)
        let claimed = try job("claimed")
        XCTAssertTrue(UploadRecovery.matches(interrupted: [record], jobs: [older, fast, claimed], claimed: ["claimed"]).isEmpty)
    }

    func testAmbiguousMatchesAreLeftAlone() throws {
        let first = session()
        let second = session()
        XCTAssertTrue(UploadRecovery.matches(interrupted: [first, second], jobs: [try job("a")], claimed: []).isEmpty,
                      "two sessions, one job")
        XCTAssertTrue(UploadRecovery.matches(interrupted: [first], jobs: [try job("a"), try job("b")], claimed: []).isEmpty,
                      "one session, two jobs")
    }
}
