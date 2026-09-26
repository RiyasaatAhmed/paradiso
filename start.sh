#!/bin/bash
# Starts Paradiso and prints the address to type into your TV browser.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "  ffmpeg is missing. Install it with:  brew install ffmpeg"
  exit 1
fi

# The server runs straight from TypeScript source, which needs a Node that can
# strip types on its own (24+). Without this the failure is a confusing
# "Cannot find module" rather than anything about versions.
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "  Node 24+ is required (found $(node -v)). Upgrade with:  brew upgrade node"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "  Installing dependencies…"
  npm install --silent
fi

# The browser half has to be compiled -- a TV cannot run TypeScript. Cheap
# enough to redo every launch, which keeps public/app from ever going stale.
echo "  Building the web app…"
npm run build --silent

# Keep the laptop awake while streaming -- a sleeping laptop stops the film.
if command -v caffeinate >/dev/null 2>&1; then
  exec caffeinate -i node src/main.ts
else
  exec node src/main.ts
fi
