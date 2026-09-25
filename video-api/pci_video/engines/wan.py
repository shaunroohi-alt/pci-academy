"""Wan 2.1 text-to-video via ComfyUI core nodes. Experimental on Mac.

The 1.3B model fits in 16 GB but is slow on MPS; 14B is not realistic on a
laptop. Registered now so the API shape does not change when it is used.
"""

from __future__ import annotations

from ..prompts import RenderedPrompt
from .base import Engine, ModelFile, RenderPlan, Variant, add_video_output

HF = "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files"

UMT5 = ModelFile("text_encoder", "CLIPLoader", "clip_name",
                 ("umt5_xxl_fp16*.safetensors", "umt5*xxl*.safetensors"), "text_encoders", HF + "/text_encoders")
VAE = ModelFile("vae", "VAELoader", "vae_name", ("wan_2.1_vae*.safetensors", "wan*2.1*vae*"), "vae", HF + "/vae")


def _unet(*patterns: str) -> ModelFile:
    return ModelFile("diffusion_model", "UNETLoader", "unet_name", patterns, "diffusion_models",
                     HF + "/diffusion_models")


class WanEngine(Engine):
    key = "wan"
    label = "Wan 2.1 (Alibaba)"
    status = "experimental"
    description = "Higher fidelity motion than LTX, much slower. 1.3B only on a Mac."
    fps = 16
    frame_multiple = 4
    dim_multiple = 16
    max_duration = 5.0
    variants = (
        Variant("1.3b", "Wan 2.1 T2V 1.3B.", (_unet("wan2.1_t2v_1.3b*.safetensors"), UMT5, VAE),
                steps=30, cfg=6.0),
        Variant("14b", "Wan 2.1 T2V 14B. Needs 64 GB+.", (_unet("wan2.1_t2v_14b*.safetensors"), UMT5, VAE),
                steps=30, cfg=6.0, min_memory_gb=64),
    )

    def build_workflow(self, plan: RenderPlan, prompt: RenderedPrompt, filename_prefix: str,
                       nodes: set[str]) -> dict:
        g = {
            "unet": {"class_type": "UNETLoader",
                     "inputs": {"unet_name": plan.models["diffusion_model"], "weight_dtype": "default"}},
            "clip": {"class_type": "CLIPLoader", "inputs": {"clip_name": plan.models["text_encoder"], "type": "wan"}},
            "vae": {"class_type": "VAELoader", "inputs": {"vae_name": plan.models["vae"]}},
            "shift": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["unet", 0], "shift": 8.0}},
            "pos": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt.positive, "clip": ["clip", 0]}},
            "neg": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt.negative, "clip": ["clip", 0]}},
            "latent": {"class_type": "EmptyHunyuanLatentVideo",
                       "inputs": {"width": plan.width, "height": plan.height, "length": plan.frames,
                                  "batch_size": 1}},
            "sample": {"class_type": "KSampler",
                       "inputs": {"model": ["shift", 0], "positive": ["pos", 0], "negative": ["neg", 0],
                                  "latent_image": ["latent", 0], "seed": plan.seed, "steps": plan.steps,
                                  "cfg": plan.cfg, "sampler_name": "uni_pc", "scheduler": "simple",
                                  "denoise": 1.0}},
            "decode": {"class_type": "VAEDecode", "inputs": {"samples": ["sample", 0], "vae": ["vae", 0]}},
        }
        add_video_output(g, ["decode", 0], plan.fps, filename_prefix, nodes)
        return g
