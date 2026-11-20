"""Block-wise tight-frame STFT shared by the DSP modules.

Frame convention
----------------
For a signal of ``n`` samples, ``n_fft`` and ``hop`` with ``n_fft % hop == 0``
(``R = n_fft // hop`` frames overlap every sample), frame ``m`` covers the
original samples ``[m*hop - (n_fft - hop), m*hop + hop)``; samples outside
``[0, n)`` read as zeros. With this convention every sample ``t`` is covered by
exactly the ``R`` frames ``floor(t/hop) .. floor(t/hop) + R - 1`` and there are
``floor((n - 1)/hop) + R`` frames in total.

With a window ``w`` whose squared, hop-shifted copies sum to a constant (the
periodic sqrt-Hann window at 75 % overlap sums to exactly 2), analysis followed
by weighted overlap-add synthesis reconstructs the input exactly (to float32
rounding), so any per-bin gain can be applied without touching the rest of the
signal.

Because every output sample only depends on the ``R`` frames that cover it,
the signal can be processed in independent time blocks: block ``[s0, s1)``
(``s0`` a multiple of ``hop``) needs frames ``[s0//hop, (s1-1)//hop + R)``, plus
whatever context frames a per-frame computation (e.g. smoothing over time)
looks at. The result is bit-for-bit independent of the block size as long as
the per-frame computation only depends on the frames inside its context.
"""

from __future__ import annotations

import os
from typing import Iterator, NamedTuple, Optional

import numpy as np
import scipy.fft
from numpy.lib.stride_tricks import sliding_window_view

FFT_WORKERS = max(1, min(4, os.cpu_count() or 1))
"""Threads used by :mod:`scipy.fft` for the batched transforms."""


def hann(n_fft: int) -> np.ndarray:
    """Periodic Hann window (float64)."""
    k = np.arange(n_fft, dtype=np.float64)
    return 0.5 - 0.5 * np.cos(2.0 * np.pi * k / n_fft)


def sqrt_hann(n_fft: int) -> np.ndarray:
    """Periodic sqrt-Hann window (float64): a tight frame at hop ``n_fft/4``."""
    return np.sqrt(hann(n_fft))


def scaled_fft_size(base: int, sr: int, reference_sr: int = 44100, minimum: int = 256) -> int:
    """Power-of-two FFT size giving roughly the same time span as ``base`` at ``reference_sr``."""
    target = base * float(sr) / float(reference_sr)
    size = 1 << int(round(np.log2(max(target, 1.0))))
    return max(minimum, size)


class Block(NamedTuple):
    """One processing block.

    ``[s0, s1)`` are the output samples the block is responsible for,
    ``[m0, m1)`` the frames that cover them and ``[fa, fb)`` the frames to
    analyse (``[m0, m1)`` widened by the requested context, clipped to the
    signal's frame range).
    """

    s0: int
    s1: int
    m0: int
    m1: int
    fa: int
    fb: int


class FrameGrid:
    """STFT frame bookkeeping, analysis and exact overlap-add synthesis."""

    def __init__(self, n_samples: int, n_fft: int, hop: int, window: Optional[np.ndarray] = None) -> None:
        if n_fft <= 0 or hop <= 0 or n_fft % hop != 0:
            raise ValueError("n_fft must be a positive multiple of hop")
        self.n = int(n_samples)
        self.n_fft = int(n_fft)
        self.hop = int(hop)
        self.overlap = self.n_fft // self.hop
        w = sqrt_hann(self.n_fft) if window is None else np.asarray(window, dtype=np.float64)
        if w.shape != (self.n_fft,):
            raise ValueError("window length must equal n_fft")
        self.window64 = w
        self.window = w.astype(np.float32)
        self.n_bins = self.n_fft // 2 + 1
        self.n_frames = (self.n - 1) // self.hop + self.overlap if self.n > 0 else 0
        # Synthesis normalisation: sum of squared, hop-shifted windows, per
        # position inside a hop. Every sample is covered by exactly R frames,
        # so this is exact everywhere (including the signal edges).
        norm = (w * w).reshape(self.overlap, self.hop).sum(axis=0)
        if np.any(norm <= 1e-12):
            raise ValueError("window is not invertible at this hop")
        self._inv_norm = (1.0 / norm).astype(np.float32)

    # ------------------------------------------------------------------ geometry
    def frame_start(self, m: int) -> int:
        """First original sample covered by frame ``m`` (may be negative)."""
        return m * self.hop - (self.n_fft - self.hop)

    def frame_center_seconds(self, m: np.ndarray, sr: int) -> np.ndarray:
        """Centre time of frame(s) ``m`` in seconds."""
        return (np.asarray(m, dtype=np.float64) * self.hop - (self.n_fft - self.hop) + self.n_fft / 2.0) / sr

    def bin_frequencies(self, sr: int) -> np.ndarray:
        return np.arange(self.n_bins, dtype=np.float64) * (float(sr) / self.n_fft)

    def blocks(self, block_frames: int, context: int = 0) -> Iterator[Block]:
        """Iterate over output blocks of ``block_frames * hop`` samples."""
        block_frames = max(int(block_frames), self.overlap + 2 * int(context) + 1)
        step = block_frames * self.hop
        for s0 in range(0, self.n, step):
            s1 = min(self.n, s0 + step)
            m0 = s0 // self.hop
            m1 = min(self.n_frames, (s1 - 1) // self.hop + self.overlap)
            fa = max(0, m0 - context)
            fb = min(self.n_frames, m1 + context)
            yield Block(s0, s1, m0, m1, fa, fb)

    # ------------------------------------------------------------------ analysis
    def frames(self, x: np.ndarray, m0: int, m1: int) -> np.ndarray:
        """Windowed time frames ``[m0, m1)`` of the 1-D signal ``x`` (float32, (F, n_fft))."""
        a = self.frame_start(m0)
        b = self.frame_start(m1 - 1) + self.n_fft
        seg = np.zeros(b - a, dtype=np.float32)
        lo, hi = max(a, 0), min(b, self.n)
        if hi > lo:
            seg[lo - a:hi - a] = x[lo:hi]
        view = sliding_window_view(seg, self.n_fft)[:: self.hop]
        return view * self.window

    def analyze(self, x: np.ndarray, m0: int, m1: int) -> np.ndarray:
        """Spectra of frames ``[m0, m1)`` of the 1-D signal ``x``: complex64 (F, n_bins)."""
        if m1 <= m0:
            return np.zeros((0, self.n_bins), dtype=np.complex64)
        return scipy.fft.rfft(self.frames(x, m0, m1), axis=-1, workers=FFT_WORKERS)

    def analyze_indices(self, x: np.ndarray, frame_idx: np.ndarray) -> np.ndarray:
        """Spectra of an arbitrary set of frames (complex64 (len(idx), n_bins))."""
        frame_idx = np.asarray(frame_idx, dtype=np.int64)
        out = np.empty((frame_idx.size, self.n_fft), dtype=np.float32)
        for row, m in enumerate(frame_idx):
            out[row] = self.frames(x, int(m), int(m) + 1)[0]
        return scipy.fft.rfft(out, axis=-1, workers=FFT_WORKERS)

    # ----------------------------------------------------------------- synthesis
    def synthesize(self, spectra: np.ndarray, m0: int, s0: int, s1: int) -> np.ndarray:
        """Overlap-add frames ``[m0, m0 + F)`` and return output samples ``[s0, s1)``.

        The frames must include every frame covering ``[s0, s1)`` (i.e. the
        ``[m0, m1)`` range of the block), otherwise the edges are incomplete.
        """
        n_frames = spectra.shape[0]
        frames = scipy.fft.irfft(spectra, n=self.n_fft, axis=-1, workers=FFT_WORKERS)
        frames = (frames * self.window).astype(np.float32, copy=False)
        frames = frames.reshape(n_frames, self.overlap, self.hop)
        buf = np.zeros((n_frames + self.overlap - 1) * self.hop, dtype=np.float32)
        span = n_frames * self.hop
        for r in range(self.overlap):
            buf[r * self.hop:r * self.hop + span] += frames[:, r, :].reshape(span)
        a = self.frame_start(m0)
        out = buf[s0 - a:s1 - a]
        # position inside the hop of sample s is s mod hop (frame starts are
        # multiples of hop shifted by n_fft - hop, itself a multiple of hop)
        phase = np.arange(s0, s1) % self.hop
        out *= self._inv_norm[phase]
        return out
