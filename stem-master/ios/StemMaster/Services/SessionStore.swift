import Foundation
import Observation

/// The local library: an index of sessions in `Documents/sessions.json` plus one folder per
/// session:
///
/// ```
/// Documents/Sessions/<uuid>/source/<original file>
///                         /job.json          the full Job (stems, waveforms, analysis)
///                         /previews/<stem>.m4a
///                         /stems/<Title - Stem>.wav
///                         /<Title - Stem Master>.zip
/// ```
///
/// `Documents` is visible in the Files app (UIFileSharingEnabled), so exported WAVs can be
/// picked up there too.
@Observable
@MainActor
final class SessionStore {
    /// Newest first.
    private(set) var sessions: [SessionRecord] = []
    /// Last persistence problem, for diagnostics.
    private(set) var lastError: String?

    @ObservationIgnored let rootURL: URL
    @ObservationIgnored private var jobCache: [UUID: Job] = [:]
    @ObservationIgnored private let fileManager = FileManager.default

    init(rootURL: URL? = nil) {
        self.rootURL = rootURL ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        load()
    }

    // MARK: Paths

    var indexURL: URL { rootURL.appendingPathComponent("sessions.json") }
    var sessionsFolderURL: URL { rootURL.appendingPathComponent("Sessions", isDirectory: true) }

    func folderURL(for id: UUID) -> URL {
        sessionsFolderURL.appendingPathComponent(id.uuidString, isDirectory: true)
    }

    func sourceURL(for session: SessionRecord) -> URL {
        folderURL(for: session.id)
            .appendingPathComponent("source", isDirectory: true)
            .appendingPathComponent(session.sourceFileName)
    }

    func jobFileURL(for id: UUID) -> URL {
        folderURL(for: id).appendingPathComponent("job.json")
    }

    func previewsFolderURL(for id: UUID) -> URL {
        folderURL(for: id).appendingPathComponent("previews", isDirectory: true)
    }

    func stemsFolderURL(for id: UUID) -> URL {
        folderURL(for: id).appendingPathComponent("stems", isDirectory: true)
    }

    func previewURL(for stem: Stem, sessionID: UUID) -> URL {
        previewsFolderURL(for: sessionID).appendingPathComponent("\(FileNaming.sanitize(stem.id)).m4a")
    }

    func wavURL(for stem: Stem, session: SessionRecord) -> URL {
        stemsFolderURL(for: session.id)
            .appendingPathComponent(FileNaming.stemWAVName(trackTitle: session.title, stemName: stem.name))
    }

    func zipURL(for session: SessionRecord) -> URL {
        folderURL(for: session.id).appendingPathComponent(FileNaming.zipName(trackTitle: session.title))
    }

    // MARK: Index

    func session(id: UUID) -> SessionRecord? {
        sessions.first { $0.id == id }
    }

    /// Loads the index. A corrupt index is set aside (`sessions.corrupt-<date>.json`) rather than
    /// silently overwritten.
    func load() {
        guard fileManager.fileExists(atPath: indexURL.path) else {
            sessions = []
            return
        }
        do {
            let data = try Data(contentsOf: indexURL)
            let decoded = try StemMasterJSON.makeDecoder().decode([SessionRecord].self, from: data)
            sessions = decoded
                .filter { fileManager.fileExists(atPath: folderURL(for: $0.id).path) }
                .sorted { $0.createdAt > $1.createdAt }
        } catch {
            lastError = "The library index couldn't be read: \(error.localizedDescription)"
            let backup = rootURL.appendingPathComponent("sessions.corrupt-\(Int(Date().timeIntervalSince1970)).json")
            try? fileManager.moveItem(at: indexURL, to: backup)
            sessions = []
        }
    }

    private func persist() {
        do {
            try fileManager.createDirectory(at: rootURL, withIntermediateDirectories: true)
            let data = try StemMasterJSON.makeEncoder(pretty: true).encode(sessions)
            try data.write(to: indexURL, options: .atomic)
            lastError = nil
        } catch {
            lastError = "The library couldn't be saved: \(error.localizedDescription)"
        }
    }

    /// Applies `mutate` to a session and saves the index (only if something changed).
    func update(_ id: UUID, _ mutate: (inout SessionRecord) -> Void) {
        guard let index = sessions.firstIndex(where: { $0.id == id }) else { return }
        var record = sessions[index]
        mutate(&record)
        guard record != sessions[index] else { return }
        sessions[index] = record
        persist()
    }

    // MARK: Import

    /// Copies an audio file (from the Files picker or "Open in Stem Master") into a new session
    /// folder and adds a draft session.
    func importAudio(from url: URL, options: JobOptions) throws -> SessionRecord {
        let id = UUID()
        let folder = folderURL(for: id)
        let originalName = url.lastPathComponent.isEmpty ? "Track" : url.lastPathComponent
        let safeName = FileNaming.sanitizeKeepingExtension(originalName)
        let destination = folder
            .appendingPathComponent("source", isDirectory: true)
            .appendingPathComponent(safeName)
        do {
            try fileManager.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            try FileImport.copyItem(at: url, to: destination)
        } catch {
            try? fileManager.removeItem(at: folder)
            throw APIError.file("Couldn't read “\(originalName)”. If it's in iCloud Drive, make sure it has finished downloading. (\(error.localizedDescription))")
        }
        let size = (try? fileManager.attributesOfItem(atPath: destination.path)[.size] as? NSNumber)?.int64Value ?? 0
        guard size > 0 else {
            try? fileManager.removeItem(at: folder)
            throw APIError.file("“\(originalName)” is empty.")
        }
        FileImport.removeIfInInbox(url, documentsURL: rootURL)

        let record = SessionRecord(
            id: id,
            title: FileNaming.title(fromFilename: originalName),
            originalFilename: originalName,
            sourceFileName: safeName,
            sourceBytes: size,
            options: options
        )
        sessions.insert(record, at: 0)
        persist()
        return record
    }

    // MARK: Jobs

    /// Saves the full job next to the audio and copies its summary into the index.
    func saveJob(_ job: Job, for id: UUID) {
        guard session(id: id) != nil else { return }
        jobCache[id] = job
        do {
            let data = try StemMasterJSON.makeEncoder().encode(job)
            try data.write(to: jobFileURL(for: id), options: .atomic)
        } catch {
            lastError = "The job couldn't be saved: \(error.localizedDescription)"
        }
        update(id) { $0.apply(job) }
    }

    /// The last saved job for a session (memory cache, then `job.json`).
    func job(for id: UUID) -> Job? {
        if let cached = jobCache[id] { return cached }
        guard let data = try? Data(contentsOf: jobFileURL(for: id)),
              let job = try? StemMasterJSON.makeDecoder().decode(Job.self, from: data) else {
            return nil
        }
        jobCache[id] = job
        return job
    }

    /// Forgets the saved job (before a retry creates a new one).
    func clearJob(for id: UUID) {
        jobCache[id] = nil
        try? fileManager.removeItem(at: jobFileURL(for: id))
    }

    /// Deletes a session and all of its files.
    func delete(_ id: UUID) {
        jobCache[id] = nil
        try? fileManager.removeItem(at: folderURL(for: id))
        sessions.removeAll { $0.id == id }
        persist()
    }

    // MARK: Files

    func hasFile(at url: URL, expectedBytes: Int64 = 0) -> Bool {
        Downloader.isComplete(url, expectedBytes: expectedBytes)
    }

    /// Bytes used by all sessions (sources, jobs, previews, stems, ZIPs).
    func storageUsedBytes() -> Int64 {
        Self.directorySize(sessionsFolderURL)
    }

    /// Bytes used by downloaded audio (previews, lossless stems, ZIPs) that can be fetched again.
    func downloadedAudioBytes() -> Int64 {
        sessions.reduce(Int64(0)) { total, session in
            total + downloadedAudioURLs(for: session).reduce(Int64(0)) { $0 + Self.directorySize($1) }
        }
    }

    /// Removes previews, lossless stems and ZIPs of every session. Sources and jobs stay, so stems
    /// can be downloaded again while the server keeps the job.
    func clearDownloadedAudio() {
        for session in sessions {
            for url in downloadedAudioURLs(for: session) {
                try? fileManager.removeItem(at: url)
            }
        }
    }

    private func downloadedAudioURLs(for session: SessionRecord) -> [URL] {
        var urls = [previewsFolderURL(for: session.id), stemsFolderURL(for: session.id)]
        let folder = folderURL(for: session.id)
        if let contents = try? fileManager.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) {
            urls.append(contentsOf: contents.filter { $0.pathExtension.lowercased() == "zip" })
        }
        return urls.filter { fileManager.fileExists(atPath: $0.path) }
    }

    /// Total size of a file or folder tree.
    static func directorySize(_ url: URL) -> Int64 {
        let manager = FileManager.default
        var isDirectory: ObjCBool = false
        guard manager.fileExists(atPath: url.path, isDirectory: &isDirectory) else { return 0 }
        if !isDirectory.boolValue {
            return (try? manager.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value ?? 0
        }
        guard let enumerator = manager.enumerator(at: url, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey]) else {
            return 0
        }
        var total: Int64 = 0
        while let item = enumerator.nextObject() as? URL {
            guard let values = try? item.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey]),
                  values.isRegularFile == true else { continue }
            total += Int64(values.fileSize ?? 0)
        }
        return total
    }
}

/// Copying user-picked files: security-scoped access and file coordination (so iCloud Drive
/// files are downloaded first) on Apple platforms.
enum FileImport {
    static func copyItem(at source: URL, to destination: URL) throws {
        let manager = FileManager.default
        if manager.fileExists(atPath: destination.path) {
            try manager.removeItem(at: destination)
        }
        #if canImport(Darwin)
        let accessing = source.startAccessingSecurityScopedResource()
        defer {
            if accessing { source.stopAccessingSecurityScopedResource() }
        }
        var coordinationError: NSError?
        var copyError: Error?
        NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: source, options: [.withoutChanges], error: &coordinationError) { readURL in
            do {
                try manager.copyItem(at: readURL, to: destination)
            } catch {
                copyError = error
            }
        }
        if let coordinationError { throw coordinationError }
        if let copyError { throw copyError }
        #else
        try manager.copyItem(at: source, to: destination)
        #endif
    }

    /// Files handed over by "Open in" without in-place access are copied into
    /// `Documents/Inbox`; remove them once imported so they don't pile up.
    static func removeIfInInbox(_ url: URL, documentsURL: URL) {
        let inbox = documentsURL.appendingPathComponent("Inbox", isDirectory: true).standardizedFileURL.path
        let path = url.standardizedFileURL.path
        if path.hasPrefix(inbox + "/") {
            try? FileManager.default.removeItem(at: url)
        }
    }
}
