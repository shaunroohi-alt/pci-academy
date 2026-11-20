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
peak level and an *artifact level* (0 to 1: how noise-like the 4 to 16 kHz
band is, plus a static noise floor; SPEC section 2.3). It describes the audio,
not who or what made it.

## Options

| Option | Default | What it does |
|---|---|---|
| Quality | Max | **Max**: three vocal models combined per frequency bin (`avg_fft`), overlap 4. **Fast**: one vocal model, overlap 2. |
| Drum split | On | Splits drums into kick, snare, toms, hi-hat, ride, crash (+ room). |
| Vocal split | On | Splits vocals into lead and backing. |
| Dereverb | Off | Dry vocals plus the removed reverb as its own stem. |
| Cleanup | On (standard) | Removes bleed between stems with DSP. Light / standard / strong. |
| Denoise | Off (standard) | Removes measured hiss, sub-sonic rumble and high-band flicker (no mains-hum filter). Light / standard / strong. |
| Output format | 24-bit WAV | 24-bit, 32-bit float or 16-bit WAV. |

### Measured quality

Measured with `server/tools/eval_musdb.py` on 8 MUSDB18 test tracks (median,
dB; SDR = faithfulness, BSSEval SIR = how little of the other sources leaks
in), real models at overlap 4 (SPEC section 2.1):

| variant | vocals SDR/SIR | drums | bass | other |
|---|---|---|---|---|
| BS-Roformer-SW alone (does not sum to the mix) | 12.00 / 20.00 | 11.01 / 19.74 | 7.48 / 13.38 | 7.10 / 14.17 |
| pipeline max, cleanup off | 12.46 / 19.90 | 11.19 / 20.52 | 7.56 / 13.65 | 7.26 / 14.28 |
| pipeline max, light | 12.39 / 20.18 | 11.11 / 20.83 | 7.57 / 13.90 | 7.21 / 14.73 |
| pipeline max, **standard** (default) | 12.30 / 20.41 | 10.96 / 21.01 | 7.57 / 14.15 | 7.10 / 14.99 |
| pipeline max, strong | 12.01 / 20.82 | 10.64 / 21.46 | 7.55 / 14.55 | 6.82 / 15.29 |
| pipeline fast, cleanup off | 11.65 / 19.10 | 11.08 / 20.44 | 7.55 / 13.79 | 7.08 / 14.05 |

Stronger Cleanup trades a little SDR for less leakage (higher SIR). The drum
parts (kick, snare, ...) and lead / backing have no ground truth in MUSDB18
and are not in this table.

### Cleanup and Denoise: the difference

**Cleanup** removes what does not belong in a stem: hi-hat leaking into the
vocal, vocal leaking into the guitar, low rumble in the hi-hat. It is DSP
only (the model choice is the same with or without it) and runs three passes
on every stem:

1. bleed masking per stem group (vocals, drums, bass, instruments): in each
   time-frequency bin where a group holds only a small share of the energy,
   every stem of that group is attenuated there. Stems of one group (kick vs
   snare, lead vs backing) are not masked against each other below *strong*;
2. activity gating: silence between phrases and hits is gated, so a stem is
   quiet where its instrument is not playing;
3. range filters: a high-pass per stem type (70 Hz on vocals, 300 Hz on hi-hat,
   kick and bass untouched, and so on).

**Denoise** removes only what it measures in each stem, so clean material
passes through untouched: DC offset and sub-sonic rumble (16 Hz high-pass), a
stationary noise floor (hiss, static) where one is detected, and
high-band flicker where it is measured. A vocal stem also goes through a
neural denoise model, but only when a noise floor is measured on it or the
track's artifact level is moderate or high: on clean vocals that model only
cuts quiet breaths and tails.

What Denoise cannot do: the high-frequency "sheen" of AI-generated music is a
noise-like band that is part of the music itself, not a separate layer, and
it cannot be taken out without taking the music with it. On real Udio stems
the noise-floor and flicker passes take out at most -44 dB re the stem (0.03 dB
of level), even when the artifact level reads "high" (SPEC section 2.2).
Denoise does not remove provenance watermarks (the inaudible marks some
generators embed to identify their output) and does not try to.

Both are auditable: what Cleanup removes is returned as **Removed Bleed**, what
Denoise removes as **Removed Noise**. Solo them to hear exactly what was taken
out; add them back if it was too much.

### The vocal chain

Vocals get the most work, so they come out usable as a standalone line:

1. **Ensemble split.** Max quality runs three models on the mix,
   `bs_roformer_vocals_revive_v2_unwa`,
   `mel_band_roformer_kim_ft2_bleedless_unwa` and the vocal output of
   `BS-Roformer-SW`, and averages them per frequency bin (`avg_fft`): the best
   of the 18 single models and ensembles measured (SPEC section 2). Fast
   quality uses the bleedless model alone.
2. **Residual accounting.** The instrumental is the mix minus the vocal, so
   nothing is lost between the two. Vocal remnants that the instrument model
   later finds in the instrumental are returned as Vocal Ambience instead of
   being mixed into "other".
3. **Lead / backing split** (Vocal split) with a karaoke model.
4. **Dereverb** (optional): dry lead and backing, and the reverb as its own stem.
5. **Cleanup:** group bleed masking and gating, 70 Hz high-pass.
6. **Denoise** (optional): the measured passes above (and the neural model
   where it is needed).

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
analyze → vocals → instruments → drums → vocal_split → dereverb
        → cleanup → denoise → finalize (WAV + AAC preview + ZIP manifest)
(the debleed stage of SPEC section 2 is off: it changed nothing measurable)
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

### Separate a file on the server machine (CLI)

`python -m stem_master separate` runs the same pipeline on one file, without
the HTTP server:

```bash
cd stem-master/server
python -m stem_master separate "My Song.mp3" -o out/ --quality max --dereverb --denoise --check-sum
# out/stems/<id>.wav and <id>.m4a, out/manifest.json

# the same in the Docker image (the mounted folder must be writable by uid 1000)
docker run --rm -v stem-models:/data -v "$PWD:/work" stem-master-server \
  python -m stem_master separate "/work/My Song.mp3" -o /work/out --check-sum
```

Flags: `--quality max|fast`, `--no-drum-split`, `--no-vocal-split`,
`--dereverb`, `--no-cleanup`, `--cleanup-strength light|standard|strong`,
`--denoise`, `--denoise-strength light|standard|strong`,
`--format wav24|wav32f|wav16`, `--model-dir DIR`, `--engine fake` (DSP
stand-in, no models), `--check-sum` (reports how far primary + removed stems
are from the source), `--force` (overwrite `out/stems`). Ctrl-C cancels
cleanly. `python -m stem_master prefetch` downloads the models (DEPLOY.md
section C).

### Separate a track through the API from a shell

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
`STEM_MASTER_MODEL_CACHE` (default `auto`) is how many loaded models the
server keeps between jobs; DEPLOY.md section B2 explains the default.

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
  very slowly. Measured on a 4-core CPU: Fast quality with Drum split, Vocal
  split, Dereverb, Cleanup and Denoise took 104 s for a 6.8-second clip (6
  model inferences, models already on disk), about 15 times the length of the
  audio, so roughly an hour for a 4-minute song. Max quality runs 2 more
  inferences (the 3-model vocal ensemble) at twice the overlap and is slower
  again (not timed end to end on CPU). GPU timings have not been measured in
  this repository. The app warns under Settings > Test Connection when the
  server reports `device: cpu`.
- **The server has to be hosted somewhere.** The cheapest GPU tier on Hugging
  Face Spaces (T4) costs about $0.40 an hour while running; a sleep timeout
  stops billing when idle, at the cost of a cold start on the next job. Any
  machine with an NVIDIA GPU and Docker works as well.
- **First jobs are slow on a fresh server.** Models download on first use:
  about 2.9 GB for the default options and 4.7 GB for every option (7 models).
  Fetch them ahead of time (DEPLOY.md section C) and keep them on a persistent
  volume.
- **Long tracks need RAM and disk.** About 9 MB of RAM per second of audio at
  the peak (8 GB for a 15-minute track), and about 3.8 GB of disk per finished
  6-minute job with every option until it expires (DEPLOY.md section B2).
- **Releasing on the App Store needs an Apple Developer Program membership**
  ($99 a year), an App Store Connect app record and a privacy policy. Without
  it you can still run the app on your own iPhone from Xcode.
- **Denoise is not an "AI remover".** It removes measured hiss, sub-sonic
  rumble and high-band flicker. It has no mains-hum filter (a 60 Hz hum
  passes through unchanged). It does not remove the noise-like high band that is
  part of AI-generated music, and it does not remove provenance watermarks.
- **Separation is not perfect.** These are among the strongest open models,
  but dense mixes still leave some bleed. That is why Cleanup's removals are
  delivered as their own stem instead of being discarded.
- Sources with more than two channels (5.1 and so on) are downmixed to stereo
  by ffmpeg's standard matrix; mono sources stay mono.
- Uploads are limited to 200 MB and 15 minutes per track by default
  (`STEM_MASTER_MAX_UPLOAD_MB`, `STEM_MASTER_MAX_DURATION_S`). Finished jobs
  are deleted from the server after 24 hours (`STEM_MASTER_JOB_TTL_HOURS`).
