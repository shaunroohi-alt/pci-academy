# Browser audio engine

`BrowserAudioEngine` uses the browser's real audio clock and Web Audio graph. It starts an interactive 44.1 kHz AudioContext in a user gesture. Source import and demo generation prepare decoded buffers without replacing the current session; installing new source metadata commits the change. WAV/MP3/FLAC and other browser-supported formats use native decoding. PCM AIFF/AIFC has a local fallback decoder.

## Sampling and stems

The engine supports 32 cues, up to 32 simultaneous voices, trigger/hold gates, per-track mono/poly behavior, velocity, attack/release, gain, low/high-pass filtering, reverse, glide and scheduled starts/stops. A released pending note cannot start later. Scheduled gates can be moved before they occur, and sequencer lookahead does not prematurely steal nonoverlapping notes.

Pitch/time mode uses SoundTouchJS 2.1.1 in an AudioWorklet for independent pitch and speed; unity playback bypasses the worklet. Disabling pitch/time mode uses varispeed, which couples rate and pitch. Live edits update active voices. BPM estimation uses onset correlation; key estimation uses bounded FFT/chroma analysis and major/minor key profiles. Noise or silence can return `Unknown`. Estimates are editable.

Four stems are ordered vocals, melody/other, bass and drums. Global and cue masks control the actual stem audio. Imported stems must match the source frame count and sample rate. Stems are bound to the source ID, so opening a session can stage its cached stems before metadata is installed without mixing them with another source.

`BrowserStemService` runs local HTDemucs inference in a worker using the bundled Demucs WASM backend and verified model. It resamples to the model's 44.1 kHz rate and returns exactly aligned source-rate buffers. Separation can be cancelled by terminating the worker. It is CPU and memory intensive, especially for long files; importing four aligned stems is also supported. This is an independent HTDemucs implementation; it does not contain Serato's proprietary Stems model.

## Mixer, effects and recording

Eight tracks provide stereo pan, faders, mute/solo, two post-fader sends, A/B/Thru crossfader assignment and peak meters. Each track, both returns and the master have four effect slots. The 15 processors are three-band EQ, compressor, saturation, bit crusher, chorus, stereo delay, reverb, resonant filter, tremolo, limiter, stereo width, transient shaper, flanger, phaser and tape colour. All have real DSP graphs, wet/dry and bypass controls; 26 preset chains share their definitions with the interface.

Live mix recording captures the actual stereo master PCM through an AudioWorklet. WAV files are 24-bit PCM with clamping at full scale. Cue export and pattern rendering use an OfflineAudioContext with source transforms, cue envelopes, track effects, sends and the master rack. Pattern rendering returns exactly one pattern loop, so effect tails beyond its end are trimmed. Asset clip rate follows the project tempo relative to its declared source BPM.

## Practical limits

- Audio input is mono or stereo, up to 32 million frames per buffer and 512 MB per imported file. Supported sample rates also depend on the browser. At 44.1 kHz, the frame limit is about 12 minutes.
- Live recording has a 256 MiB floating-point PCM capture limit, about 12 minutes 41 seconds at 44.1 kHz stereo. Exceeding it reports an error and discards the incomplete take. WAV encoding and session storage need additional memory.
- Browser background-tab throttling, output-device latency and available CPU affect live timing and heavy effect/stem workloads. Chromium is the automated verification target; other browsers need their own device testing.
- The browser uses SoundTouchJS and Web Audio processors. The native application uses different DSP, including Rubber Band. Latency, stretching artifacts, effect behavior and resulting sound can differ.
- Installed Audio Unit and VST3 plugins are native-only. Browser effects are the built-in rack; this web application does not load desktop plugin binaries.
- This is an independent sampler implementation. It does not include Serato Pitch 'n Time or claim identical proprietary engine output.

## Reproduce audio checks

From the project root, run `npm ci`, then start `npm run dev -- --port 5188` in one terminal. In another:

```sh
npx vitest run src/audio/pcm.test.ts
CHROMIUM_PATH=/usr/bin/chromium node src/audio/verify.browser.mjs http://127.0.0.1:5188/brain-storm/
```

The browser suite uses real AudioContexts, AudioWorklets, live stereo capture and offline renders. Among its assertions, a 440 Hz source pitched up 12 semitones at half speed produces about 880 Hz for twice the duration; varispeed produces the coupled alternative. It also checks 40 future nonoverlapping notes, release rescheduling, live pitch edits, stem source binding, and cancelled or rejected source preparation preserving the current audio. The four PCM tests check major/minor detection, noise/silence confidence, 24-bit WAV framing/interleaving/clamping and malformed AIFF rejection.

Run the full project checks with `npm test` and `npm run build`. Neural stem checks are separate:

```sh
STEMS_TEST_BASE_URL=http://127.0.0.1:5188/brain-storm/ node scripts/verify-stems.browser.mjs
```
