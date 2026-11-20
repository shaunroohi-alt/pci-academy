import Foundation

/// Finds the job the server created from an upload that the app could not finish waiting for
/// (the app was terminated after the server had the whole file).
enum UploadRecovery {
    /// How far a job's `created_at` may be before the upload started (phone and server clocks).
    static let clockSlack: TimeInterval = 300

    /// `interrupted` session id -> its job. A job matches when it has the session's file name and
    /// options, was created after the upload started, and no other session holds it. Only
    /// one-to-one matches count: when two sessions could own a job, or a session has two
    /// candidate jobs, nothing is picked for them.
    static func matches(interrupted: [SessionRecord], jobs: [Job], claimed: Set<String>) -> [UUID: Job] {
        let open = jobs.filter { !claimed.contains($0.id) }
        func fits(_ job: Job, _ session: SessionRecord) -> Bool {
            job.filename == session.originalFilename
                && job.options == session.options
                && job.createdAt >= session.updatedAt.addingTimeInterval(-clockSlack)
        }
        var result: [UUID: Job] = [:]
        for session in interrupted {
            let candidates = open.filter { fits($0, session) }
            guard candidates.count == 1, let job = candidates.first else { continue }
            let owners = interrupted.filter { fits(job, $0) }
            if owners.count == 1 {
                result[session.id] = job
            }
        }
        return result
    }
}
