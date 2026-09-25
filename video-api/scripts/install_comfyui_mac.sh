#!/usr/bin/env bash
# Install (or find) ComfyUI on an Apple Silicon Mac, with Metal (MPS) PyTorch.
#
#   scripts/install_comfyui_mac.sh              # find or install ComfyUI
#   scripts/install_comfyui_mac.sh --with-ltx   # ...and download LTX-Video 2B distilled (~16 GB)
#
# Env: COMFYUI_DIR (default ~/ComfyUI), PYTHON (default: newest python3.1x found)
set -euo pipefail

WITH_LTX=0
for arg in "$@"; do
  case "$arg" in
    --with-ltx) WITH_LTX=1 ;;
    -h|--help) sed -n 2,8p "$0"; exit 0 ;;
    *) echo "Unknown option $arg" >&2; exit 1 ;;
  esac
done

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }

# --- host checks -------------------------------------------------------------
if [ "$(uname -s)" != "Darwin" ]; then
  warn "This script targets macOS. On Linux, follow https://github.com/comfyanonymous/ComfyUI#installing"
fi
if [ "$(uname -s)" = "Darwin" ]; then
  if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
    warn "This shell runs under Rosetta (x86_64). Open a native arm64 Terminal, or PyTorch cannot use Metal."
  fi
  [ "$(uname -m)" = "arm64" ] || warn "Not Apple Silicon: no Metal acceleration; video generation will be CPU-only."
  MEM_GB=$(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 ))
  say "$(sysctl -n machdep.cpu.brand_string), ${MEM_GB} GB unified memory"
fi

# --- existing install? -------------------------------------------------------
# The ComfyUI Desktop app keeps its base folder in ~/Documents/ComfyUI and serves on port 8000.
for candidate in "${COMFYUI_DIR:-}" "$HOME/ComfyUI" "$HOME/Documents/ComfyUI" "$HOME/comfyui"; do
  [ -n "$candidate" ] || continue
  if [ -f "$candidate/main.py" ] || [ -d "$candidate/models/checkpoints" ]; then
    FOUND="$candidate"; break
  fi
done
if [ -d "/Applications/ComfyUI.app" ]; then
  say "ComfyUI Desktop app found. Launch it; the API will find it on http://127.0.0.1:8000."
fi

COMFYUI_DIR="${FOUND:-${COMFYUI_DIR:-$HOME/ComfyUI}}"

if [ -n "${FOUND:-}" ]; then
  say "Using existing ComfyUI at $COMFYUI_DIR"
else
  command -v git >/dev/null || { echo "git is required (xcode-select --install)" >&2; exit 1; }
  PY=""
  for py in "${PYTHON:-}" python3.12 python3.11 python3.13 python3.10; do
    [ -n "$py" ] && command -v "$py" >/dev/null 2>&1 && { PY="$py"; break; }
  done
  [ -n "$PY" ] || { echo "Python 3.10+ required: brew install python@3.12" >&2; exit 1; }
  say "Installing ComfyUI into $COMFYUI_DIR with $($PY --version)"
  git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git "$COMFYUI_DIR"
  "$PY" -m venv "$COMFYUI_DIR/.venv"
  # The default macOS arm64 wheels on PyPI include Metal (MPS) support; no CUDA index needed.
  "$COMFYUI_DIR/.venv/bin/pip" install --upgrade pip
  "$COMFYUI_DIR/.venv/bin/pip" install torch torchvision torchaudio
  "$COMFYUI_DIR/.venv/bin/pip" install -r "$COMFYUI_DIR/requirements.txt"
fi

if [ -x "$COMFYUI_DIR/.venv/bin/python" ]; then
  "$COMFYUI_DIR/.venv/bin/python" -c 'import torch; print("PyTorch", torch.__version__, "| MPS available:", torch.backends.mps.is_available())' \
    || warn "Could not import torch in $COMFYUI_DIR/.venv"
fi

# --- models ------------------------------------------------------------------
fetch() {  # fetch URL DEST  (resumable)
  if [ -s "$2" ]; then echo "  have $(basename "$2")"; return; fi
  mkdir -p "$(dirname "$2")"
  echo "  downloading $(basename "$2")"
  curl -fL --retry 3 -C - -o "$2.part" "$1" && mv "$2.part" "$2"
}

if [ "$WITH_LTX" = 1 ]; then
  say "Downloading LTX-Video 2B distilled + T5 text encoder (~16 GB)"
  fetch "https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltxv-2b-0.9.8-distilled.safetensors" \
        "$COMFYUI_DIR/models/checkpoints/ltxv-2b-0.9.8-distilled.safetensors"
  # fp16, not fp8: Metal has no float8 support.
  fetch "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors" \
        "$COMFYUI_DIR/models/text_encoders/t5xxl_fp16.safetensors"
fi

cat <<EOF

Done. Next:
  1. Start ComfyUI:      COMFYUI_DIR="$COMFYUI_DIR" $(cd "$(dirname "$0")" && pwd)/start_comfyui.sh
  2. Start the API:      $(cd "$(dirname "$0")/.." && pwd)/start.sh
  3. Check it:           curl -s localhost:8787/health
EOF
