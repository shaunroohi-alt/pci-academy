import Foundation
import XCTest
@testable import StemMaster

final class TimeFormattingTests: XCTestCase {
    func testClock() {
        XCTAssertEqual(TimeFormatting.clock(0), "0:00")
        XCTAssertEqual(TimeFormatting.clock(0.4), "0:00")
        XCTAssertEqual(TimeFormatting.clock(9.99), "0:09", "elapsed time truncates")
        XCTAssertEqual(TimeFormatting.clock(59), "0:59")
        XCTAssertEqual(TimeFormatting.clock(60), "1:00")
        XCTAssertEqual(TimeFormatting.clock(187.5), "3:07")
        XCTAssertEqual(TimeFormatting.clock(213.41), "3:33")
        XCTAssertEqual(TimeFormatting.clock(600), "10:00")
        XCTAssertEqual(TimeFormatting.clock(3599.9), "59:59")
        XCTAssertEqual(TimeFormatting.clock(3600), "1:00:00")
        XCTAssertEqual(TimeFormatting.clock(3723), "1:02:03")
        XCTAssertEqual(TimeFormatting.clock(36_000), "10:00:00")
    }

    func testClockHandlesInvalidInput() {
        XCTAssertEqual(TimeFormatting.clock(-5), "0:00")
        XCTAssertEqual(TimeFormatting.clock(.nan), "0:00")
        XCTAssertEqual(TimeFormatting.clock(.infinity), "0:00")
        XCTAssertEqual(TimeFormatting.clock(-.infinity), "0:00")
    }

    func testSpoken() {
        XCTAssertEqual(TimeFormatting.spoken(0), "0 seconds")
        XCTAssertEqual(TimeFormatting.spoken(1), "1 second")
        XCTAssertEqual(TimeFormatting.spoken(187), "3 minutes 7 seconds")
        XCTAssertEqual(TimeFormatting.spoken(3600), "1 hour")
        XCTAssertEqual(TimeFormatting.spoken(3661), "1 hour 1 minute 1 second")
    }

    func testNumberFormatting() {
        XCTAssertEqual(NumberFormatting.bpm(92), "92")
        XCTAssertEqual(NumberFormatting.bpm(92.04), "92")
        XCTAssertEqual(NumberFormatting.bpm(127.55), "127.6")
        XCTAssertEqual(NumberFormatting.bpm(0), "-")
        XCTAssertEqual(NumberFormatting.decibels(-9.14), "-9.1")
        XCTAssertEqual(NumberFormatting.decibels(0), "0.0")
        XCTAssertEqual(NumberFormatting.decibels(-.infinity), "-inf")
        XCTAssertEqual(NumberFormatting.percent(0.424), "42%")
        XCTAssertEqual(NumberFormatting.percent(1.7), "100%")
        XCTAssertEqual(NumberFormatting.percent(-1), "0%")
    }
}

final class ServerURLTests: XCTestCase {
    func testNormalisation() {
        XCTAssertEqual(ServerURL.normalizedString("https://mpindahouse-stem-master.hf.space"), "https://mpindahouse-stem-master.hf.space")
        XCTAssertEqual(ServerURL.normalizedString("https://example.com/"), "https://example.com")
        XCTAssertEqual(ServerURL.normalizedString("https://example.com///"), "https://example.com")
        XCTAssertEqual(ServerURL.normalizedString("  https://example.com/  \n"), "https://example.com")
        XCTAssertEqual(ServerURL.normalizedString("example.com"), "https://example.com", "missing scheme becomes https")
        XCTAssertEqual(ServerURL.normalizedString("example.com:7860/"), "https://example.com:7860")
        XCTAssertEqual(ServerURL.normalizedString("http://192.168.1.20:7860"), "http://192.168.1.20:7860")
        XCTAssertEqual(ServerURL.normalizedString("HTTPS://Example.COM/Stem/"), "https://example.com/Stem", "scheme/host lower-cased, path kept")
        XCTAssertEqual(ServerURL.normalizedString("https://example.com/api/?x=1#frag"), "https://example.com/api")
        XCTAssertEqual(ServerURL.normalizedString("localhost:7860"), "https://localhost:7860")
    }

    /// Users paste API paths from the docs; requests would then go to /v1/v1/... and 404.
    func testPastedAPIPathsAreStripped() {
        XCTAssertEqual(ServerURL.normalizedString("https://example.com/v1"), "https://example.com")
        XCTAssertEqual(ServerURL.normalizedString("https://example.com/v1/"), "https://example.com")
        XCTAssertEqual(ServerURL.normalizedString("https://example.com/v1/health"), "https://example.com")
        XCTAssertEqual(ServerURL.normalizedString("https://example.com/stem-master/v1/jobs/abc"), "https://example.com/stem-master")
        XCTAssertEqual(ServerURL.normalizedString("https://example.com/v10"), "https://example.com/v10", "not an API path")
        XCTAssertEqual(ServerURL.normalizedString("https://example.com/av1"), "https://example.com/av1")
    }

    func testRejectsUnusableInput() {
        XCTAssertNil(ServerURL.normalize(""))
        XCTAssertNil(ServerURL.normalize("   "))
        XCTAssertNil(ServerURL.normalize("ftp://example.com"))
        XCTAssertNil(ServerURL.normalize("https://"))
        XCTAssertNil(ServerURL.normalize("my server"))
    }

    func testResolveKeepsPathPrefix() throws {
        let base = try XCTUnwrap(ServerURL.normalize("https://example.com/stem-master/"))
        XCTAssertEqual(
            ServerURL.resolve("/v1/jobs/abc/stems/vocals.wav", against: base)?.absoluteString,
            "https://example.com/stem-master/v1/jobs/abc/stems/vocals.wav"
        )
        XCTAssertEqual(ServerURL.resolve("v1/health", against: base)?.absoluteString, "https://example.com/stem-master/v1/health")
        let plain = try XCTUnwrap(ServerURL.normalize("https://example.com"))
        XCTAssertEqual(ServerURL.resolve("/v1/jobs", against: plain)?.absoluteString, "https://example.com/v1/jobs")
        XCTAssertEqual(
            ServerURL.resolve("https://cdn.example.com/x.zip", against: plain)?.absoluteString,
            "https://cdn.example.com/x.zip",
            "absolute URLs pass through"
        )
    }

    func testAPIClientBuildsAuthorizedRequests() throws {
        let client = APIClient(configuration: APIClient.Configuration(
            baseURL: ServerURL.normalize("https://example.com/"),
            apiKey: "  secret-key ",
            clientID: "8b0f2c58-5a0e-4b9e-9d0a-1d8c3f3c2a11"
        ))
        let request = try client.request("/v1/jobs/\(Fixtures.jobID)", method: "DELETE")
        XCTAssertEqual(request.url?.absoluteString, "https://example.com/v1/jobs/\(Fixtures.jobID)")
        XCTAssertEqual(request.httpMethod, "DELETE")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer secret-key")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Client-Id"), "8b0f2c58-5a0e-4b9e-9d0a-1d8c3f3c2a11")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/json")

        client.updateConfiguration(APIClient.Configuration(baseURL: ServerURL.normalize("https://example.com"), apiKey: "", clientID: "id"))
        XCTAssertNil(try client.request("/v1/health").value(forHTTPHeaderField: "Authorization"), "no key, no header")

        client.updateConfiguration(APIClient.Configuration(baseURL: nil, apiKey: nil, clientID: "id"))
        XCTAssertThrowsError(try client.request("/v1/health")) { error in
            XCTAssertEqual(error as? APIError, .invalidServerURL)
        }
    }

    func testClientIdentityIsStable() throws {
        let suiteName = "StemMasterTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let first = ClientIdentity.current(defaults: defaults)
        XCTAssertNotNil(UUID(uuidString: first))
        XCTAssertEqual(first, first.lowercased())
        XCTAssertEqual(ClientIdentity.current(defaults: defaults), first)
    }
}

final class MiscLogicTests: XCTestCase {
    func testHexColor() throws {
        let orange = try XCTUnwrap(HexColor.parse("#FF7A1A"))
        XCTAssertEqual(orange.red, 1, accuracy: 1e-9)
        XCTAssertEqual(orange.green, 122.0 / 255, accuracy: 1e-9)
        XCTAssertEqual(orange.blue, 26.0 / 255, accuracy: 1e-9)
        XCTAssertEqual(HexColor.parse("3ad6c5"), HexColor.parse("#3AD6C5"))
        XCTAssertEqual(HexColor.parse("#fff"), RGBColor(red: 1, green: 1, blue: 1))
        XCTAssertNil(HexColor.parse("#12345"))
        XCTAssertNil(HexColor.parse("#GGGGGG"))
        XCTAssertNil(HexColor.parse(""))
        XCTAssertEqual(StemCatalog.colorHex(for: Fixtures.stem("bass", group: .bass, role: .primary)), "#FF7A1A")
        var broken = Fixtures.stem("bass", group: .bass, role: .primary)
        broken.color = "violet"
        XCTAssertEqual(StemCatalog.colorHex(for: broken), "#7C5CFF", "falls back to the catalogue colour")
    }

    func testFileNaming() {
        XCTAssertEqual(FileNaming.sanitize("My/Song: Live?"), "My_Song_ Live_")
        XCTAssertEqual(FileNaming.sanitize("..hidden"), "hidden")
        XCTAssertEqual(FileNaming.sanitize("   "), "Untitled")
        XCTAssertEqual(FileNaming.sanitize(String(repeating: "a", count: 300)).count, 120)
        XCTAssertEqual(FileNaming.sanitizeKeepingExtension("My:Song.MP3"), "My_Song.mp3")
        XCTAssertEqual(FileNaming.sanitizeKeepingExtension("noext"), "noext")
        XCTAssertEqual(FileNaming.title(fromFilename: "My Song.final.wav"), "My Song.final")
        XCTAssertEqual(FileNaming.stemWAVName(trackTitle: "My Song", stemName: "Lead Vocals (Dry)"), "My Song - Lead Vocals (Dry).wav")
        XCTAssertEqual(FileNaming.zipName(trackTitle: "My Song"), "My Song - Stem Master.zip")
        XCTAssertEqual(FileNaming.mimeType(forPathExtension: "MP3"), "audio/mpeg")
        XCTAssertEqual(FileNaming.mimeType(forPathExtension: "flac"), "audio/flac")
        XCTAssertEqual(FileNaming.mimeType(forPathExtension: "m4a"), "audio/mp4")
        XCTAssertEqual(FileNaming.mimeType(forPathExtension: "xyz"), "application/octet-stream")
    }

    /// Long titles must not cut the stem name off (every stem would get the same file name),
    /// and names must fit the 255-byte file-name limit even for non-Latin titles.
    func testStemFileNamesStayDistinctAndFitTheFileSystem() {
        let longLatin = String(repeating: "Extended Club Mix ", count: 12)
        let japanese = String(repeating: "夜明けの歌", count: 30)
        for title in [longLatin, japanese] {
            let lead = FileNaming.stemWAVName(trackTitle: title, stemName: "Lead Vocals (Dry)")
            let backing = FileNaming.stemWAVName(trackTitle: title, stemName: "Backing Vocals")
            XCTAssertNotEqual(lead, backing)
            XCTAssertTrue(lead.hasSuffix(" - Lead Vocals (Dry).wav"), lead)
            XCTAssertLessThanOrEqual(lead.utf8.count, 255)
            let zip = FileNaming.zipName(trackTitle: title)
            XCTAssertTrue(zip.hasSuffix(" - Stem Master.zip"), zip)
            XCTAssertLessThanOrEqual(zip.utf8.count, 255)
        }
        XCTAssertLessThanOrEqual(FileNaming.sanitize(japanese).utf8.count, 255)
        XCTAssertEqual(FileNaming.stemWAVName(trackTitle: "My Song", stemName: "Kick"), "My Song - Kick.wav")
    }

    func testPollerBackoff() {
        XCTAssertEqual(JobPoller.delay(afterFailures: 0, interval: 1.5, maxBackoff: 15), 1.5)
        XCTAssertEqual(JobPoller.delay(afterFailures: 1, interval: 1.5, maxBackoff: 15), 3)
        XCTAssertEqual(JobPoller.delay(afterFailures: 2, interval: 1.5, maxBackoff: 15), 6)
        XCTAssertEqual(JobPoller.delay(afterFailures: 3, interval: 1.5, maxBackoff: 15), 12)
        XCTAssertEqual(JobPoller.delay(afterFailures: 4, interval: 1.5, maxBackoff: 15), 15)
        XCTAssertEqual(JobPoller.delay(afterFailures: 100, interval: 1.5, maxBackoff: 15), 15)
    }

    /// Short descriptions under the stem names, so vocal and room stems are unambiguous.
    func testStemDescriptions() {
        for id in ["lead_vocals", "backing_vocals", "vocals_dry", "vocal_reverb", "vocal_ambience", "drum_room", "removed_bleed", "removed_noise"] {
            XCTAssertFalse((StemCatalog.detail(for: id) ?? "").isEmpty, id)
        }
        XCTAssertNil(StemCatalog.detail(for: "kick"))
        XCTAssertNil(StemCatalog.detail(for: "theremin"))
    }

    func testWaveformDisplayCurve() {
        XCTAssertEqual(WaveformCurve.displayLevel(0), 0)
        XCTAssertEqual(WaveformCurve.displayLevel(1), 1, accuracy: 1e-12)
        XCTAssertGreaterThan(WaveformCurve.displayLevel(0.1), 0.1, "quiet peaks are lifted for visibility")
        XCTAssertEqual(WaveformCurve.displayLevel(.nan), 0)
        XCTAssertEqual(WaveformCurve.displayLevel(4), 1)
    }
}
