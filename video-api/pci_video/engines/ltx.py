"""LTX-Video via ComfyUI core nodes (no custom nodes required).

Graph mirrors ComfyUI's own LTXV text-to-video example: checkpoint (model +
VAE) + T5 text encoder -> LTXVConditioning -> SamplerCustomAdvanced with
LTXVScheduler -> VAEDecode -> video.

The 2B distilled model is the default because it is the one that renders in
minutes, not hours, on Apple Silicon.
"""

from __future__ import annotations

from ..prompts import RenderedPrompt
from .base import Engine, ModelFile, RenderPlan, Variant, add_video_output

HF = "https://huggingface.co/Lightricks/LTX-Video/tree/main"

T5 = ModelFile(
    role="text_encoder", loader="CLIPLoader", input="clip_name", folder="text_encoders",
    # fp16 first: Metal (MPS) has no float8 support, so fp8 files are a last resort.
    patterns=("t5xxl_fp16*.safetensors", "t5xxl*.safetensors", "t5*xxl*"),
    hint="https://huggingface.co/comfyanonymous/flux_text_encoders (t5xxl_fp16.safetensors)",
)


def _ckpt(*patterns: str) -> ModelFile:
    return ModelFile(role="checkpoint", loader="CheckpointLoaderSimple", input="ckpt_name",
                     folder="checkpoints", patterns=patterns, hint=HF)


class LTXEngine(Engine):
    key = "ltx"
    label = "LTX-Video (Lightricks)"
    status = "ready"
    description = "Fast text-to-video. 2B distilled runs on 16 GB Apple Silicon at draft quality."
    fps = 24
    frame_multiple = 8
    dim_multiple = 32
    max_duration = 10.0
    variants = (
        Variant("2b-distilled", "LTX-Video 2B distilled, 8 steps. Best first choice on a Mac.",
                (_ckpt("ltxv-2b*distilled*.safetensors"), T5), steps=8, cfg=1.0),
        Variant("2b", "LTX-Video 2B full model, 30 steps, CFG 3.",
                (_ckpt("ltx-video-2b*.safetensors", "ltxv-2b*dev*.safetensors"), T5), steps=30, cfg=3.0),
        Variant("13b-distilled", "LTX-Video 13B distilled. Needs 32 GB+ unified memory.",
                (_ckpt("ltxv-13b*distilled*.safetensors"), T5), steps=8, cfg=1.0, min_memory_gb=32),
        Variant("13b", "LTX-Video 13B dev, 30 steps. Needs 64 GB and patience.",
                (_ckpt("ltxv-13b*dev*.safetensors"), T5), steps=30, cfg=3.0, min_memory_gb=64),
    )

    def overrides(self, settings) -> dict[str, str | None]:
        return {"checkpoint": settings.ltx_checkpoint, "text_encoder": settings.ltx_text_encoder}

    def build_workflow(self, plan: RenderPlan, prompt: RenderedPrompt, filename_prefix: str,
                       nodes: set[str]) -> dict:
        g = {
            "ckpt": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": plan.models["checkpoint"]}},
            "clip": {"class_type": "CLIPLoader",
                     "inputs": {"clip_name": plan.models["text_encoder"], "type": "ltxv"}},
            "pos": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt.positive, "clip": ["clip", 0]}},
            "neg": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt.negative, "clip": ["clip", 0]}},
            "cond": {"class_type": "LTXVConditioning",
                     "inputs": {"positive": ["pos", 0], "negative": ["neg", 0], "frame_rate": float(plan.fps)}},
            "latent": {"class_type": "EmptyLTXVLatentVideo",
                       "inputs": {"width": plan.width, "height": plan.height, "length": plan.frames,
                                  "batch_size": 1}},
            "sched": {"class_type": "LTXVScheduler",
                      "inputs": {"steps": plan.steps, "max_shift": 2.05, "base_shift": 0.95, "stretch": True,
                                 "terminal": 0.1, "latent": ["latent", 0]}},
            "sampler": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
            "noise": {"class_type": "RandomNoise", "inputs": {"noise_seed": plan.seed}},
            "guider": {"class_type": "CFGGuider",
                       "inputs": {"model": ["ckpt", 0], "positive": ["cond", 0], "negative": ["cond", 1],
                                  "cfg": plan.cfg}},
            "sample": {"class_type": "SamplerCustomAdvanced",
                       "inputs": {"noise": ["noise", 0], "guider": ["guider", 0], "sampler": ["sampler", 0],
                                  "sigmas": ["sched", 0], "latent_image": ["latent", 0]}},
            "decode": {"class_type": "VAEDecode", "inputs": {"samples": ["sample", 0], "vae": ["ckpt", 2]}},
        }
        add_video_output(g, ["decode", 0], plan.fps, filename_prefix, nodes)
        return g
