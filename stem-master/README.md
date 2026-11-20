# Stem Master by MP Audio

Stem Master is a native iPhone app that splits a finished track into clean,
separately usable stems. You import an audio file, pick options, and a GPU
server runs a chain of separation models and DSP on it. The app then plays the
stems in a mixer (mute, solo, volume per stem) and exports them as lossless
WAV files or one ZIP.

The models that give the cleanest stems (BS-RoFormer and Mel-Band RoFormer,
roughly 0.2 to 1.7 GB each) are too large for an iPhone's memory and thermal
budget, so separation runs on the server and the phone handles import,
playback and export. [`SPEC.md`](SPEC.md) is the contract both sides are built
against. Deployment, step by step: [`DEPLOY.md`](DEPLOY.md).

## What you get

| Group | Stems |
|---|---|
| Vocals | Vocals; with **Vocal split**: Lead Vocals and Backing Vocals; with **Dereverb**: dry vocals plus a separate Vocal Reverb stem; Vocal Ambience (vocal remnants found in the instrumental, only when audible) |
| Drums | Drums; with **Drum split**: Kick, Snare, Toms, Hi-Hat, Ride, Crash, and Drum Room & Perc (whatever is left of the kit, only when audible) |
| Bass | Bass |
| Instruments | Guitar, Piano & Keys, Synths & Other |
| Removed | Removed Bleed (what Cleanup took out), Removed Noise (what Denoise took out). Muted by default. |

The drum kit is separated piece by piece (a dedicated drum model splits the
drum stem into kick, snare, toms, hi-hat, ride and crash), not handed back as
one drum line.

Guarantees (SPEC section 2):

- **The stems add up to the mix.** Each split keeps its residual (input minus
  the model's outputs) and assigns it to a stem, so the primary stems plus the
  `removed_*` stems sum back to the original track.
- **Nothing is normalised.** Every stem keeps its level relative to the mix.
  If an integer export format would clip, one common gain is applied to all
  stems and reported as `gain_offset_db`.
- **Sample-aligned.** Every file has exactly the source's length and sample
  rate, starting at sample 0, so the stems line up when dropped into a DAW.
- **Lossless export.** WAV in 24-bit (default), 32-bit float or 16-bit. The
  AAC files the app plays in the mixer are previews only.

The server also reports BPM, key (with Camelot code), integrated loudness,
peak level and an *artifact level* (how much codec-style noise and
high-frequency flicker the track has).

## Options

| Option | Default | What it does |
|---|---|---|
| Quality | Max | **Max** runs two vocal models as an ensemble; **Fast** runs one. |
| Drum split | On | Splits drums into kick, snare, toms, hi-hat, ride, crash (+ room). |
| Vocal split | On | Splits vocals into lead and backing. |
| Dereverb | Off | Dry vocals plus the removed reverb as its own stem. |
| Cleanup | On (standard) | Removes bleed between stems. Light / standard / strong. |
| Denoise | Off (standard) | Removes AI-generation artifacts. Light / standard / strong. |
| Output format | 24-bit WAV | 24-bit, 32-bit float or 16-bit WAV. |

### Cleanup and Denoise: the difference

**Cleanup** removes what does not belong in a stem: hi-hat leaking into the
vocal, vocal leaking into the guitar, low rumble in the hi-hat. It changes the
model choice (a bleed-minimising vocal ensemble, plus a model that strips
vocal bleed out of the instrumental) and then runs three DSP passes on every
stem:

1. cross-stem masking: in each time-frequency bin, a stem that owns only a
   small share of the energy is attenuated there;
2. activity gating: silence between phrases and hits is gated, so a stem is
   quiet where its instrument is not playing;
3. range filters: a high-pass per stem type (70 Hz on vocals, 300 Hz on hi-hat,
   kick and bass untouched, and so on).

**Denoise** targets the artifacts AI music generators leave in the audio: a
static noise floor, a shimmering or flickering high band from their neural
codec, DC offset and sub-sonic rumble. Vocal stems first go through a neural
denoise model; then every stem gets DC removal, a 20 Hz high-pass, spectral
noise-floor reduction and a high-band de-flicker that leaves transients alone.

Both are auditable: what Cleanup removes is returned as **Removed Bleed**, what
Denoise removes as **Removed Noise**. Solo them to hear exactly what was taken
out; add them back if it was too much.

Denoise does not remove provenance watermarks (the inaudible marks some
generators embed to identify their output). That is deliberate: the goal is
audible quality, not hiding where audio came from. The artifact level the
server reports describes the audio, not who or what made it.

### The vocal chain

Vocals get the most work, so they come out usable as a standalone line:

1. **Ensemble split.** With Cleanup on, two RoFormer vocal models
   (`bs_roformer_vocals_revive_v2_unwa` and
   `mel_band_roformer_kim_ft2_bleedless_unwa`) run on the mix and are combined
   per frequency bin taking the *smaller* magnitude (`min_fft`), which keeps
   the least instrument bleed. Without Cleanup, a different pair
   (`bs_roformer_vocals_resurrection_unwa` and `melband_roformer_big_beta6x`)
   is averaged (`avg_fft`), which keeps more vocal detail at the cost of a
   little more bleed. Fast quality uses the bleedless model alone.
2. **Residual accounting.** The instrumental is the mix minus the vocal, so
   nothing is lost between the two. Vocal remnants that the instrument model
   later finds in the instrumental are returned as Vocal Ambience instead of
   being mixed into "other".
3. **Lead / backing split** (Vocal split) with a karaoke model.
4. **Dereverb** (optional): dry lead and backing, and the reverb as its own stem.
5. **Cleanup:** bleed masking and gating against all other stems, 70 Hz
   high-pass.
6. **Denoise** (optional): neural vocal denoise, then the DSP passes above.

Everything runs at 44.1 kHz in 32-bit float and is resampled back to the
source rate at the end. Nothing beyond the Cleanup and Denoise passes you
choose touches the vocals: no normalisation, compression or EQ, so they arrive
raw and ready for your own processing.

## Architecture

```
iPhone (SwiftUI app)                         GPU server (Docker, FastAPI)
─────────────────────                        ─────────────────────────────
import audio ──── multipart upload ────────▶ POST /v1/jobs
options sheet                                 ├─ queue (1 GPU worker)
progress  ◀────── poll every 1.5 s ────────── GET /v1/jobs/{id}
mixer     ◀────── AAC previews (m4a) ──────── GET /v1/jobs/{id}/stems/{stem}.m4a
export    ◀────── lossless WAV / ZIP ──────── GET /v1/jobs/{id}/stems/{stem}.wav
                                              GET /v1/jobs/{id}/download.zip

server pipeline:
analyze → vocals → debleed → instruments → drums → vocal_split → dereverb
        → cleanup → denoise → finalize (WAV + AAC preview + ZIP manifest)
```

- **App** (`ios/`): SwiftUI, iOS 17+, iPhone. AVAudioEngine plays all stems
  against one start time for sample-accurate sync. The server URL and API key
  are set in Settings (the key is kept in the Keychain).
- **Server** (`server/`): FastAPI on Python 3.11, models run through
  [`audio-separator`](https://github.com/nomadkaraoke/python-audio-separator)
  on PyTorch. One job runs at a time per GPU; jobs and their files are deleted
  after 24 hours.
- **Contract** (`contract/job_completed.json`): a real completed job written
  by the server tests and decoded by the iOS tests, so a change on one side
  that breaks the other fails CI.

## Quick start

### Run the server with Docker

GPU host (NVIDIA driver and the NVIDIA Container Toolkit installed):

```bash
docker build -t stem-master-server stem-master/server
docker run --gpus all -p 7860:7860 -v stem-models:/data stem-master-server
curl http://localhost:7860/v1/health
# {"status":"ok","version":"1.0.0","device":"cuda","queue_length":0,"auth_required":false}
```

No GPU (works, but slowly; see Limitations):

```bash
docker build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu \
  -t stem-master-server:cpu stem-master/server
docker run -p 7860:7860 -v stem-models:/data stem-master-server:cpu
```

Main pushes publish the GPU image as
`ghcr.io/shaunroohi-alt/stem-master-server:latest`, so `docker build` can be
skipped on a host that can pull it. Models download into the `stem-models`
volume on first use; [`DEPLOY.md`](DEPLOY.md) section C shows how to fetch
them ahead of time. Set `-e STEM_MASTER_API_KEY=...` to require a key.

### Separate a track from the command line

The app is the main client, but the API works from any shell. Options are the
`JobOptions` fields from SPEC section 4; omitted fields use the defaults.

```bash
SERVER=http://localhost:7860
# If the server has STEM_MASTER_API_KEY set, add: -H "Authorization: Bearer $KEY"

JOB=$(curl -sf -F "file=@My Song.mp3" \
  --form-string 'options={"quality":"max","drum_split":true,"vocal_split":true,"cleanup":true,"denoise":true}' \
  "$SERVER/v1/jobs" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')

while :; do
  STATE=$(curl -sf "$SERVER/v1/jobs/$JOB" | python3 -c \
    'import json,sys; j=json.load(sys.stdin); print(j["status"], format(j["progress"], ".0%"), j["stage_label"] or "")')
  echo "$STATE"
  case "$STATE" in completed*|failed*|cancelled*) break ;; esac
  sleep 5
done

curl -sf -o "My Song - Stem Master.zip" "$SERVER/v1/jobs/$JOB/download.zip"
```

The ZIP holds every stem as WAV, `manifest.json` (the full job, including the
analysis and per-stem levels) and a `README.txt`.

### Run the server without Docker

Python 3.11 or newer, ffmpeg and libsndfile on the system:

```bash
cd stem-master/server
python -m venv .venv && . .venv/bin/activate
pip install torch                                    # or the CPU wheel: --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
python -m stem_master serve                          # http://localhost:7860

# tests (no models needed)
pip install -r requirements-dev.txt
STEM_MASTER_ENGINE=fake python -m pytest -q
```

Configuration is environment variables only (`STEM_MASTER_API_KEY`,
`STEM_MASTER_DATA_DIR`, `STEM_MASTER_MODEL_DIR`, upload and duration limits,
job lifetime, `PORT`); the full table is in SPEC section 5.

### Run the app

On a Mac with Xcode: `brew install xcodegen`, then
`cd stem-master/ios && xcodegen generate && open StemMaster.xcodeproj`, pick
your signing team and run. Point the app at your server in Settings. Details,
TestFlight and App Store steps: [`DEPLOY.md`](DEPLOY.md) section D.

## Repository layout

```
stem-master/
├── SPEC.md                 architecture, pipeline, stem catalogue, REST API, env vars
├── DEPLOY.md               server and app deployment, step by step
├── contract/
│   └── job_completed.json  real completed Job from the server tests; decoded by the iOS tests
├── server/
│   ├── stem_master/        FastAPI app (api.py), job queue and pipeline (jobs.py), DSP (dsp/)
│   ├── tests/              pytest suite (runs with STEM_MASTER_ENGINE=fake)
│   ├── Dockerfile          GPU image (CPU image with --build-arg TORCH_INDEX_URL=...)
│   ├── space/README.md     Hugging Face Space card, deployed as the Space's README.md
│   ├── deploy/hf_space.py  creates/updates the Hugging Face Space
│   └── requirements*.txt
└── ios/
    ├── project.yml         XcodeGen project (generates StemMaster.xcodeproj)
    ├── StemMaster/         SwiftUI app: App, Views, Audio, Services, Models, Logic, Resources
    ├── StemMasterTests/    unit tests, including the contract decode
    └── scripts/            asset generation (app icon)
```

Workflows (in `.github/workflows/`):

| Workflow | Trigger | Does |
|---|---|---|
| `stem-master-server.yml` | Pushes and pull requests touching `stem-master/server/` or `stem-master/contract/`; manual | Server tests on Python 3.11 (fake engine), contract-fixture drift check, Docker image build; pushes to `ghcr.io` from `main` or when run with *publish* |
| `stem-master-ios.yml` | Pushes and pull requests touching `stem-master/ios/` or `stem-master/contract/`; manual | XcodeGen, build and unit tests on the newest iPhone simulator; when run with *testflight*, archive, sign and upload to TestFlight |
| `stem-master-space.yml` | Manual | Deploys the server to a Hugging Face Space and requests its hardware |

## Limitations

- **It needs a GPU server to be practical.** The pipeline runs on CPU, but
  slowly. On a 4-core CPU, a single model took 13 to 70 seconds to separate a
  7-second clip, and the default Max chain runs six models, so a full song
  takes on the order of an hour or more. A GPU brings that down to minutes
  (expected from the models' design; not benchmarked in this repository).
  The app warns under Settings > Test Connection when the server reports
  `device: cpu`.
- **The server has to be hosted somewhere.** The cheapest GPU tier on Hugging
  Face Spaces (T4) costs about $0.40 an hour while running; a sleep timeout
  stops billing when idle, at the cost of a cold start on the next job. Any
  machine with an NVIDIA GPU and Docker works as well.
- **First jobs are slow on a fresh server.** Models download on first use:
  about 3.8 GB for the default options and 7.5 GB for every option. Fetch them
  ahead of time (DEPLOY.md section C) and keep them on a persistent volume.
- **Releasing on the App Store needs an Apple Developer Program membership**
  ($99 a year), an App Store Connect app record and a privacy policy. Without
  it you can still run the app on your own iPhone from Xcode.
- **No provenance-watermark removal, by design.** Denoise removes audible
  generation artifacts only.
- **Separation is not perfect.** These are among the strongest open models,
  but dense mixes still leave some bleed. That is why Cleanup's removals are
  delivered as their own stem instead of being discarded.
- Uploads are limited to 200 MB and 15 minutes per track by default
  (`STEM_MASTER_MAX_UPLOAD_MB`, `STEM_MASTER_MAX_DURATION_S`). Finished jobs
  are deleted from the server after 24 hours (`STEM_MASTER_JOB_TTL_HOURS`).
