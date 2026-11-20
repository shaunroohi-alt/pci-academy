# Stem Master by MP Audio — architecture and contract

This file is the single source of truth that the server (`server/`) and the
iOS app (`ios/`) are both built against. If code and this file disagree, one
of them is a bug.

## 1. Shape of the system

```
iPhone (SwiftUI app)                         GPU server (Docker, FastAPI)
─────────────────────                        ─────────────────────────────
import audio ──── multipart upload ────────▶ POST /v1/jobs
options sheet                                 ├─ queue (1 GPU worker)
progress  ◀────── poll every 1.5 s ────────── GET /v1/jobs/{id}
mixer     ◀────── AAC previews (m4a) ──────── GET /v1/jobs/{id}/stems/{stem}.m4a
export    ◀────── lossless WAV / ZIP ──────── GET /v1/jobs/{id}/stems/{stem}.wav
                                              GET /v1/jobs/{id}/download.zip
```

Separation runs on the server because the models that produce the cleanest
stems (BS/Mel-Band RoFormer ensembles, ~0.5–1 GB each) do not fit an iPhone's
memory or thermal budget. The app is native SwiftUI + AVAudioEngine.

## 2. Processing pipeline (server)

All model inference runs at 44.1 kHz, float32, stereo. Everything is float32
end to end; nothing is normalised, so **stem gain is preserved**.

| # | Stage id | What | Model(s) (audio-separator 0.48.0 filenames) |
|---|---|---|---|
| 1 | `analyze` | decode, loudness, BPM, key, artifact level | — (DSP) |
| 2 | `vocals` | vocal / instrumental split | **max:** ensemble `bs_roformer_vocals_revive_v2_unwa.ckpt` + `mel_band_roformer_kim_ft2_bleedless_unwa.ckpt` + the vocal output of `BS-Roformer-SW.ckpt`, `avg_fft` (best of the 18 single models and ensembles measured, see 2.1). **fast:** `mel_band_roformer_kim_ft2_bleedless_unwa.ckpt` alone |
| 3 | `debleed` | strip vocal bleed out of the instrumental — **currently disabled** (`DEBLEED_STRENGTHS` is empty): on MUSDB18 it moved no target by more than 0.07 dB because the 6-stem model's own vocal output already collects the remnants | `mel_band_roformer_bleed_suppressor_v1.ckpt` |
| 4 | `instruments` | instrumental → bass, drums, guitar, piano, other (+ vocal remnants) | `BS-Roformer-SW.ckpt` |
| 5 | `drums` | (drum_split) drums → kick, snare, toms, hi-hat, ride, crash | `MDX23C-DrumSep-aufr33-jarredou.ckpt` |
| 6 | `vocal_split` | (vocal_split) vocals → lead / backing | `bs_roformer_karaoke_frazer_becruily.ckpt` (its *Vocals* output = lead, the rest = backing) |
| 7 | `dereverb` | (dereverb) dry lead/backing + a reverb stem | `dereverb_mel_band_roformer_anvuew_sdr_19.1729.ckpt` |
| 8 | `cleanup` | (cleanup) bleed masking, activity gating, per-stem range filters | — (DSP) |
| 9 | `denoise` | (denoise) AI-generation artifact removal | vocals: `denoise_mel_band_roformer_aufr33_sdr_27.9959.ckpt`; all stems: DSP |
| 10 | `finalize` | resample to source rate, trim to source length, write WAV + AAC preview, ZIP manifest | — |

Rules that make the stems trustworthy:

* **Residual accounting.** Every split stage keeps `input − Σ outputs`. The
  instrumental is `mix − vocals` (not the model's own instrumental), drum-part
  residual becomes `drum_room`, SW-model residual is added to `other`, the
  SW model's vocal output becomes `vocal_ambience`. Primary stems therefore
  sum to the mix.
* **Removal is auditable.** Whatever *Cleanup* takes out goes into
  `removed_bleed`; whatever *Denoise* takes out goes into `removed_noise`.
  These are delivered as `role: "removed"` stems, muted by default.
  `Σ primary + Σ removed == mix` (within float rounding / −60 dB).
* **Negligible stems are dropped.** A residual-type stem (`vocal_ambience`,
  `drum_room`) whose RMS is more than 50 dB below the mix RMS is folded into
  its sibling (`other` / the loudest drum part) instead of being delivered.
* **No clipping, no normalisation.** If any stem would exceed 0 dBFS in an
  integer format, one common gain is applied to *all* stems and reported as
  `gain_offset_db` in the job manifest.
* **Alignment.** Every delivered file has exactly the source's sample count
  at the source's sample rate, starting at sample 0.

### 2.1 Cleanup (DSP, `cleanup_strength`: light | standard | strong)

1. Bleed masking on the STFT (n_fft 4096, hop 1024), with ownership judged
   per catalogue **group** (vocals / drums / bass / instruments): for group
   `g`, `w_g = Σ_{i∈g}|S_i|² / Σ_j |S_j|²`. Where `w_g < τ·scale_g` every
   stem of the group is attenuated by `(w_g/τ_g)^β`, floored at `g_min`, gain
   smoothed over 3×5 (freq×time). Stems of one group (kick vs snare, lead vs
   backing) are not masked against each other below `strong` — doing so cost
   1.3 dB of drum SDR in the first version. `scale_g`: vocals 1.5, drums 0.6,
   bass 0.5, instruments 1.0.
   `τ, β, g_min` = light (0.05, 1.0, −12 dB), standard (0.10, 1.5, −20 dB),
   strong (0.20, 2.0, −30 dB, plus a within-group mask τ 0.05, −12 dB).
2. Activity gating: 10 ms RMS envelope, open threshold = max(stem peak RMS +
   own, mix envelope + mix) with own/mix = light −55/−42, standard −45/−35,
   strong −35/−27 dB; 5 ms look-ahead, 120 ms hold, 80 ms release, closed
   gain −80 dB.
3. Per-stem range filters (zero-phase 2nd-order Butterworth):
   vocals/lead/backing HPF 70 Hz · hihat HPF 300 Hz · ride/crash HPF 250 Hz ·
   snare HPF 60 Hz · toms HPF 40 Hz · guitar/piano/other HPF 30 Hz ·
   kick/bass untouched.

Measured with `server/tools/eval_musdb.py` on 8 MUSDB18 test tracks (median,
dB; SDR = faithfulness, BSSEval SIR = how little of the other sources leaks
in), real models at overlap 4:

| variant | vocals SDR/SIR | drums | bass | other |
|---|---|---|---|---|
| BS-Roformer-SW alone (does not sum to the mix) | 12.00 / 20.00 | 11.01 / 19.74 | 7.48 / 13.38 | 7.10 / 14.17 |
| pipeline max, cleanup off | 12.46 / 19.90 | 11.19 / 20.52 | 7.56 / 13.65 | 7.26 / 14.28 |
| pipeline max, light | 12.39 / 20.18 | 11.11 / 20.83 | 7.57 / 13.90 | 7.21 / 14.73 |
| pipeline max, **standard** (default) | 12.30 / 20.41 | 10.96 / 21.01 | 7.57 / 14.15 | 7.10 / 14.99 |
| pipeline max, strong | 12.01 / 20.82 | 10.64 / 21.46 | 7.55 / 14.55 | 6.82 / 15.29 |
| pipeline fast, cleanup off | 11.65 / 19.10 | 11.08 / 20.44 | 7.55 / 13.79 | 7.08 / 14.05 |

Before this tuning the default scored vocals 11.12 / drums 10.01 / bass 7.36
/ other 6.63 SDR: the old no-cleanup vocal ensemble contained
`bs_roformer_vocals_resurrection_unwa.ckpt`, which scored 4.7 dB SDR on its
own on these clips.

### 2.2 Denoise — AI-generation artifacts (`denoise_strength`)

Denoise removes only what it *measures* in each stem (`dsp/denoise.py`), so
clean material passes untouched; everything taken out goes to
`removed_noise`:

1. DC removal + 16 Hz zero-phase high-pass (4th order; −0.67 dB at 20 Hz,
   −0.03 dB at 30 Hz) on every stem, faded in / out over the first / last
   250 ms so a stem that starts or ends at full level keeps its edges.
2. Vocal stems: neural denoise (aufr33 Mel-RoFormer) **only when** a noise
   floor is measured on that stem or the mix `artifact_level` ≥ 0.33; on
   clean vocals it only cuts quiet breaths/tails, so it is skipped. Then DSP.
3. Stationary noise floor, only where one is detected (per channel, STFT
   46 ms). A bin is noise floor when its lower tail (5/15/30 % quantiles over
   the active frames) has the Rayleigh shape of Gaussian noise, is stationary
   over 3–16 segments (std < 1.5–2.5 dB) and lies ≥ 20–30 dB below the stem's
   mean per-bin power. ≥ 16 such bins give a 1/3-octave noise spectrum,
   fitted to its lower envelope by a ≤ 2nd-order curve in log f, used only
   between the outermost confident bands and capped per bin by its own
   10th-percentile floor. Soft Wiener gain `max(1 − α/(1 + ξ), g_min)` with
   decision-directed a-priori SNR ξ.
4. High-band de-flicker (7–10 / 10–14 / 14–20 kHz, STFT 11.6 ms / hop 2.9 ms),
   only where flicker is measured: band level minus its ~70 ms running median
   = excess; frames where the 4.5–7 kHz reference band also jumps (> 3 dB) are
   onsets and untouched. Flicker `F` = mean excess above 1.5 dB in the high
   band minus that of the reference; `β = clip((F − F0)/0.2) ·
   clip((0.22 − periodicity)/0.1)` (bursts recurring on a beat grid are a
   groove). Excess above `k` is cut by `β·(excess − k)`, ≤ `cut_max`.

| strength | α | g_min | a | F0 | k | cut_max |
|---|---|---|---|---|---|---|
| light | 1.0 | −8 dB | 0.96 | 0.45 dB | 4 dB | 6 dB |
| standard | 1.0 | −12 dB | 0.95 | 0.35 dB | 3 dB | 10 dB |
| strong | 1.25 | −18 dB | 0.93 | 0.25 dB | 2 dB | 14 dB |

Measured with `server/tools/eval_denoise.py` (thresholds set on MUSDB18
train, checked on test):

* **Clean MUSDB18 stems** (40 clips × vocals/drums/bass/other): energy removed
  ≤ 0.29 dB at every strength (max over clips; vocals ≤ 0.02, bass ≤ 0.16,
  other ≤ 0.09, drums 0.28 = a sub-kick below 20 Hz); median ≤ 0.005 dB. Above
  7 kHz: median ≈ 0, max 1.4 dB (standard) / 1.7 dB (strong) — guitar-amp /
  room hiss in a few recordings and unprotected hi-hats.
* **Degraded stems** (12 test clips × 4 stems; SNR gain at standard, median):
  white noise at −30 dB re stem 1.9 dB (bass 7.1, other 2.9, vocals 1.4,
  drums 0.5), pink −30 dB 2.7 dB; at −40 dB white 0.8, pink 2.6 dB; high-band
  bursts (+12 dB in 15 % of 12 ms frames) 2.2 dB (vocals 3.1), ±6 dB random
  gain 0.7 dB. Noise hidden under continuous music is left (it is masked and
  cannot be told from the music). Worst cases −2.9 dB (−4.5 dB at strong):
  white noise at −40 dB on drum / dense "other" stems, whose stationary
  texture (cymbal wash) is then taken for part of the floor.
* **Udio stems** (production models, fast quality, 12 s excerpts: all stems
  of 4 clips + the vocals of 6 more, 25 non-silent stems): no stationary
  floor or flicker worth removing — stages 3–4 take ≤ −44 dB re stem from
  every stem (≤ 0.03 dB of level); stage 1 takes sub-sonic separation residue
  (−29 … −77 dB). The neural vocal model takes −55 … −58 dB from 9 of 10 Udio
  vocals (−24 dB from the near-empty vocal stem of an instrumental) and
  −33 … −56 dB (≤ 0.005 dB of level) from clean MUSDB
  vocals, but there it takes ≥ 25 % of the energy of ~1 % of the 50 ms frames
  (breaths / tails ≥ 32 dB below the vocal's peak).

Inaudible provenance watermarks are deliberately **not** targeted.

### 2.3 Analysis

`bpm` (librosa beat tracker, folded into 70–180), `key` (Krumhansl–Schmuckler
on CQT chroma, also returned as Camelot), integrated loudness (ITU-R BS.1770 via
pyloudnorm), sample peak, `spectral_cutoff_hz` (hard band-limit 11–20 kHz,
reported only) and `artifact_level` (0–1):

    artifact_level = 1 − (1 − s_hfnoise)(1 − 0.6 s_noise)

* `s_hfnoise = clip((hf_flatness − 0.58)/0.06)`: `hf_flatness` is the median
  local spectral flatness (21-bin ≈ 226 Hz neighbourhoods, 93 ms frames at
  44.1 kHz, frames ≥ median energy) of 4–16 kHz — how noise-like the high band's
  fine structure is (Gaussian noise 0.60 → 0.33; partials/modes pull it down).
* `s_noise`: an audible, noise-like static floor in the quietest frames.

High-band flicker and the band-limit are measured but not in the level: they
did not hold up on held-out data and band-limits are what MP3/AAC do. On
held-out data (30 Udio clips vs 50 MUSDB18 test previews; constants from 30
other Udio clips + 94 MUSDB18 train previews) the level separates them with
AUC 0.94 (medians 0.69 vs 0.00; all 50 MUSDB "low", 23/30 Udio "moderate" or
"high"); re-encoding to MP3 128/320 or AAC 128 never raises it by more than
0.1. It is reported as an artifact level, never as a claim about who or what
made the track.

## 3. Stem catalogue (fixed ids)

| id | name | group | appears when |
|---|---|---|---|
| `vocals` | Vocals | vocals | always; `role: bus` if split into lead/backing or dereverbed |
| `lead_vocals` | Lead Vocals (Dry when dereverb) | vocals | vocal_split |
| `backing_vocals` | Backing Vocals | vocals | vocal_split |
| `vocals_dry` | Vocals (Dry) | vocals | dereverb without vocal_split |
| `vocal_reverb` | Vocal Reverb | vocals | dereverb |
| `vocal_ambience` | Vocal Ambience | vocals | vocal remnants found in the instrumental (if not negligible) |
| `drums` | Drums | drums | always; `role: bus` when drum_split |
| `kick` `snare` `toms` `hihat` `ride` `crash` | Kick … Crash | drums | drum_split |
| `drum_room` | Drum Room & Perc | drums | drum_split, if not negligible |
| `bass` | Bass | bass | always |
| `guitar` | Guitar | instruments | always |
| `piano` | Piano & Keys | instruments | always |
| `other` | Synths & Other | instruments | always |
| `removed_bleed` | Removed Bleed | removed | cleanup |
| `removed_noise` | Removed Noise | removed | denoise |

Order in the manifest: vocals, drums, bass, instruments, removed (table order).
Roles: `primary` (plays in the mixer, sums to the mix), `bus` (a sum of
primaries; export only), `removed` (what cleanup/denoise took out).

Colours (hex): vocals `#FF7A1A`, lead `#FF7A1A`, backing `#FFB066`,
vocals_dry `#FF9A4D`, vocal_reverb `#C46A2B`, vocal_ambience `#8F5A33`,
drums `#3AD6C5`, kick `#3AD6C5`, snare `#5BE3D5`, toms `#2BA89B`, hihat `#9CF0E6`,
ride `#77C9F0`, crash `#4FA8E0`, drum_room `#2D7F78`, bass `#7C5CFF`,
guitar `#F5D547`, piano `#E86AF0`, other `#A0A7B4`, removed_bleed `#5A5F6B`,
removed_noise `#454952`.

## 4. REST API (v1)

Base URL is configurable in the app. JSON is snake_case. Times are ISO-8601 UTC.

Auth: if the server has `STEM_MASTER_API_KEY` set, every `/v1/*` route except
`/v1/health` requires `Authorization: Bearer <key>` → otherwise `401`.
Clients send `X-Client-Id: <uuid>` (random per install); `GET /v1/jobs` only
lists that client's jobs.

Errors: `{"detail": "human readable message"}` with 4xx/5xx; `507` when the
server is out of disk space (uploads, ZIP builds).

### `GET /v1/health` → 200
```json
{"status": "ok", "version": "1.0.0", "device": "cuda", "queue_length": 0, "auth_required": true}
```
`device` ∈ `cuda | mps | cpu`.

### `GET /v1/capabilities` → 200
```json
{"max_upload_mb": 200, "max_duration_seconds": 900,
 "output_formats": ["wav24", "wav32f", "wav16"],
 "default_options": { ...JobOptions... }}
```

### `POST /v1/jobs` (multipart/form-data) → 202 `Job`
Fields: `file` (the audio; mp3 wav aiff flac m4a aac ogg opus), `options`
(JSON string of `JobOptions`, optional — defaults apply per field).
`413` too large, `415` undecodable, `422` bad options / too long.

`JobOptions`:
```json
{
  "quality": "max",              // "max" | "fast"
  "drum_split": true,
  "vocal_split": true,           // lead vs backing
  "dereverb": false,             // dry vocals + vocal_reverb stem
  "cleanup": true,
  "cleanup_strength": "standard",// "light" | "standard" | "strong"
  "denoise": false,
  "denoise_strength": "standard",
  "output_format": "wav24"       // "wav24" | "wav32f" | "wav16"
}
```

### `GET /v1/jobs/{id}` → 200 `Job` (404 unknown)
```json
{
  "id": "3f2c…",                 // 32 hex chars
  "status": "processing",        // queued | processing | completed | failed | cancelled
  "created_at": "2026-11-20T10:00:00Z",
  "updated_at": "2026-11-20T10:01:12Z",
  "filename": "My Song.mp3",
  "options": { ...JobOptions... },
  "progress": 0.42,              // 0…1
  "stage": "instruments",        // stage id from §2, or "queued" / "done"
  "stage_label": "Splitting bass, drums, guitar, piano",
  "queue_position": null,        // 1-based while queued, else null
  "error": null,
  "analysis": null,              // Analysis once the analyze stage finishes
  "stems": [],                   // [Stem] once completed
  "zip_url": null,               // "/v1/jobs/{id}/download.zip" once completed
  "gain_offset_db": 0.0
}
```

`Analysis`:
```json
{
  "duration_seconds": 213.41, "sample_rate": 48000, "channels": 2, "codec": "mp3",
  "bpm": 92.0, "bpm_confidence": 0.81,
  "key": "A minor", "camelot": "8A", "key_confidence": 0.64,
  "loudness_lufs": -9.1, "peak_dbfs": -0.4,
  "artifact_level": 0.62, "artifact_label": "high",   // low | moderate | high
  "spectral_cutoff_hz": 16000.0                       // null if none detected
}
```

`Stem`:
```json
{
  "id": "lead_vocals", "name": "Lead Vocals (Dry)", "group": "vocals",
  "role": "primary", "color": "#FF7A1A",
  "wav_url": "/v1/jobs/{id}/stems/lead_vocals.wav",
  "preview_url": "/v1/jobs/{id}/stems/lead_vocals.m4a",
  "wav_bytes": 75432112, "preview_bytes": 6843210,
  "peak_dbfs": -3.2, "rms_dbfs": -19.8, "active_ratio": 0.71,
  "waveform": [0.0, 0.12, …]     // exactly 256 values in 0…1 (peak per bucket, linear)
}
```
`group` ∈ `vocals | drums | bass | instruments | removed`;
`role` ∈ `primary | bus | removed`. URLs are relative to the base URL.

### Other routes
* `GET /v1/jobs` → `{"jobs": [Job]}` for the caller's `X-Client-Id`, newest first.
* `POST /v1/jobs/{id}/cancel` → `Job` (no-op if already finished).
* `DELETE /v1/jobs/{id}` → 204, deletes files.
* `GET /v1/jobs/{id}/stems/{stem_id}.wav` → `audio/wav`, HTTP Range supported.
* `GET /v1/jobs/{id}/stems/{stem_id}.m4a` → `audio/mp4` (AAC 256 kbps preview).
* `GET /v1/jobs/{id}/download.zip` → `application/zip`: every non-preview WAV,
  `manifest.json` (the Job) and `README.txt`; filename
  `<source name> - Stem Master.zip`.

`contract/job_completed.json` is a real completed Job produced by the server
test-suite and decoded by the iOS test-suite, so drift fails CI on both sides.

## 5. Server configuration (env)

| var | default | |
|---|---|---|
| `STEM_MASTER_API_KEY` | unset | require bearer auth when set |
| `STEM_MASTER_DATA_DIR` | `/data` if writable else `/tmp/stem-master` | jobs live in `<dir>/jobs/<id>/` |
| `STEM_MASTER_MODEL_DIR` | `<data>/models` | model cache |
| `STEM_MASTER_MAX_UPLOAD_MB` | 200 | |
| `STEM_MASTER_MAX_DURATION_S` | 900 | |
| `STEM_MASTER_JOB_TTL_HOURS` | 24 | finished jobs are deleted after this |
| `STEM_MASTER_WORKERS` | 1 | concurrent jobs; inference is serialised on one device, so more workers only overlap decode/encode |
| `STEM_MASTER_MODEL_CACHE` | `auto` | loaded models kept in memory; `auto` sizes it from free VRAM (CUDA) or RAM at ~1 GiB per model, clamped 1–16 |
| `STEM_MASTER_ENGINE` | `audio-separator` | `fake` = DSP stand-in for tests |
| `STEM_MASTER_OVERLAP_MAX` / `_FAST` | 4 / 2 | RoFormer overlap per quality |
| `PORT` | 7860 | |

## 6. iOS app

* SwiftUI, iOS 17+, iPhone, portrait, always dark (MP Audio graphite +
  signal orange `#FF7A1A`, teal `#3AD6C5`). Bundle id `com.mpaudio.stemmaster`.
* Project generated by XcodeGen from `ios/project.yml`.
* Flow: Library → Import (Files picker or "Open in Stem Master") → Options →
  Upload/Queue/Processing (stage checklist) → Mixer (analysis chips, transport,
  per-stem waveform, mute/solo/volume, grouped sections, "Removed" collapsed)
  → Export (per-stem WAV share, ZIP, Save to Files).
* Playback: AVAudioEngine, one player node per stem, all scheduled against one
  `AVAudioTime` for sample-accurate sync; previews are the AAC files, export
  uses the lossless WAVs (downloaded on demand).
* Server URL + API key in Settings (key in Keychain).
