"""HunyuanVideo text-to-video via ComfyUI core nodes. Experimental.

A 13B model: plan on 64 GB+ unified memory and long render times on a Mac.
Registered so the API contract is stable when bigger hardware is available.
"""

from __future__ import annotations

from ..prompts import RenderedPrompt
from .base import Engine, ModelFile, RenderPlan, Variant, add_video_output

HF = "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/tree/main/split_files"


class HunyuanEngine(Engine):
    key = "hunyuan"
    label = "HunyuanVideo (Tencent)"
    status = "experimental"
    description = "Large, high quality, very slow without a big GPU."
    fps = 24
    frame_multiple = 4
    dim_multiple = 16
    max_duration = 5.0
    variants = (
        Variant("t2v-720p", "HunyuanVideo T2V 720p.", (
            ModelFile("diffusion_model", "UNETLoader", "unet_name", ("hunyuan_video_t2v_720p*.safetensors",),
                      "diffusion_models", HF + "/diffusion_models"),
            ModelFile("clip_l", "DualCLIPLoader", "clip_name1", ("clip_l*.safetensors",),
                      "text_encoders", HF + "/text_encoders"),
            ModelFile("llava", "DualCLIPLoader", "clip_name2", ("llava_llama3_fp16*", "llava_llama3*"),
                      "text_encoders", HF + "/text_encoders"),
            ModelFile("vae", "VAELoader", "vae_name", ("hunyuan_video_vae*.safetensors",), "vae", HF + "/vae"),
        ), steps=20, cfg=6.0, min_memory_gb=64),
    )

    def build_workflow(self, plan: RenderPlan, prompt: RenderedPrompt, filename_prefix: str,
                       nodes: set[str]) -> dict:
        # HunyuanVideo is guidance-distilled: guidance goes through FluxGuidance
        # and there is no negative prompt.
        g = {
            "unet": {"class_type": "UNETLoader",
                     "inputs": {"unet_name": plan.models["diffusion_model"], "weight_dtype": "default"}},
            "clip": {"class_type": "DualCLIPLoader",
                     "inputs": {"clip_name1": plan.models["clip_l"], "clip_name2": plan.models["llava"],
                                "type": "hunyuan_video"}},
            "vae": {"class_type": "VAELoader", "inputs": {"vae_name": plan.models["vae"]}},
            "shift": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["unet", 0], "shift": 7.0}},
            "pos": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt.positive, "clip": ["clip", 0]}},
            "guidance": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["pos", 0], "guidance": plan.cfg}},
            "guider": {"class_type": "BasicGuider", "inputs": {"model": ["shift", 0], "conditioning": ["guidance", 0]}},
            "latent": {"class_type": "EmptyHunyuanLatentVideo",
                       "inputs": {"width": plan.width, "height": plan.height, "length": plan.frames,
                                  "batch_size": 1}},
            "sched": {"class_type": "BasicScheduler",
                      "inputs": {"model": ["shift", 0], "scheduler": "simple", "steps": plan.steps, "denoise": 1.0}},
            "sampler": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
            "noise": {"class_type": "RandomNoise", "inputs": {"noise_seed": plan.seed}},
            "sample": {"class_type": "SamplerCustomAdvanced",
                       "inputs": {"noise": ["noise", 0], "guider": ["guider", 0], "sampler": ["sampler", 0],
                                  "sigmas": ["sched", 0], "latent_image": ["latent", 0]}},
            "decode": {"class_type": "VAEDecodeTiled",
                       "inputs": {"samples": ["sample", 0], "vae": ["vae", 0], "tile_size": 256, "overlap": 64,
                                  "temporal_size": 64, "temporal_overlap": 8}},
        }
        add_video_output(g, ["decode", 0], plan.fps, filename_prefix, nodes)
        return g
