#!/usr/bin/env bash
# Find LTX / Wan / Hunyuan / T5 model files already on this Mac (e.g. from an
# earlier LTX setup) and print an extra_model_paths.yaml snippet so ComfyUI can
# use them in place, without copying multi-GB files.
set -euo pipefail
ROOTS=("$@")
[ ${#ROOTS[@]} -gt 0 ] || ROOTS=("$HOME")

echo "Searching ${ROOTS[*]} for video model files (this can take a minute)..."
RESULTS=$(find "${ROOTS[@]}" -maxdepth 7 -type f \
  \( -iname '*ltx*.safetensors' -o -iname 't5xxl*.safetensors' -o -iname 'wan2*.safetensors' \
     -o -iname 'umt5*.safetensors' -o -iname 'hunyuan_video*.safetensors' \) \
  -not -path '*/.Trash/*' -not -path '*/Library/Caches/*' 2>/dev/null | sort || true)

if [ -z "$RESULTS" ]; then
  echo "Nothing found. Download models with: scripts/install_comfyui_mac.sh --with-ltx"
  exit 0
fi

echo "$RESULTS" | while read -r f; do printf '  %6s  %s\n' "$(du -h "$f" | cut -f1)" "$f"; done

echo
echo "If these are outside ComfyUI/models, add this to ComfyUI/extra_model_paths.yaml and restart ComfyUI:"
echo
echo "pci_existing:"
echo "$RESULTS" | while read -r f; do
  dir=$(dirname "$f"); name=$(basename "$f" | tr 'A-Z' 'a-z')
  case "$name" in
    t5xxl*|umt5*) echo "    text_encoders: $dir" ;;
    wan2*|hunyuan_video_t2v*) echo "    diffusion_models: $dir" ;;
    *vae*) echo "    vae: $dir" ;;
    *) echo "    checkpoints: $dir" ;;
  esac
done | sort -u
echo
echo "Or point the API at a specific file name (as ComfyUI lists it): PCI_LTX_CHECKPOINT=<name> in .env"
