import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Typed errors for everything that talks to the server, with messages fit for an alert.
enum APIError: Error, LocalizedError, Equatable, Sendable {
    /// No usable server URL is configured.
    case invalidServerURL
    /// 401/403. Carries the server's `detail`.
    case unauthorized(String?)
    /// 404.
    case notFound(String?)
    /// 413.
    case payloadTooLarge(String?)
    /// 415: the server could not decode the audio.
    case unsupportedMedia(String?)
    /// 400/409/422: bad options, track too long, ...
    case invalidRequest(String?)
    /// 502/503/504: the server is starting, overloaded or behind a failing proxy.
    case serverUnavailable(status: Int, detail: String?)
    /// Any other HTTP error.
    case server(status: Int, detail: String?)
    /// Transport-level failure (offline, timeout, TLS, ...).
    case network(String)
    /// The response did not match the API contract.
    case decoding(String)
    /// A local file could not be read or written.
    case file(String)
    case cancelled

    var errorDescription: String? {
        switch self {
        case .invalidServerURL:
            return "The server URL isn't valid. Check it in Settings."
        case let .unauthorized(detail):
            return Self.join("The server rejected the API key. Enter the right key in Settings.", detail)
        case let .notFound(detail):
            return Self.join("The server doesn't have this item (finished jobs are deleted after 24 hours).", detail)
        case let .payloadTooLarge(detail):
            return detail ?? "This file is larger than the server accepts."
        case let .unsupportedMedia(detail):
            return detail ?? "The server couldn't decode this audio file. Try MP3, WAV, AIFF, FLAC or M4A."
        case let .invalidRequest(detail):
            return detail ?? "The server didn't accept the request."
        case let .serverUnavailable(status, detail):
            return Self.join("The server is starting up or busy (HTTP \(status)). Try again in a minute.", detail)
        case let .server(status, detail):
            return Self.join("The server reported an error (HTTP \(status)).", detail)
        case let .network(message):
            return message
        case let .decoding(message):
            return "The server sent a response this version of Stem Master doesn't understand. \(message)"
        case let .file(message):
            return message
        case .cancelled:
            return "Cancelled."
        }
    }

    /// `true` when trying the same request again later can succeed.
    var isRetryable: Bool {
        switch self {
        case .network, .serverUnavailable, .server: return true
        case .invalidServerURL, .unauthorized, .notFound, .payloadTooLarge, .unsupportedMedia,
             .invalidRequest, .decoding, .file, .cancelled:
            return false
        }
    }

    private static func join(_ message: String, _ detail: String?) -> String {
        guard let detail, !detail.isEmpty else { return message }
        return "\(message)\n\n\(detail)"
    }

    // MARK: Mapping

    /// Maps a non-2xx HTTP response, using the server's `{"detail": ...}` when present.
    static func from(statusCode: Int, body: Data?) -> APIError {
        let detail = body.flatMap(detailMessage(from:))
        switch statusCode {
        case 401, 403: return .unauthorized(detail)
        case 404: return .notFound(detail)
        case 413: return .payloadTooLarge(detail)
        case 415: return .unsupportedMedia(detail)
        case 400, 409, 422: return .invalidRequest(detail)
        case 502, 503, 504: return .serverUnavailable(status: statusCode, detail: detail)
        default: return .server(status: statusCode, detail: detail)
        }
    }

    /// The `detail` of an error body, or a short plain-text body.
    static func detailMessage(from data: Data) -> String? {
        if let body = try? JSONDecoder().decode(APIErrorBody.self, from: data),
           let message = body.message?.trimmingCharacters(in: .whitespacesAndNewlines), !message.isEmpty {
            return message
        }
        guard let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty, text.count <= 300, !text.hasPrefix("<"), !text.hasPrefix("{") else {
            return nil
        }
        return text
    }

    /// Maps any error thrown while talking to the server.
    static func from(_ error: Error) -> APIError {
        if let apiError = error as? APIError { return apiError }
        if error is CancellationError { return .cancelled }
        if let urlError = error as? URLError { return from(urlError: urlError) }
        if let decodingError = error as? DecodingError { return .decoding(describe(decodingError)) }
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain {
            return from(urlError: URLError(URLError.Code(rawValue: nsError.code)))
        }
        if nsError.domain == NSCocoaErrorDomain {
            return .file(nsError.localizedDescription)
        }
        return .network(error.localizedDescription)
    }

    static func from(urlError: URLError) -> APIError {
        switch urlError.code {
        case .cancelled:
            return .cancelled
        case .notConnectedToInternet, .dataNotAllowed, .internationalRoamingOff:
            return .network("You're offline. Check your connection and try again.")
        case .timedOut:
            return .network("The server took too long to respond.")
        case .cannotFindHost, .dnsLookupFailed:
            return .network("Can't find the server. Check the server URL in Settings.")
        case .cannotConnectToHost:
            return .network("Can't connect to the server. Make sure it's running and the URL in Settings is right.")
        case .networkConnectionLost:
            return .network("The network connection was lost.")
        case .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate,
             .serverCertificateNotYetValid, .serverCertificateHasUnknownRoot, .clientCertificateRejected:
            return .network("A secure connection to the server couldn't be made.")
        case .appTransportSecurityRequiresSecureConnection:
            return .network("Plain http:// only works for servers on your local network. Use https:// for remote servers.")
        case .badServerResponse, .cannotParseResponse, .zeroByteResource:
            return .network("The server sent an invalid response.")
        case .cannotWriteToFile, .cannotCreateFile, .cannotOpenFile, .cannotMoveFile, .cannotRemoveFile:
            return .file("The file couldn't be saved on this iPhone.")
        default:
            return .network(urlError.localizedDescription)
        }
    }

    private static func describe(_ error: DecodingError) -> String {
        func path(_ context: DecodingError.Context) -> String {
            context.codingPath.map { $0.intValue.map(String.init) ?? $0.stringValue }.joined(separator: ".")
        }
        switch error {
        case let .keyNotFound(key, context):
            return "Missing \"\(key.stringValue)\" at \(path(context))."
        case let .typeMismatch(_, context), let .valueNotFound(_, context), let .dataCorrupted(context):
            return "\(context.debugDescription) (\(path(context)))"
        @unknown default:
            return error.localizedDescription
        }
    }
}

/// A readable message for any error shown in the UI.
func userFacingMessage(for error: Error) -> String {
    if let apiError = error as? APIError {
        return apiError.errorDescription ?? "Something went wrong."
    }
    if error is CancellationError { return "Cancelled." }
    return error.localizedDescription
}
