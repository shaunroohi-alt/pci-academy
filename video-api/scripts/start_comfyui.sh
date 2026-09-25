#!/usr/bin/env bash
# Start a git-installed ComfyUI for the PCI Video API (not needed if you use the ComfyUI Desktop app).
set -euo pipefail
COMFYUI_DIR="${COMFYUI_DIR:-$HOME/ComfyUI}"
[ -f "$COMFYUI_DIR/main.py" ] || { echo "No ComfyUI at $COMFYUI_DIR (run scripts/install_comfyui_mac.sh)" >&2; exit 1; }
PY="$COMFYUI_DIR/.venv/bin/python"
[ -x "$PY" ] || PY=python3
cd "$COMFYUI_DIR"
# Let ops Metal lacks fall back to CPU instead of crashing.
export PYTORCH_ENABLE_MPS_FALLBACK=1
exec "$PY" main.py --listen 127.0.0.1 --port "${COMFYUI_PORT:-8188}" "$@"
