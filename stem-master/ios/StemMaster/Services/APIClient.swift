import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// async/await client for the Stem Master REST API (SPEC section 4).
///
/// Every request carries `X-Client-Id` (a random per-install UUID, so `GET /v1/jobs` only lists
/// this device's jobs) and, when an API key is set, `Authorization: Bearer <key>`.
/// Configuration can change at any time from Settings; requests read a locked snapshot.
final class APIClient: @unchecked Sendable {
    struct Configuration: Equatable, Sendable {
        var baseURL: URL?
        var apiKey: String?
        var clientID: String
    }

    let transfers: TransferSession
    private let session: URLSession
    private let lock = NSLock()
    private var configuration: Configuration

    init(configuration: Configuration, session: URLSession? = nil, transfers: TransferSession = TransferSession()) {
        self.configuration = configuration
        self.session = session ?? URLSession(configuration: APIClient.defaultConfiguration())
        self.transfers = transfers
    }

    static func defaultConfiguration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 120
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        return configuration
    }

    var currentConfiguration: Configuration {
        lock.lock()
        defer { lock.unlock() }
        return configuration
    }

    func updateConfiguration(_ newValue: Configuration) {
        lock.lock()
        configuration = newValue
        lock.unlock()
    }

    static let userAgent: String = {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "StemMaster/\(version) (\(build); iOS)"
    }()

    // MARK: Requests

    /// Absolute URL for an API path such as a stem's `wav_url`.
    func url(for path: String) throws -> URL {
        guard let base = currentConfiguration.baseURL, let url = ServerURL.resolve(path, against: base) else {
            throw APIError.invalidServerURL
        }
        return url
    }

    /// A request with the auth and client headers set.
    func request(_ path: String, method: String = "GET", timeout: TimeInterval = 30, accept: String = "application/json") throws -> URLRequest {
        let config = currentConfiguration
        guard let base = config.baseURL, let url = ServerURL.resolve(path, against: base) else {
            throw APIError.invalidServerURL
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        request.httpMethod = method
        request.setValue(accept, forHTTPHeaderField: "Accept")
        request.setValue(config.clientID, forHTTPHeaderField: "X-Client-Id")
        request.setValue(Self.userAgent, forHTTPHeaderField: "User-Agent")
        let key = config.apiKey?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !key.isEmpty {
            request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func perform(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw APIError.network("The server sent an invalid response.")
            }
            guard (200..<300).contains(http.statusCode) else {
                throw APIError.from(statusCode: http.statusCode, body: data)
            }
            return (data, http)
        } catch {
            throw APIError.from(error)
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try StemMasterJSON.makeDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.from(error)
        }
    }

    private func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        let (data, _) = try await perform(try request(path))
        return try decode(T.self, from: data)
    }

    // MARK: Endpoints

    /// `GET /v1/health` (never needs auth).
    func health() async throws -> Health {
        try await get("/v1/health", as: Health.self)
    }

    /// `GET /v1/capabilities`.
    func capabilities() async throws -> Capabilities {
        try await get("/v1/capabilities", as: Capabilities.self)
    }

    /// `GET /v1/jobs`: this client's jobs, newest first.
    func listJobs() async throws -> [Job] {
        try await get("/v1/jobs", as: JobList.self).jobs
    }

    /// `GET /v1/jobs/{id}`.
    func job(id: String) async throws -> Job {
        try await get("/v1/jobs/\(Self.escape(id))", as: Job.self)
    }

    /// `POST /v1/jobs/{id}/cancel` (no-op on the server if the job already finished).
    func cancelJob(id: String) async throws -> Job {
        let (data, _) = try await perform(try request("/v1/jobs/\(Self.escape(id))/cancel", method: "POST"))
        return try decode(Job.self, from: data)
    }

    /// `DELETE /v1/jobs/{id}`. A job the server no longer has counts as deleted.
    func deleteJob(id: String) async throws {
        do {
            _ = try await perform(try request("/v1/jobs/\(Self.escape(id))", method: "DELETE"))
        } catch let error as APIError {
            if case .notFound = error { return }
            throw error
        }
    }

    /// `POST /v1/jobs`: streams a multipart body (`options` JSON + `file`) from a temporary file
    /// and reports upload progress. Returns the created job (HTTP 202).
    func createJob(
        sourceURL: URL,
        filename: String,
        options: JobOptions,
        progress: TransferProgressHandler? = nil
    ) async throws -> Job {
        var form = MultipartFormData()
        let optionsJSON: String
        do {
            optionsJSON = String(decoding: try StemMasterJSON.makeEncoder().encode(options), as: UTF8.self)
        } catch {
            throw APIError.file("Couldn't encode the options: \(error.localizedDescription)")
        }
        form.addField(name: "options", value: optionsJSON)
        let ext = URL(fileURLWithPath: filename).pathExtension
        form.addFile(name: "file", filename: filename, mimeType: FileNaming.mimeType(forPathExtension: ext), fileURL: sourceURL)

        let bodyURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("upload-\(UUID().uuidString).multipart")
        defer { try? FileManager.default.removeItem(at: bodyURL) }
        do {
            try form.writeBody(to: bodyURL)
        } catch {
            throw APIError.file("Couldn't read the audio file for upload: \(error.localizedDescription)")
        }
        try Task.checkCancellation()

        var request = try self.request("/v1/jobs", method: "POST", timeout: 300)
        request.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
        let (data, response) = try await transfers.upload(request, fromFile: bodyURL, progress: progress)
        guard (200..<300).contains(response.statusCode) else {
            throw APIError.from(statusCode: response.statusCode, body: data)
        }
        return try decode(Job.self, from: data)
    }

    /// Downloads an API path (stem WAV/preview, ZIP) to `destination` with progress.
    func download(_ path: String, to destination: URL, timeout: TimeInterval = 120, progress: TransferProgressHandler? = nil) async throws -> URL {
        let request = try self.request(path, timeout: timeout, accept: "*/*")
        return try await transfers.download(request, to: destination, progress: progress)
    }

    /// Percent-escapes a path segment (job ids are hex, but never trust input).
    private static func escape(_ segment: String) -> String {
        segment.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? segment
    }
}
