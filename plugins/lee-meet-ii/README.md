# Lee-Meet II by MP Audio

Mastering limiter / maximizer. AU (Logic Pro, GarageBand, MainStage), VST3 (everything else) and a standalone app, built with JUCE 8.

```
Input gain ─► Fatness ─► Mid/Side presence + Width ─► Parallel compression ─► LUFS control ─► True-peak limiter ─► Out
   (sensitivity)         (saturation, 2x OS)            (int / ext side-chain)   (feed-forward AGC)   (8x detection, 2 ms look-ahead)
```

## Controls

| Section | Control | What it does |
|---|---|---|
| **Input** | Input Gain | -24 … +24 dB manual drive into the chain. |
| | Sensitivity | How eagerly the plug-in picks up the incoming signal. Blends the loudness detector between short-term (3 s) and momentary (400 ms), shortens the gain time-constant (4 s → 150 ms) and widens the maximum auto boost (+6 → +24 dB). |
| **Fatness** | Fatness | 2x-oversampled soft saturation with a low-shelf pre-emphasis, blended in parallel. Adds low-order harmonics and density without a level jump (unity at -6 dBFS). |
| **Mid / Side** | Width | 0 … 200 % stereo width (side gain). |
| | Pres Freq / Mid / Side | Presence bell (1 – 8 kHz, Q 0.8) with independent ±12 dB gain on the mid and the side channel. |
| **Parallel Compression** | Threshold, Ratio, Attack, Release, Makeup | Stereo-linked feed-forward compressor, 6 dB soft knee. |
| | Mix | Parallel blend. 0 % = compressor out of the path, 100 % = fully serial. |
| | Internal / External | Detector source. *External* keys the compressor from the side-chain bus (Logic: the **Side Chain** menu in the plug-in header). |
| | SC HPF | 20 – 500 Hz high-pass on the detector only, so bass does not pump the compressor. |
| | Listen | Monitors what the detector hears. |
| **LUFS Control** | Target | -30 … -6 LUFS. |
| | Auto | Feed-forward loudness control: measures the K-weighted loudness of the programme entering the limiter and applies a slow gain so it lands on the target. Feed-forward, so it cannot oscillate; gated below -55 LUFS so pauses do not pump the noise floor. |
| | Readout | Output loudness per ITU-R BS.1770-4 / EBU R128: integrated (gated), short-term, momentary, plus the current auto gain. Reset clears the integrated measurement. |
| **Master Limiter** | Ceiling | -6 … 0 dBTP true-peak ceiling. |
| | Release | 5 – 1000 ms. Attack is the fixed 2 ms look-ahead. |
| | On | Bypasses the limiter only (latency stays constant). |
| **Output** | Meters | Output peak L/R, compressor and limiter gain reduction. |
| **Bypass** | | Host-bypass aware and latency-compensated. |

Latency is reported to the host (2 ms look-ahead + 16 samples of true-peak interpolation + a few samples from the fatness oversampler), so Logic's plug-in delay compensation keeps everything aligned.

### Limiter design

Detection runs on an oversampled copy (8x at 44.1/48 kHz, 4x at 88.2/96 kHz, 2x above; 32-tap-per-phase Kaiser interpolator). The gain computer is *required gain → release one-pole → sliding minimum → box average*, which guarantees the gain has ramped down linearly over the look-ahead by the time a peak arrives, with no overshoot from the smoothing itself. The gain is applied to the un-oversampled signal, so the audio path is bit-transparent below the ceiling: no resampling filter ever touches it. The test suite checks true peak against an independent 8x reference and passes within 0.1 dB.

## Building

Requirements: CMake ≥ 3.22, a C++17 compiler (Xcode 15+, Visual Studio 2022, GCC 11+/Clang 14+). JUCE 8.0.4 is fetched automatically at configure time (`-DFETCHCONTENT_SOURCE_DIR_JUCE=/path/to/JUCE` to use a local checkout).

```bash
cd plugins/lee-meet-ii
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release --parallel
ctest --test-dir build -C Release --output-on-failure      # DSP tests
```

Outputs land in `build/LeeMeetII_artefacts/Release/{AU,VST3,Standalone}`. On macOS the AU/VST3 are universal (arm64 + x86_64, macOS 10.13+). Copy `Lee-Meet II.component` to `~/Library/Audio/Plug-Ins/Components/` and restart Logic Pro; validate manually with:

```bash
auval -v aufx Lmt2 MPau
```

Linux build dependencies (Debian/Ubuntu): `libasound2-dev libfreetype-dev libfontconfig1-dev libx11-dev libxext-dev libxrandr-dev libxinerama-dev libxcursor-dev libxcomposite-dev libgl1-mesa-dev libcurl4-openssl-dev`.

## Releasing

The `lee-meet-ii` GitHub Actions workflow builds on macOS, Windows and Linux, runs the DSP tests, `auval` (Apple's Audio Unit validator, the same check Logic runs) and Tracktion `pluginval` at strictness 5, and uploads zips as artifacts. Pushing a tag creates a GitHub Release with all of them:

```bash
git tag lee-meet-ii-v2.0.0 && git push origin lee-meet-ii-v2.0.0
```

macOS binaries are ad-hoc signed. For Gatekeeper-clean distribution add repository secrets `MACOS_CERTIFICATE_P12` (base64 of a Developer ID Application .p12), `MACOS_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID` and `APPLE_APP_PASSWORD`; the workflow then signs with the hardened runtime, notarizes and staples automatically.

## Licence

JUCE 8 is dual-licensed AGPLv3 / commercial. This source is provided under the AGPLv3 to match; to ship closed-source builds, obtain a JUCE licence from juce.com.
