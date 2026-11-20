"""Reproducible evaluation of the artifact meter and DSP Denoise on real data.

This script is *not* part of the server; it produces the numbers quoted in
SPEC 2.2/2.3 and in the denoise/analysis docstrings. Every expensive result
(decoded audio, model outputs) is cached on disk, so re-running is cheap.

    python tools/eval_denoise.py prepare  --work W --udio-parquet P --musdb DIR [--udio-count 60]
    python tools/eval_denoise.py meter    --work W          # artifact meter: calibration vs held-out
    python tools/eval_denoise.py clean    --work W          # removed energy on clean MUSDB stems
    python tools/eval_denoise.py synthetic --work W         # SNR gain on degraded MUSDB stems
    python tools/eval_denoise.py udio     --work W [--clips 4] # separate Udio clips (engine, cached), denoise stems
    python tools/eval_denoise.py neural   --work W [--clips 12] # neural vocal denoise on clean MUSDB vocals

Data (treated as untrusted input: only decoded, never executed):

* Udio: a HF parquet shard with columns ``id, title, tags, audio{bytes,path}``.
  Rows whose bytes ``ffprobe`` does not recognise as >= 10 s of audio are
  skipped. Decoded at the native rate (48 kHz), stereo float32.
* MUSDB18 7-second previews ``{train,test}/*.stem.mp4`` (AAC 256 kbps; stream
  0 mixture, 1 drums, 2 bass, 3 other, 4 vocals).

Split: MUSDB ``train`` + even-indexed Udio rows = *calibration*; MUSDB ``test``
+ odd-indexed Udio rows = *held-out*. The meter's constants were chosen on
the calibration set only.

Model runs (``udio``, ``neural``) need ``STEM_MASTER_MODEL_DIR`` and the
audio-separator engine; their outputs are cached as float WAVs keyed by
(clip, model, overlap).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from stem_master.dsp.audio_io import resample  # noqa: E402

MUSDB_STREAMS = {"mixture": 0, "drums": 1, "bass": 2, "other": 3, "vocals": 4}
STEMS = ("vocals", "drums", "bass", "other")
WORK_SR = 44100


# --------------------------------------------------------------------- utils
def _db(x: np.ndarray) -> float:
    return 10.0 * math.log10(float(np.mean(np.asarray(x, dtype=np.float64) ** 2)) + 1e-30)


def _decode(path: Path, stream: Optional[int] = None) -> Tuple[np.ndarray, int]:
    """Decode with ffmpeg to float32 (2, n) at the native rate."""
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", f"a:{stream or 0}" if stream is None else str(stream),
         "-show_entries", "stream=sample_rate", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True)
    sr = int(probe.stdout.strip().splitlines()[0])
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-i", str(path)]
    if stream is not None:
        cmd += ["-map", f"0:{stream}"]
    cmd += ["-ac", "2", "-f", "f32le", "-acodec", "pcm_f32le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.copy()
    return x, sr


def _probe_audio(path: Path) -> Optional[float]:
    """Duration (s) if ``path`` holds an audio stream, else ``None``."""
    res = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                          "stream=codec_type,duration", "-of", "json", str(path)],
                         capture_output=True, text=True)
    if res.returncode != 0:
        return None
    try:
        streams = json.loads(res.stdout).get("streams", [])
    except json.JSONDecodeError:
        return None
    if not streams or streams[0].get("codec_type") != "audio":
        return None
    try:
        return float(streams[0].get("duration", "nan"))
    except ValueError:
        return None


def _write(path: Path, x: np.ndarray, sr: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), np.asarray(x, dtype=np.float32).T, sr, subtype="FLOAT")


def _read(path: Path) -> Tuple[np.ndarray, int]:
    data, sr = sf.read(str(path), dtype="float32", always_2d=True)
    return data.T.copy(), sr


def _auc(pos: Sequence[float], neg: Sequence[float]) -> float:
    """P(score(pos) > score(neg)) with ties counted half (Mann-Whitney AUC)."""
    pos = np.asarray(pos, dtype=np.float64)
    neg = np.asarray(neg, dtype=np.float64)
    if pos.size == 0 or neg.size == 0:
        return float("nan")
    gt = (pos[:, None] > neg[None, :]).sum()
    eq = (pos[:, None] == neg[None, :]).sum()
    return float((gt + 0.5 * eq) / (pos.size * neg.size))


def _q(values: Iterable[float]) -> str:
    v = np.asarray([x for x in values if x is not None and math.isfinite(x)], dtype=np.float64)
    if v.size == 0:
        return "n/a"
    p = np.percentile(v, [0, 10, 50, 90, 100])
    return f"min {p[0]:7.3f}  p10 {p[1]:7.3f}  median {p[2]:7.3f}  p90 {p[3]:7.3f}  max {p[4]:7.3f}  (n={v.size})"


# ------------------------------------------------------------------- prepare
def cmd_prepare(args: argparse.Namespace) -> None:
    work = Path(args.work)
    (work / "udio").mkdir(parents=True, exist_ok=True)
    raw_dir = work / "udio_raw"   # untrusted bytes, never executed
    raw_dir.mkdir(exist_ok=True)
    import pyarrow.parquet as pq

    pf = pq.ParquetFile(args.udio_parquet)
    kept = 0
    row = 0
    index: List[dict] = []
    for rg in range(pf.num_row_groups):
        table = pf.read_row_group(rg, columns=["id", "audio"])
        for rec in table.to_pylist():
            if kept >= args.udio_count:
                break
            name = f"udio_{row:03d}"
            row += 1
            out = work / "udio" / f"{name}.wav"
            if not out.exists():
                blob = (rec.get("audio") or {}).get("bytes")
                if not blob:
                    continue
                tmp = raw_dir / f"{name}.bin"
                tmp.write_bytes(blob)
                dur = _probe_audio(tmp)
                if dur is None or not dur >= 10.0:
                    tmp.unlink()
                    print(f"skip {name}: not audio")
                    continue
                try:
                    x, sr = _decode(tmp)
                except subprocess.CalledProcessError:
                    tmp.unlink()
                    print(f"skip {name}: undecodable")
                    continue
                tmp.unlink()
                _write(out, x, sr)
            index.append({"name": name, "id": rec.get("id"), "split": "cal" if (row - 1) % 2 == 0 else "held"})
            kept += 1
        if kept >= args.udio_count:
            break
    (work / "udio_index.json").write_text(json.dumps(index, indent=1))
    print(f"Udio: {kept} clips")

    musdb = Path(args.musdb)
    m_index: List[dict] = []
    for split in ("train", "test"):
        files = sorted((musdb / split).glob("*.stem.mp4"))
        for k, f in enumerate(files):
            name = f.name.replace(".stem.mp4", "")
            safe = "".join(c if c.isalnum() else "_" for c in name)
            folder = work / "musdb" / split / safe
            want = ["mixture"] + (list(STEMS) if k < args.stems_per_split else [])
            for stem in want:
                out = folder / f"{stem}.wav"
                if not out.exists():
                    x, sr = _decode(f, MUSDB_STREAMS[stem])
                    _write(out, x, sr)
            m_index.append({"name": safe, "split": "cal" if split == "train" else "held",
                            "folder": str(folder), "stems": k < args.stems_per_split})
    (work / "musdb_index.json").write_text(json.dumps(m_index, indent=1))
    print(f"MUSDB: {len(m_index)} mixtures, {sum(m['stems'] for m in m_index)} with stems")


def _udio(work: Path) -> List[dict]:
    return json.loads((work / "udio_index.json").read_text())


def _musdb(work: Path) -> List[dict]:
    return json.loads((work / "musdb_index.json").read_text())


# --------------------------------------------------------------------- meter
def _features_cached(work: Path, key: str, x: np.ndarray, sr: int) -> dict:
    cache = work / "cache" / "features"
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text())
    mono = x.mean(axis=0) if x.shape[0] > 1 else x[0]
    feats = artifact_features(mono.astype(np.float32), sr, stereo=x if x.shape[0] == 2 else None)
    path.write_text(json.dumps(feats))
    return feats


def _meter_rows(work: Path, crop_s: Optional[float]) -> List[dict]:
    rows = []
    tag = "full" if crop_s is None else f"crop{crop_s:g}"
    for item in _udio(work):
        x, sr = _read(work / "udio" / f"{item['name']}.wav")
        if crop_s is not None:
            n = int(crop_s * sr)
            mid = x.shape[1] // 2
            x = x[:, max(0, mid - n // 2):max(0, mid - n // 2) + n]
        feats = _features_cached(work, f"udio_{item['name']}_{tag}", x, sr)
        rows.append({"set": "udio", "split": item["split"], "name": item["name"], **feats})
    for item in _musdb(work):
        x, sr = _read(Path(item["folder"]) / "mixture.wav")
        feats = _features_cached(work, f"musdb_{item['split']}_{item['name']}", x, sr)
        rows.append({"set": "musdb", "split": item["split"], "name": item["name"], **feats})
    return rows


def _codec_rows(work: Path, limit: int = 16) -> List[dict]:
    """MUSDB held-out mixtures re-encoded (mp3 128k/320k @48k, AAC 128k) — the meter must not move."""
    rows = []
    for item in [m for m in _musdb(work) if m["split"] == "held"][:limit]:
        src = Path(item["folder"]) / "mixture.wav"
        for codec, ext, extra in (("mp3_320_48k", "mp3", ["-ar", "48000", "-c:a", "libmp3lame", "-b:a", "320k"]),
                                  ("mp3_128", "mp3", ["-c:a", "libmp3lame", "-b:a", "128k"]),
                                  ("aac_128", "m4a", ["-c:a", "aac", "-b:a", "128k"])):
            enc = work / "cache" / "codec" / f"{item['name']}_{codec}.{ext}"
            if not enc.exists():
                enc.parent.mkdir(parents=True, exist_ok=True)
                subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-i", str(src)] + extra + [str(enc)],
                               check=True)
            x, sr = _decode(enc)
            feats = _features_cached(work, f"codec_{item['name']}_{codec}", x, sr)
            rows.append({"set": codec, "name": item["name"], **feats})
    return rows


def cmd_meter(args: argparse.Namespace) -> None:
    work = Path(args.work)
    for crop in (None, 7.0):
        rows = _meter_rows(work, crop)
        print(f"\n=== artifact meter, Udio {'full ~33 s' if crop is None else 'centre 7 s crop'}, MUSDB 7 s ===")
        keys = [k for k in rows[0] if k not in ("set", "split", "name") and isinstance(rows[0][k], (int, float))]
        keys = sorted(set(keys) | {"artifact_level"})
        for r in rows:
            r["artifact_level"] = artifact_level_from_features(r)
        for split in ("cal", "held"):
            u = [r for r in rows if r["set"] == "udio" and r["split"] == split]
            m = [r for r in rows if r["set"] == "musdb" and r["split"] == split]
            print(f"--- {split}: Udio n={len(u)}, MUSDB n={len(m)}")
            for k in keys:
                uv = [r[k] for r in u if r.get(k) is not None]
                mv = [r[k] for r in m if r.get(k) is not None]
                if not uv or not mv:
                    continue
                print(f"{k:>22}: AUC {_auc(uv, mv):.3f} | Udio med {np.median(uv):8.3f} | "
                      f"MUSDB med {np.median(mv):8.3f} | MUSDB max {np.max(mv):8.3f} | Udio min {np.min(uv):8.3f}")
        if args.dump:
            out = Path(args.dump).with_suffix(f".{('full' if crop is None else 'crop')}.json")
            out.write_text(json.dumps(rows, indent=1))
    rows = _codec_rows(work)
    base = {r["name"]: r for r in _meter_rows(work, None) if r["set"] == "musdb"}
    print("\n=== codec invariance (MUSDB held-out mixtures re-encoded) ===")
    for codec in sorted({r["set"] for r in rows}):
        lv = [artifact_level_from_features(r) for r in rows if r["set"] == codec]
        d = [artifact_level_from_features(r) - artifact_level_from_features(base[r["name"]])
             for r in rows if r["set"] == codec]
        print(f"{codec:>12}: level {_q(lv)}\n{'':>12}  delta vs AAC-256 original {_q(d)}")


# --------------------------------------------------------------------- clean
def cmd_clean(args: argparse.Namespace) -> None:
    work = Path(args.work)
    items = [m for m in _musdb(work) if m["stems"]]
    table: Dict[Tuple[str, str], List[float]] = {}
    for item in items:
        for stem in STEMS:
            x, sr = _read(Path(item["folder"]) / f"{stem}.wav")
            if _db(x) < -60.0:
                continue      # (near) silent stem in this excerpt
            for strength in STRENGTHS:
                clean, removed = denoise_dsp(x, sr, strength)
                assert np.max(np.abs(clean + removed - x)) < 1e-5
                table.setdefault((stem, strength), []).append(_db(x) - _db(clean))
    print(f"=== removed energy on clean MUSDB stems (dB lost = level(x) - level(clean)), {len(items)} clips ===")
    for strength in STRENGTHS:
        for stem in STEMS:
            print(f"{strength:>8} {stem:>7}: {_q(table.get((stem, strength), []))}")


# ----------------------------------------------------------------- synthetic
def _pink(n: int, rng: np.random.Generator) -> np.ndarray:
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n)
    f[0] = f[1]
    return np.fft.irfft(spec / np.sqrt(f), n=n)


def _flicker(x: np.ndarray, sr: int, depth_db: float, rng: np.random.Generator,
             frame_s: float = 0.012) -> np.ndarray:
    """Random per-frame gain (0..-depth dB, smoothed 2 ms) on the band above 8 kHz of ``x``."""
    from scipy import signal

    sos = signal.butter(6, 8000.0, btype="highpass", fs=sr, output="sos")
    hf = signal.sosfiltfilt(sos, x.astype(np.float64), axis=-1)
    n = x.shape[1]
    seg = int(frame_s * sr)
    g = 10.0 ** (rng.uniform(-depth_db, 0.0, -(-n // seg)) / 20.0)
    gain = np.repeat(g, seg)[:n]
    k = max(1, int(0.002 * sr))
    gain = np.convolve(gain, np.ones(k) / k, mode="same")
    return x + hf * (gain - 1.0)[np.newaxis]   # = low part + hf * gain


def cmd_synthetic(args: argparse.Namespace) -> None:
    from scipy import signal

    work = Path(args.work)
    items = [m for m in _musdb(work) if m["stems"]][: args.clips]
    rng = np.random.default_rng(0)
    sos_hf = None
    results: Dict[Tuple[str, str], List[float]] = {}
    for item in items:
        for stem in STEMS:
            x, sr = _read(Path(item["folder"]) / f"{stem}.wav")
            if _db(x) < -50.0:
                continue
            x64 = x.astype(np.float64)
            level = _db(x)
            cases = {}
            for kind, rel in (("white-30", -30.0), ("white-40", -40.0), ("pink-30", -30.0), ("pink-40", -40.0)):
                if kind.startswith("white"):
                    nz = rng.standard_normal(x.shape)
                else:
                    nz = np.stack([_pink(x.shape[1], rng) for _ in range(x.shape[0])])
                nz *= 10.0 ** ((level + rel) / 20.0) / math.sqrt(np.mean(nz ** 2))
                cases[kind] = nz
            for depth in (6.0, 12.0):
                cases[f"flicker-{depth:g}dB"] = _flicker(x64, sr, depth, rng) - x64
            if sos_hf is None:
                sos_hf = signal.butter(6, 8000.0, btype="highpass", fs=sr, output="sos")
            for kind, nz in cases.items():
                y = (x64 + nz).astype(np.float32)
                err_in = y.astype(np.float64) - x64
                for strength in STRENGTHS:
                    clean, _ = denoise_dsp(y, sr, strength)
                    err_out = clean.astype(np.float64) - x64
                    if kind.startswith("flicker"):
                        # flicker error lives above 8 kHz; measure it there
                        e_in = signal.sosfiltfilt(sos_hf, err_in, axis=-1)
                        e_out = signal.sosfiltfilt(sos_hf, err_out, axis=-1)
                    else:
                        e_in, e_out = err_in, err_out
                    results.setdefault((kind, strength), []).append(_db(e_in) - _db(e_out))
                    results.setdefault((kind + "|" + stem, strength), []).append(_db(e_in) - _db(e_out))
    print(f"=== SNR improvement (dB) = err(noisy) - err(denoised), err vs the clean stem; {len(items)} clips ===")
    for kind in ("white-30", "white-40", "pink-30", "pink-40", "flicker-6dB", "flicker-12dB"):
        for strength in STRENGTHS:
            print(f"{kind:>13} {strength:>8}: {_q(results.get((kind, strength), []))}")
    if args.per_stem:
        for (key, strength), v in sorted(results.items()):
            if "|" in key:
                print(f"{key:>22} {strength:>8}: median {np.median(v):6.2f} min {np.min(v):6.2f}")


# ---------------------------------------------------------------- model runs
def _engine():
    from stem_master.config import load_settings
    from stem_master.engines import AudioSeparatorEngine

    settings = load_settings()
    return AudioSeparatorEngine(settings), settings


def _cached_separate(work: Path, clip_key: str, x: np.ndarray, models: Tuple[str, ...], overlap: int,
                     stems: Optional[Sequence[str]] = None, ensemble: Optional[str] = None,
                     engine_box: Optional[list] = None) -> Dict[str, np.ndarray]:
    tag = hashlib.sha1(json.dumps([clip_key, list(models), overlap, ensemble]).encode()).hexdigest()[:12]
    folder = work / "cache" / "models" / f"{clip_key}__{'+'.join(m.split('.')[0] for m in models)}__ov{overlap}_{tag}"
    done = folder / "done.json"
    if done.exists():
        names = json.loads(done.read_text())
        return {k: _read(folder / f"{k}.wav")[0] for k in names}
    if engine_box is not None and engine_box:
        engine = engine_box[0]
    else:
        engine, _ = _engine()
        if engine_box is not None:
            engine_box.append(engine)
    out = engine.separate(x, models, ensemble_algorithm=ensemble, overlap=overlap, stems=stems)
    folder.mkdir(parents=True, exist_ok=True)
    for k, v in out.items():
        _write(folder / f"{k}.wav", v, WORK_SR)
    done.write_text(json.dumps(sorted(out)))
    return out


def _corr(a: np.ndarray, b: np.ndarray) -> float:
    a = a.astype(np.float64).ravel()
    b = b.astype(np.float64).ravel()
    den = math.sqrt(float(np.dot(a, a)) * float(np.dot(b, b)))
    return float(np.dot(a, b) / den) if den > 0 else 0.0


def _flatness_db(x: np.ndarray, sr: int, lo: float = 500.0, hi: float = 16000.0) -> float:
    """Median per-frame spectral flatness (0..1, ~0.56 for white noise) of ``x`` in [lo, hi)."""
    from scipy import signal

    f, _, z = signal.stft(x.mean(axis=0), fs=sr, nperseg=2048, noverlap=1536)
    band = (f >= lo) & (f < min(hi, 0.95 * sr / 2))
    p = np.abs(z[band]) ** 2 + 1e-20
    e = p.sum(axis=0)
    keep = e > e.max() * 1e-5
    if not np.any(keep):
        return float("nan")
    flat = np.exp(np.mean(np.log(p[:, keep]), axis=0)) / np.mean(p[:, keep], axis=0)
    return float(np.median(flat))


def _describe_removed(x: np.ndarray, clean: np.ndarray, removed: np.ndarray, sr: int) -> dict:
    return {
        "lost_db": round(_db(x) - _db(clean), 3),
        "removed_rel_db": round(_db(removed) - _db(x), 2),
        "flatness_removed": round(_flatness_db(removed, sr), 3),
        "flatness_stem": round(_flatness_db(x, sr), 3),
        "corr_removed_clean": round(_corr(removed, clean), 3),
    }


def cmd_udio(args: argparse.Namespace) -> None:
    """Separate a few Udio clips with the production models (fast quality,
    cached), then measure what DSP denoise removes from each stem."""
    from stem_master import pipeline as pl

    work = Path(args.work)
    clips = _udio(work)[: args.clips]
    engine_box: list = []
    overlap = int(os.environ.get("STEM_MASTER_OVERLAP_FAST", "2"))
    rows = []
    for item in clips:
        x, sr = _read(work / "udio" / f"{item['name']}.wav")
        x44 = resample(x, sr, WORK_SR) if sr != WORK_SR else x
        if args.seconds:
            mid = x44.shape[1] // 2
            n = int(args.seconds * WORK_SR)
            x44 = x44[:, max(0, mid - n // 2):max(0, mid - n // 2) + n]
        key = f"{item['name']}_{args.seconds or 'full'}"
        voc = _cached_separate(work, key, x44, pl.MODEL_PLAN["vocals_fast"].models, overlap,
                               stems=(pl.VOCALS_OUTPUT,), engine_box=engine_box)["vocals"]
        stems = {"vocals": voc}
        if not args.vocals_only:
            inst = x44 - voc
            parts = _cached_separate(work, key + "_inst", inst, pl.MODEL_PLAN["instruments"].models, overlap,
                                     stems=pl.INSTRUMENT_OUTPUTS, engine_box=engine_box)
            for k in ("bass", "drums", "guitar", "piano"):
                stems[k] = parts[k]
            stems["other"] = inst - sum(parts[k] for k in ("bass", "drums", "guitar", "piano"))
        if args.neural:
            dn = _cached_separate(work, key + "_vocals", voc, pl.MODEL_PLAN["vocal_denoise"].models, overlap,
                                  stems=(pl.DENOISE_OUTPUT,), engine_box=engine_box)[pl.DENOISE_OUTPUT]
            rows.append({"clip": item["name"], "stem": "vocals", "stage": "neural",
                         **_describe_removed(voc, dn, voc - dn, WORK_SR)})
        for stem, s in stems.items():
            meas = measure_artifacts(s, WORK_SR)
            for strength in STRENGTHS:
                clean, removed = denoise_dsp(s, WORK_SR, strength)
                rows.append({"clip": item["name"], "stem": stem, "stage": strength,
                             "hiss_db": meas.get("hiss_db"), "flicker_db": meas.get("flicker_db"),
                             **_describe_removed(s, clean, removed, WORK_SR)})
        print(f"done {item['name']}", flush=True)
    for r in rows:
        print(json.dumps(r))
    if args.dump:
        Path(args.dump).write_text(json.dumps(rows, indent=1))


def cmd_neural(args: argparse.Namespace) -> None:
    """The neural vocal denoise model on clean MUSDB vocal stems."""
    from stem_master import pipeline as pl

    work = Path(args.work)
    items = [m for m in _musdb(work) if m["stems"]]
    held = [m for m in items if m["split"] == "held"][: args.clips]
    engine_box: list = []
    overlap = int(os.environ.get("STEM_MASTER_OVERLAP_MAX", "4"))
    rows = []
    for item in held:
        x, sr = _read(Path(item["folder"]) / "vocals.wav")
        if _db(x) < -50.0:
            continue
        out = _cached_separate(work, f"musdb_{item['name']}_vocals", x, pl.MODEL_PLAN["vocal_denoise"].models,
                               overlap, stems=None, engine_box=engine_box)
        dry = out[pl.DENOISE_OUTPUT]
        other = {k: v for k, v in out.items() if k != pl.DENOISE_OUTPUT}
        rec = {"clip": item["name"], **_describe_removed(x, dry, x - dry, sr)}
        for k, v in other.items():
            rec[f"{k}_rel_db"] = round(_db(v) - _db(x), 2)
            rec[f"{k}_corr_with_vocal"] = round(_corr(v, x), 3)
        rows.append(rec)
        print(json.dumps(rec), flush=True)
    lost = [r["lost_db"] for r in rows]
    print(f"neural vocal denoise on clean MUSDB vocals: dB lost {_q(lost)}")
    print(f"  removed level rel. stem: {_q([r['removed_rel_db'] for r in rows])}")
    print(f"  flatness of removed: {_q([r['flatness_removed'] for r in rows])}")


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    pr = sub.add_parser("prepare")
    pr.add_argument("--work", required=True)
    pr.add_argument("--udio-parquet", required=True)
    pr.add_argument("--musdb", required=True)
    pr.add_argument("--udio-count", type=int, default=60)
    pr.add_argument("--stems-per-split", type=int, default=20)
    pr.set_defaults(func=cmd_prepare)
    me = sub.add_parser("meter")
    me.add_argument("--work", required=True)
    me.add_argument("--dump")
    me.set_defaults(func=cmd_meter)
    cl = sub.add_parser("clean")
    cl.add_argument("--work", required=True)
    cl.set_defaults(func=cmd_clean)
    sy = sub.add_parser("synthetic")
    sy.add_argument("--work", required=True)
    sy.add_argument("--clips", type=int, default=12)
    sy.add_argument("--per-stem", action="store_true")
    sy.set_defaults(func=cmd_synthetic)
    ud = sub.add_parser("udio")
    ud.add_argument("--work", required=True)
    ud.add_argument("--clips", type=int, default=4)
    ud.add_argument("--seconds", type=float, default=0.0, help="centre crop (0 = whole clip)")
    ud.add_argument("--vocals-only", action="store_true")
    ud.add_argument("--neural", action="store_true", help="also run the neural vocal denoise model")
    ud.add_argument("--dump")
    ud.set_defaults(func=cmd_udio)
    ne = sub.add_parser("neural")
    ne.add_argument("--work", required=True)
    ne.add_argument("--clips", type=int, default=12)
    ne.set_defaults(func=cmd_neural)
    args = p.parse_args(argv)
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
