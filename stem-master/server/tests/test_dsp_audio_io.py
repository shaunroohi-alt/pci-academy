"""Tests for stem_master.dsp.audio_io (decode, resample, channel helpers, WAV/AAC IO)."""

from __future__ import annotations

import shutil
import subprocess

import numpy as np
import pytest
import soundfile as sf

from stem_master.dsp.audio_io import (
    AudioDecodeError,
    DecodedAudio,
    decode_audio,
    encode_preview_aac,
    fit_length,
    read_wav,
    resample,
    to_channels,
    to_stereo,
    write_wav,
)

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
                                reason="ffmpeg/ffprobe not on PATH")


def _test_signal(channels: int, sr: int = 44100, seconds: float = 1.0, peak: float = 0.9) -> np.ndarray:
    rng = np.random.default_rng(channels)
    t = np.arange(int(sr * seconds)) / sr
    rows = []
    for ch in range(channels):
        y = 0.4 * np.sin(2 * np.pi * (220.0 + 110.0 * ch) * t) + 0.2 * np.sin(2 * np.pi * 3170.0 * t)
        y += 0.05 * rng.standard_normal(t.size)
        rows.append(y)
    x = np.stack(rows)
    return (x / np.max(np.abs(x)) * peak).astype(np.float32)


def _err_db(a: np.ndarray, b: np.ndarray) -> float:
    err = np.sqrt(np.mean((a.astype(np.float64) - b) ** 2))
    ref = np.sqrt(np.mean(b.astype(np.float64) ** 2))
    return 20 * np.log10(err / ref + 1e-300)


@pytest.mark.parametrize("channels", [1, 2])
@pytest.mark.parametrize("fmt,subtype,tol", [
    ("wav32f", "FLOAT", 0.0),
    ("wav24", "PCM_24", 2.0 / 2 ** 23),
    ("wav16", "PCM_16", 2.0 / 2 ** 15),
])
def test_wav_round_trip(tmp_path, channels, fmt, subtype, tol):
    x = _test_signal(channels)
    path = tmp_path / f"rt_{fmt}_{channels}.wav"
    write_wav(path, x, 44100, fmt)
    info = sf.info(str(path))
    assert info.subtype == subtype and info.channels == channels and info.samplerate == 44100
    y, sr = read_wav(path)
    assert sr == 44100
    assert y.dtype == np.float32 and y.shape == x.shape
    assert np.max(np.abs(y - x)) <= tol
    assert not (tmp_path / f"rt_{fmt}_{channels}.wav.part").exists()


def test_write_wav_clips_integer_formats_and_sanitises(tmp_path):
    x = np.array([[1.5, -1.5, 0.5, np.nan, np.inf]], dtype=np.float32)
    write_wav(tmp_path / "c16.wav", x, 8000, "wav16")
    y, _ = read_wav(tmp_path / "c16.wav")
    assert y[0, 0] == pytest.approx(1.0, abs=1e-4)      # clipped, not wrapped
    assert y[0, 1] == pytest.approx(-1.0, abs=1e-4)
    assert y[0, 3] == 0.0 and y[0, 4] == 0.0
    write_wav(tmp_path / "f.wav", x, 8000, "wav32f")      # float keeps overs
    z, _ = read_wav(tmp_path / "f.wav")
    assert z[0, 0] == pytest.approx(1.5)
    with pytest.raises(ValueError):
        write_wav(tmp_path / "bad.wav", x, 8000, "mp3")


@pytest.mark.parametrize("channels,fmt,codec", [(1, "wav24", "pcm_s24le"), (2, "wav32f", "pcm_f32le")])
def test_decode_wav_at_source_rate(tmp_path, channels, fmt, codec):
    x = _test_signal(channels, sr=48000, seconds=0.5)
    path = tmp_path / "in.wav"
    write_wav(path, x, 48000, fmt)
    dec = decode_audio(path)
    assert isinstance(dec, DecodedAudio)
    assert dec.sample_rate == 48000 and dec.channels == channels and dec.codec == codec
    assert dec.samples.dtype == np.float32 and dec.samples.shape == x.shape
    assert np.max(np.abs(dec.samples - x)) < 2.0 / 2 ** 23
    assert dec.duration_seconds == pytest.approx(0.5)
    # the temporary raw spool file is cleaned up
    assert sorted(p.name for p in tmp_path.iterdir()) == ["in.wav"]


def test_decode_multichannel_is_downmixed_to_stereo(tmp_path):
    rng = np.random.default_rng(0)
    six = (rng.standard_normal((44100 // 4, 6)) * 0.1).astype(np.float32)
    path = tmp_path / "surround.wav"
    sf.write(str(path), six, 44100, subtype="FLOAT")
    dec = decode_audio(path)
    assert dec.channels == 2 and dec.samples.shape == (2, six.shape[0])


def test_decode_mp3(tmp_path):
    x = _test_signal(2, seconds=1.0)
    src = tmp_path / "src.wav"
    write_wav(src, x, 44100, "wav16")
    mp3 = tmp_path / "s.mp3"
    proc = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-c:a", "libmp3lame",
                           "-b:a", "192k", str(mp3)], capture_output=True)
    if proc.returncode != 0:
        pytest.skip("ffmpeg has no mp3 encoder")
    dec = decode_audio(mp3)
    assert dec.codec == "mp3" and dec.channels == 2 and dec.sample_rate == 44100
    assert abs(dec.num_frames - x.shape[1]) < 0.06 * 44100


def test_decode_errors(tmp_path):
    with pytest.raises(AudioDecodeError):
        decode_audio(tmp_path / "missing.wav")
    junk = tmp_path / "junk.mp3"
    junk.write_bytes(b"this is not audio at all" * 100)
    with pytest.raises(AudioDecodeError):
        decode_audio(junk)
    video = tmp_path / "silent_video.mp4"
    proc = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                           "color=c=black:s=32x32:d=0.5", "-c:v", "mpeg4", str(video)], capture_output=True)
    if proc.returncode == 0:
        with pytest.raises(AudioDecodeError, match="no audio stream"):
            decode_audio(video)
    assert issubclass(AudioDecodeError, ValueError)


@pytest.mark.parametrize("name, playlist", [
    ("input.m3u8", "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:1.0,\nsecret.wav\n#EXT-X-ENDLIST\n"),
    ("input.ffconcat", "ffconcat version 1.0\nfile secret.wav\n"),
])
def test_decode_refuses_playlists_that_read_other_files(tmp_path, name, playlist):
    """An upload is stored as ``input.<its extension>``; with a playlist
    extension, an unguarded ffmpeg follows the playlist and decodes whatever
    it names (other local files, or URLs for HLS). decode_audio must apply
    the same demuxer / protocol whitelist as probe_audio."""
    write_wav(tmp_path / "secret.wav", _test_signal(2), 44100, "wav32f")
    upload = tmp_path / name
    upload.write_text(playlist)
    with pytest.raises(AudioDecodeError):
        decode_audio(upload)


def test_decode_temp_file_goes_to_tmp_dir_not_next_to_the_source(tmp_path, monkeypatch):
    import stem_master.dsp.audio_io as audio_io_module

    source_dir = tmp_path / "music"
    source_dir.mkdir()
    src = source_dir / "song.wav"
    write_wav(src, _test_signal(2), 44100, "wav32f")
    seen = []
    original = audio_io_module.tempfile.mkstemp

    def spy(*args, **kwargs):
        seen.append(kwargs.get("dir"))
        return original(*args, **kwargs)

    monkeypatch.setattr(audio_io_module.tempfile, "mkstemp", spy)
    decode_audio(src)
    assert seen and seen[-1] != str(source_dir) and seen[-1] is None, "default: the system temp dir"
    work = tmp_path / "work"
    work.mkdir()
    decoded = decode_audio(src, tmp_dir=work)
    assert seen[-1] == str(work) and decoded.num_frames == 44100
    assert sorted(p.name for p in source_dir.iterdir()) == ["song.wav"]
    assert list(work.iterdir()) == []


def test_resample_round_trip_48k_44k1_48k():
    sr = 48000
    t = np.arange(sr * 2) / sr
    rng = np.random.default_rng(1)
    x = np.zeros((2, t.size))
    for f in rng.uniform(40.0, 15000.0, size=12):
        x += 0.05 * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi))
    x = x.astype(np.float32)
    down = resample(x, 48000, 44100)
    assert down.shape[0] == 2 and abs(down.shape[1] - 2 * 44100) <= 1
    back = fit_length(resample(down, 44100, 48000), x.shape[1])
    core = slice(4800, -4800)  # ignore the 100 ms filter edges
    assert _err_db(back[:, core], x[:, core]) < -60.0
    assert resample(x, 48000, 48000) is not None
    np.testing.assert_array_equal(resample(x, 48000, 48000), x)


def test_fit_length_and_channel_helpers():
    x = np.arange(10, dtype=np.float32).reshape(2, 5)
    assert fit_length(x, 3).shape == (2, 3)
    padded = fit_length(x, 8)
    assert padded.shape == (2, 8) and np.all(padded[:, 5:] == 0) and np.all(padded[:, :5] == x)
    mono = x[:1]
    st = to_stereo(mono)
    assert st.shape == (2, 5) and np.all(st[0] == st[1])
    assert to_stereo(x) is x
    m = to_channels(x, 1)
    assert m.shape == (1, 5) and np.allclose(m[0], x.mean(axis=0))
    assert to_channels(mono, 2).shape == (2, 5)
    with pytest.raises(ValueError):
        to_stereo(np.zeros((3, 4), dtype=np.float32))


@pytest.mark.parametrize("sr", [44100, 96000])
def test_encode_preview_aac(tmp_path, sr):
    seconds = 3.0
    x = _test_signal(2, sr=sr, seconds=seconds, peak=0.5)
    wav = tmp_path / "stem.wav"
    write_wav(wav, x, sr, "wav24")
    m4a = tmp_path / "stem.m4a"
    encode_preview_aac(wav, m4a)
    data = m4a.read_bytes()
    assert data[4:8] == b"ftyp"
    assert 0 <= data.find(b"moov") < data.find(b"mdat")  # +faststart: index before media data
    dec = decode_audio(m4a)
    assert dec.codec == "aac" and dec.channels == 2
    assert dec.sample_rate == min(sr, 48000)
    assert abs(dec.duration_seconds - seconds) <= 0.05
    assert not (tmp_path / "stem.m4a.part").exists()


def test_encode_preview_aac_failure(tmp_path):
    bogus = tmp_path / "bogus.wav"
    bogus.write_bytes(b"not a wav")
    with pytest.raises(RuntimeError):
        encode_preview_aac(bogus, tmp_path / "out.m4a")
    assert not (tmp_path / "out.m4a").exists()
