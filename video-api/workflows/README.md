# Custom workflows (bridge for an existing setup)

Every `*.json` file in this folder becomes an engine. Use this when you already
have a ComfyUI graph that works on your Mac (LTX-2, a custom-node LTX workflow,
a LoRA stack, anything):

1. In ComfyUI, open the working workflow and use **Export (API)**.
2. Save it here, e.g. `ltx2.json`. The engine name is the file name: `"engine": "ltx2"`.
3. Replace the literal values the API should control with placeholders:
   `{{PROMPT}}` `{{NEGATIVE_PROMPT}}` `{{SEED}}` `{{WIDTH}}` `{{HEIGHT}}`
   `{{FRAMES}}` `{{FPS}}` `{{STEPS}}` `{{CFG}}` `{{DURATION}}` `{{FILENAME_PREFIX}}`.
   A value that is exactly one placeholder gets a number where appropriate.
4. Optional: add a top-level `"_pci"` object with `label`, `fps`, `frame_multiple`,
   `dim_multiple`, `max_duration`, `steps`, `cfg` (see `smoke.json`).
5. Restart the API. `GET /pci/engines` should list it.

Naming a file after a built-in engine (`ltx.json`) replaces that engine's graph
but keeps its frame/resolution rules. Delete the file to go back.

`smoke.json` renders a plain amber clip with core nodes only: use it to prove
API → ComfyUI → mp4 works before downloading any model.
