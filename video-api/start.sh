#!/usr/bin/env bash
# Start the PCI Video API. Creates .venv and installs requirements on first run.
set -euo pipefail
cd "$(dirname "$0")"

pick_python() {
  for py in "${PYTHON:-}" python3.12 python3.13 python3.11 python3.10 python3; do
    [ -n "$py" ] || continue
    command -v "$py" >/dev/null 2>&1 || continue
    if "$py" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
      echo "$py"; return 0
    fi
  done
  return 1
}

if [ ! -x .venv/bin/python ]; then
  PY=$(pick_python) || { echo "Python 3.10+ required. On macOS: brew install python@3.12" >&2; exit 1; }
  echo "Creating .venv with $($PY --version)"
  "$PY" -m venv .venv
fi

# Reinstall only when requirements.txt changes.
if ! cmp -s requirements.txt .venv/.requirements.installed 2>/dev/null; then
  .venv/bin/pip install --quiet --upgrade pip
  .venv/bin/pip install --quiet -r requirements.txt
  cp requirements.txt .venv/.requirements.installed
fi

if [ -f .env ]; then set -a; . ./.env; set +a; fi

echo "PCI Video API on http://${PCI_HOST:-127.0.0.1}:${PCI_PORT:-8787}  (docs: /docs)"
exec .venv/bin/python -m pci_video
