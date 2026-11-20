import AVFoundation
import MediaPlayer
import Observation

enum StemPlayerError: LocalizedError {
    case noStems

    var errorDescription: String? {
        switch self {
        case .noStems: return "There are no stems to play."
        }
    }
}

/// Multitrack player for a session's stem previews.
///
/// Graph: one `AVAudioPlayerNode` per stem -> a per-stem `AVAudioMixerNode` (mute/solo/volume
/// gain) -> the engine's main mixer. Files are streamed from disk with `scheduleSegment`, never
/// loaded whole. Every play or seek stops all players, schedules each one from the same source
/// frame and starts them with `play(at:)` against one shared `AVAudioTime` 100 ms in the
/// future, so all stems start on the same render cycle (sample-accurate sync).
///
/// The playhead is read ~30 times a second from the reference player's
/// `lastRenderTime` -> `playerTime(forNodeTime:)`. Playback stops at the end (no loop).
@Observable
@MainActor
final class StemPlayer {
    private(set) var isLoaded = false
    private(set) var isPlaying = false
    /// Seconds from the start of the track.
    private(set) var currentTime: Double = 0
    private(set) var duration: Double = 0
    private(set) var channelStates: [String: MixerChannelState] = [:]
    private(set) var errorMessage: String?

    private struct Channel {
        let file: AVAudioFile
        let player: AVAudioPlayerNode
        let mixer: AVAudioMixerNode
        let role: StemRole
    }

    @ObservationIgnored private let engine = AVAudioEngine()
    @ObservationIgnored private var channels: [String: Channel] = [:]
    @ObservationIgnored private var order: [String] = []
    /// Track position at which the running segment was scheduled.
    @ObservationIgnored private var segmentStart: Double = 0
    @ObservationIgnored private var ticker: Task<Void, Never>?
    @ObservationIgnored private var observers: [NSObjectProtocol] = []
    @ObservationIgnored private var remoteTargets: [(command: MPRemoteCommand, target: Any)] = []
    @ObservationIgnored private var resumeAfterInterruption = false
    @ObservationIgnored private var title = ""

    /// Lead time before a synchronized start.
    private static let startLeadSeconds: Double = 0.1
    /// Playhead refresh interval (~30 Hz).
    private static let tickNanoseconds: UInt64 = 33_000_000

    init() {}

    // MARK: Loading

    /// Loads one channel per stem (removed stems start muted) and prepares the engine.
    func load(stems: [Stem], fileURLs: [String: URL], title: String) throws {
        shutdown()
        self.title = title
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
            var states: [String: MixerChannelState] = [:]
            var loadedOrder: [String] = []
            var longest: Double = 0
            for stem in stems {
                guard let url = fileURLs[stem.id] else { continue }
                let file = try AVAudioFile(forReading: url)
                let format = file.processingFormat
                let player = AVAudioPlayerNode()
                let mixer = AVAudioMixerNode()
                engine.attach(player)
                engine.attach(mixer)
                engine.connect(player, to: mixer, format: format)
                engine.connect(mixer, to: engine.mainMixerNode, format: format)
                channels[stem.id] = Channel(file: file, player: player, mixer: mixer, role: stem.role)
                loadedOrder.append(stem.id)
                states[stem.id] = MixerChannelState.initial(for: stem.role)
                if format.sampleRate > 0 {
                    longest = max(longest, Double(file.length) / format.sampleRate)
                }
            }
            guard !loadedOrder.isEmpty else { throw StemPlayerError.noStems }
            order = loadedOrder
            channelStates = states
            duration = longest
            currentTime = 0
            segmentStart = 0
            errorMessage = nil
            applyGains()
            engine.prepare()
            installObservers()
            installRemoteCommands()
            isLoaded = true
            updateNowPlaying()
        } catch {
            shutdown()
            throw error
        }
    }

    /// Stops playback and tears the graph down (call when the mixer goes away).
    func shutdown() {
        ticker?.cancel()
        ticker = nil
        stopPlayers()
        if engine.isRunning {
            engine.stop()
        }
        for channel in channels.values {
            engine.detach(channel.player)
            engine.detach(channel.mixer)
        }
        channels = [:]
        order = []
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
        observers = []
        for entry in remoteTargets {
            entry.command.removeTarget(entry.target)
        }
        remoteTargets = []
        let wasLoaded = isLoaded
        isLoaded = false
        isPlaying = false
        currentTime = 0
        duration = 0
        segmentStart = 0
        channelStates = [:]
        if wasLoaded {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    // MARK: Transport

    func togglePlayback() {
        if isPlaying { pause() } else { play() }
    }

    func play() {
        guard isLoaded, !isPlaying else { return }
        do {
            try AVAudioSession.sharedInstance().setActive(true)
            if !engine.isRunning {
                try engine.start()
            }
        } catch {
            errorMessage = "Playback couldn't start: \(error.localizedDescription)"
            return
        }
        errorMessage = nil
        let start = currentTime >= duration - 0.05 ? 0 : currentTime
        startSegment(at: start)
    }

    func pause() {
        guard isPlaying else { return }
        let position = livePosition()
        stopPlayers()
        isPlaying = false
        ticker?.cancel()
        ticker = nil
        currentTime = position
        segmentStart = position
        engine.pause()
        updateNowPlaying()
    }

    /// Moves the playhead; keeps playing if playing.
    func seek(to seconds: Double) {
        guard isLoaded else { return }
        let target = min(max(seconds, 0), duration)
        if isPlaying {
            startSegment(at: target)
        } else {
            currentTime = target
            segmentStart = target
            updateNowPlaying()
        }
    }

    func skip(by seconds: Double) {
        seek(to: livePosition() + seconds)
    }

    /// Schedules every channel from the same frame and starts them together.
    private func startSegment(at seconds: Double) {
        let start = min(max(seconds, 0), duration)
        let startTime = AVAudioTime(hostTime: mach_absolute_time() + AVAudioTime.hostTime(forSeconds: Self.startLeadSeconds))
        for id in order {
            guard let channel = channels[id] else { continue }
            channel.player.stop()
            let rate = channel.file.processingFormat.sampleRate
            let startFrame = AVAudioFramePosition((start * rate).rounded(.down))
            let remaining = channel.file.length - startFrame
            guard remaining > 0 else { continue }
            let frames = AVAudioFrameCount(min(remaining, AVAudioFramePosition(UInt32.max)))
            channel.player.scheduleSegment(channel.file, startingFrame: startFrame, frameCount: frames, at: nil, completionHandler: nil)
        }
        for id in order {
            channels[id]?.player.play(at: startTime)
        }
        segmentStart = start
        currentTime = start
        isPlaying = true
        startTicker()
        updateNowPlaying()
    }

    private func stopPlayers() {
        for channel in channels.values {
            channel.player.stop()
        }
    }

    /// Seconds rendered by the reference player since the segment started (negative during the
    /// lead-in, `nil` when not rendering).
    private func renderedSeconds() -> Double? {
        guard let id = order.first,
              let player = channels[id]?.player,
              let nodeTime = player.lastRenderTime,
              let playerTime = player.playerTime(forNodeTime: nodeTime),
              playerTime.sampleRate > 0 else {
            return nil
        }
        return Double(playerTime.sampleTime) / playerTime.sampleRate
    }

    private func livePosition() -> Double {
        guard isPlaying, let rendered = renderedSeconds() else { return currentTime }
        return min(segmentStart + max(0, rendered), duration)
    }

    private func startTicker() {
        ticker?.cancel()
        ticker = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                guard let player = self, player.tick() else { return }
                try? await Task.sleep(nanoseconds: StemPlayer.tickNanoseconds)
            }
        }
    }

    /// Updates the playhead. Returns `false` when ticking should stop.
    private func tick() -> Bool {
        guard isPlaying else { return false }
        let position = segmentStart + max(0, renderedSeconds() ?? 0)
        if position >= duration {
            finishPlayback()
            return false
        }
        currentTime = position
        return true
    }

    /// Reached the end: stop and rewind (loop is off).
    private func finishPlayback() {
        stopPlayers()
        isPlaying = false
        ticker = nil
        currentTime = 0
        segmentStart = 0
        engine.pause()
        updateNowPlaying()
    }

    // MARK: Mixer

    func state(for id: String) -> MixerChannelState {
        channelStates[id] ?? MixerChannelState()
    }

    var hasSolo: Bool { channelStates.values.contains { $0.isSoloed } }

    /// Whether a channel is heard after mute/solo resolution.
    func isAudible(_ id: String) -> Bool {
        MixerGain.isAudible(state(for: id), anySolo: hasSolo)
    }

    func toggleMute(_ id: String) {
        guard var state = channelStates[id] else { return }
        state.isMuted.toggle()
        channelStates[id] = state
        applyGains()
    }

    func toggleSolo(_ id: String) {
        guard var state = channelStates[id] else { return }
        state.isSoloed.toggle()
        channelStates[id] = state
        applyGains()
    }

    func setVolume(_ volume: Float, for id: String) {
        guard var state = channelStates[id] else { return }
        state.volume = MixerGain.clampedVolume(volume)
        channelStates[id] = state
        applyGains()
    }

    /// Unity faders, no solo, primaries unmuted, removed stems muted.
    func resetMixer() {
        var states: [String: MixerChannelState] = [:]
        for (id, channel) in channels {
            states[id] = MixerChannelState.initial(for: channel.role)
        }
        channelStates = states
        applyGains()
    }

    private func applyGains() {
        let gains = MixerGain.resolve(channelStates)
        for (id, gain) in gains {
            channels[id]?.mixer.outputVolume = gain
        }
    }

    // MARK: System integration

    private func installObservers() {
        let center = NotificationCenter.default
        let session = AVAudioSession.sharedInstance()
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: .main) { [weak self] note in
            let typeValue = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            let optionsValue = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt
            MainActor.assumeIsolated {
                self?.handleInterruption(typeValue: typeValue, optionsValue: optionsValue)
            }
        })
        observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: session, queue: .main) { [weak self] note in
            let reasonValue = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
            MainActor.assumeIsolated {
                self?.handleRouteChange(reasonValue: reasonValue)
            }
        })
        observers.append(center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.handleEngineConfigurationChange()
            }
        })
    }

    private func handleInterruption(typeValue: UInt?, optionsValue: UInt?) {
        guard let typeValue, let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }
        switch type {
        case .began:
            resumeAfterInterruption = isPlaying
            if isPlaying { pause() }
        case .ended:
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue ?? 0)
            if resumeAfterInterruption, options.contains(.shouldResume) {
                play()
            }
            resumeAfterInterruption = false
        @unknown default:
            break
        }
    }

    private func handleRouteChange(reasonValue: UInt?) {
        guard let reasonValue, let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else { return }
        // Headphones unplugged / Bluetooth gone: pause instead of blasting the speaker.
        if reason == .oldDeviceUnavailable {
            pause()
        }
    }

    /// The engine stops itself when the hardware format changes; reschedule from the playhead.
    private func handleEngineConfigurationChange() {
        guard isLoaded else { return }
        let wasPlaying = isPlaying
        let position = currentTime
        stopPlayers()
        isPlaying = false
        ticker?.cancel()
        ticker = nil
        currentTime = position
        segmentStart = position
        if wasPlaying {
            play()
        }
    }

    private func installRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()
        addRemoteTarget(center.playCommand) { player in player.play() }
        addRemoteTarget(center.pauseCommand) { player in player.pause() }
        addRemoteTarget(center.togglePlayPauseCommand) { player in player.togglePlayback() }
        let seekTarget = center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let player = self, let positionEvent = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            let position = positionEvent.positionTime
            Task { @MainActor in player.seek(to: position) }
            return .success
        }
        remoteTargets.append((command: center.changePlaybackPositionCommand, target: seekTarget))
    }

    private func addRemoteTarget(_ command: MPRemoteCommand, action: @escaping @MainActor (StemPlayer) -> Void) {
        let target = command.addTarget { [weak self] _ in
            guard let player = self else { return .commandFailed }
            Task { @MainActor in action(player) }
            return .success
        }
        remoteTargets.append((command: command, target: target))
    }

    private func updateNowPlaying() {
        guard isLoaded else { return }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: "Stem Master by MP Audio",
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: currentTime,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
        ]
    }
}
