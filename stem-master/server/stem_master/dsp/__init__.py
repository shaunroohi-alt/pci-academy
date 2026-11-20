"""DSP layer: decoding/IO, analysis, cleanup and denoise.

All audio arrays are float32 numpy arrays shaped ``(channels, samples)``.
"""

from .analysis import analyze, stem_stats
from .audio_io import (
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
from .cleanup import activity_gate, bleed_mask, cleanup_stems, range_filter
from .denoise import denoise_dsp

__all__ = [
    "AudioDecodeError",
    "DecodedAudio",
    "activity_gate",
    "analyze",
    "bleed_mask",
    "cleanup_stems",
    "decode_audio",
    "denoise_dsp",
    "encode_preview_aac",
    "fit_length",
    "range_filter",
    "read_wav",
    "resample",
    "stem_stats",
    "to_channels",
    "to_stereo",
    "write_wav",
]
