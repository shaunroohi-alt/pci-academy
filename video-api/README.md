# PCI Video API

A small local FastAPI service that turns `POST /pci/video` into a ComfyUI
render and saves the result under a predictable name. Built for an Apple
Silicon MacBook Pro: it detects the Mac, assumes Metal (MPS) rather than CUDA,
and defaults to settings that fit in unified memory.

```
client ──POST /pci/video──▶ PCI Video API ──/prompt──▶ ComfyUI (MPS) ──▶ mp4
         GET /pci/jobs/{id}   (templating,   ◀─/history─              │
         GET …/video           naming, jobs)  ◀──/view──────────────────┘
                                   │
                                   └──▶ ~/Movies/PCI-Academy/<concept>/<name>__<engine>__s<seed>__<hash>.mp4
```

## Quick start (macOS)

```bash
cd video-api

# 1. ComfyUI: finds an existing install (git or ComfyUI Desktop), or installs one.
#    --with-ltx downloads LTX-Video 2B distilled + T5 fp16 (~16 GB).
scripts/install_comfyui_mac.sh --with-ltx

# Already have LTX files somewhere? Find them instead of re-downloading:
scripts/find_models.sh

# 2. Start ComfyUI (skip if you use the ComfyUI Desktop app; the API finds it on :8000)
scripts/start_comfyui.sh

# 3. Start the API (new terminal). Creates .venv on first run.
./start.sh            # http://127.0.0.1:8787, interactive docs at /docs
```

Check it:

```bash
curl -s localhost:8787/health | python3 -m json.tool
curl -s localhost:8787/pci/engines | python3 -m json.tool   # which models ComfyUI actually has
```

Prove the pipeline before you download any models (renders a plain amber clip
with core ComfyUI nodes in about a second):

```bash
curl -s -X POST localhost:8787/pci/video -H 'Content-Type: application/json' \
  -d '{"engine":"smoke","prompt":"pipeline check","duration":2}'
```

## Generate a video

```bash
curl -s -X POST http://127.0.0.1:8787/pci/video \
  -H 'Content-Type: application/json' \
  -d '{
        "engine": "ltx",
        "concept": "arrival",
        "prompt": "A woman opens the kitchen curtains at dawn and sits down with a notebook",
        "duration": 4,
        "aspect_ratio": "9:16",
        "seed": 42,
        "output_name": "arrival-teaser"
      }'
# → 202 {"id": "3f9c…", "status": "queued", "output_path": "…/arrival/arrival-teaser__ltx__s42__….mp4", …}

curl -s http://127.0.0.1:8787/pci/jobs/3f9c…              # queued → running → completed | failed
curl -s -o teaser.mp4 http://127.0.0.1:8787/pci/jobs/3f9c…/video
```

Sending the exact same request again returns the existing job and file (HTTP
200) instead of rendering again. Pass `"overwrite": true` to force a re-render.

### Request fields (`POST /pci/video`)

| field | default | notes |
|---|---|---|
| `prompt` | required | What happens, in plain words. Lead with the main action. |
| `engine` | `ltx` | `ltx`, `wan`, `hunyuan`, or any `workflows/*.json` name (`smoke`, …) |
| `model` | `auto` | Engine variant (see `/pci/engines`). `auto` = best installed variant that fits in memory |
| `concept` | `general` | PCI concept, see `/pci/concepts`: `arrival`, `attention`, `expression`, `judgement`, `conversation`, `rest`, `integration`, `practice`, `brand`, `general` |
| `duration` | `4` | Seconds. Rounded to the engine's frame grid (LTX: 8k+1 frames @ 24 fps; max 10 s) |
| `aspect_ratio` | `16:9` | `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| `quality` | by memory | `draft` (~768×448) or `standard` (~1024×576). Macs under 40 GB default to `draft` |
| `seed` | derived | Omit for a seed derived from engine + concept + prompt (so reruns match) |
| `output_name` | from prompt | Human part of the filename |
| `negative_prompt` | — | Added to the PCI default negative prompt |
| `fps`, `steps`, `cfg` | per model | Overrides |
| `raw_prompt` | `false` | Skip PCI templating and send `prompt` as-is |
| `overwrite` | `false` | Re-render even if the file exists |
| `dry_run` | `false` | Return the plan, final prompt and ComfyUI graph without rendering |

### Endpoints

| method | path | |
|---|---|---|
| GET | `/health` | Host (chip, memory, MPS/Rosetta), ComfyUI reachability + device, job counts. 503 if ComfyUI is down |
| GET | `/pci/engines` | Engines, model variants, which files are installed and what is missing |
| GET | `/pci/concepts` | PCI concepts and the house style |
| POST | `/pci/video` | Create a job (202), or return the existing one (200) |
| GET | `/pci/jobs?status=&limit=` | Recent jobs |
| GET | `/pci/jobs/{id}` | Job status, plan, final prompt, output path, error |
| GET | `/pci/jobs/{id}/video` | The file |
| POST | `/pci/jobs/{id}/cancel` | Remove from ComfyUI's queue, or interrupt if running |

## How it fits together

- **Engines** (`pci_video/engines/`): each engine declares its model files,
  frame/resolution rules and a ComfyUI graph builder. `ltx` is the default and
  uses only core ComfyUI nodes. `wan` (2.1) and `hunyuan` are registered as
  *experimental*: the graphs pass ComfyUI validation, but they are slow on a
  Mac and Hunyuan needs 64 GB+. Add an engine by subclassing `Engine` and
  listing it in `engines/__init__.py`.
- **Model selection**: the API asks ComfyUI (`/object_info`) which files it
  has and matches them against each variant's filename patterns. LTX
  preference: `2b-distilled` → `2b` → `13b-distilled` (32 GB+) → `13b` (64 GB+).
  fp8 files are ranked last because Metal cannot compute in float8. Pin a file
  with `PCI_LTX_CHECKPOINT` / `PCI_LTX_TEXT_ENCODER`.
- **Existing setups** (`workflows/`): export any working ComfyUI graph with
  *Export (API)*, drop it in `workflows/`, swap values for `{{PROMPT}}`,
  `{{SEED}}`, `{{FRAMES}}` etc., and it becomes an engine. This is the route for
  LTX-2 or custom-node workflows. See `workflows/README.md`.
- **Prompt templating** (`pci_video/prompts.py`): the user prompt comes first,
  then the concept's scene and camera, then the PCI house style (calm,
  editorial, warm neutrals with an amber accent) plus a default negative prompt.
- **Output**: `<PCI_OUTPUT_DIR>/<concept>/<name>__<engine>__s<seed>__<hash>.mp4`,
  with a `.json` sidecar holding the request, final prompt, plan and exact
  ComfyUI graph. The hash covers every render-affecting parameter.
- **Jobs**: persisted to `<PCI_OUTPUT_DIR>/.jobs/`; unfinished jobs re-attach to
  ComfyUI after an API restart.
- **Video saving**: uses core `CreateVideo`/`SaveVideo` (mp4/h264); falls back to
  VideoHelperSuite or animated WebP on older ComfyUI builds.

## Configuration

Copy `.env.example` to `.env`. Useful ones: `PCI_PORT` (8787),
`PCI_COMFYUI_URL` (default tries :8188 then :8000), `PCI_OUTPUT_DIR` (default
`~/Movies/PCI-Academy`), `PCI_BACKEND=mock` (no ComfyUI; for tests).

## Expectations on a Mac

LTX-Video 2B distilled at draft quality is the realistic starting point on a
16–36 GB M-series MacBook Pro: a 4-second clip is minutes, not seconds, and the
first run is slower while models load. Keep ComfyUI's device on `mps`
(`/health` warns if it is not). If ComfyUI crashes with out-of-memory, shorten
the clip or stay on `draft`.

## Tests

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
```
