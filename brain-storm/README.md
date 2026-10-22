# Brain Storm / Samplify browser sampler

Browser adaptation of [Samplify](https://github.com/sroohi/mellowdy-chop), built with React, TypeScript, Web Audio and AudioWorklet. The application is served under `/brain-storm/` and processes imported audio locally. Start audio with a click or key press; use HTTPS or localhost for AudioWorklet.

## Run and build

Use Node.js 22 or later.

```sh
npm ci
npm run dev -- --port 5188
```

Open `http://localhost:5188/brain-storm/`. For production, run `npm run build` and serve the contents of `dist/` at `/brain-storm/`, including its `assets`, `stems`, `models` and `licenses` directories. `BASE_PATH=/preview npm run build` changes the public path to `/preview/brain-storm/`.

The checked-in stem WASM and model parts are needed for neural separation. The model is downloaded on demand, totals 83,994,361 bytes, and is checked against its pinned SHA-256. Rebuilding that backend requires Emscripten, CMake, the pinned Demucs/Eigen sources and the converted model; see `scripts/build-stems.py`.

## Audio and verification

The sampler includes 32 cues, independent pitch/time, four stems, 16 patterns, eight mixer tracks, send/return and master effects, and live stereo WAV capture. See [the audio engine notes](docs/audio-engine.md) for behavior, limits and browser differences.

```sh
npm test
npm run build
```

With the development server running on port 5188 and Chromium installed:

```sh
CHROMIUM_PATH=/usr/bin/chromium node src/audio/verify.browser.mjs http://127.0.0.1:5188/brain-storm/
STEMS_TEST_BASE_URL=http://127.0.0.1:5188/brain-storm/ node scripts/verify-stems.browser.mjs
```

The audio suite measures real live/recorded PCM, pitch/time output, rendered cues/patterns, stem masks, staged source import, cache restoration and scheduled voice timing in Chromium. The stem suite runs actual WASM inference and checks alignment, nonzero distinct outputs, cancellation and corrupt model rejection. Stem inference is CPU intensive and takes longer than the audio suite. Its script uses `/usr/bin/chromium`.

## License

This browser adaptation is distributed under GPL-3.0, matching the native application's license; see [LICENSE](LICENSE). Modified browser implementation: 22 October 2026. Third-party terms remain applicable to their respective components; full notices are bundled in [public/licenses](public/licenses/THIRD_PARTY_NOTICES.md), with model/backend notices in [public/stems](public/stems/NativeStems-Notice.txt).

Distribute the matching application source and build files with a production build, or provide equivalent source access beside it. Include the license and notice files in the deployment.
