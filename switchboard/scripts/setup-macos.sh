#!/usr/bin/env bash
# One-shot local setup for macOS (also works on Linux).
# Installs Node 22 via Homebrew if needed, installs dependencies, creates .env,
# runs the checks and builds the app.
set -euo pipefail
cd "$(dirname "$0")/.."

need_node=true
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -ge 20 ]; then need_node=false; fi
fi

if $need_node; then
  if [[ "$(uname)" == "Darwin" ]]; then
    if ! command -v brew >/dev/null 2>&1; then
      echo "Homebrew is required to install Node. Install it from https://brew.sh and re-run." >&2
      exit 1
    fi
    echo "→ Installing Node 22 with Homebrew"
    brew install node@22
    brew link --overwrite --force node@22
  else
    echo "Node.js >= 20 is required. Install it (e.g. nvm install 22) and re-run." >&2
    exit 1
  fi
fi

echo "→ Node $(node -v), npm $(npm -v)"
echo "→ Installing dependencies"
npm ci --no-audit --no-fund

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  echo "→ Created .env (permissions 600). Add at least one provider key before chatting."
else
  echo "→ .env already exists; leaving it untouched."
fi

mkdir -p data workspace

echo "→ Running typecheck, lint and tests"
npm run check

echo "→ Building"
npm run build

cat <<MSG

✔ Setup complete.

  Add keys:       open -e .env        (or any editor)
  Start (prod):   npm start           → http://localhost:3000
  Start (dev):    npm run dev
  Try offline:    ENABLE_MOCK_PROVIDER=true npm run dev

MSG
