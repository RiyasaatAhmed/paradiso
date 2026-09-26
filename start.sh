#!/bin/bash
# Starts Paradiso and prints the address to type into your TV browser.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "  ffmpeg is missing. Install it with:"
  echo "    macOS:   brew install ffmpeg"
  echo "    Debian:  sudo apt install ffmpeg"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "  Node is missing. Install Node 24 or newer from https://nodejs.org"
  exit 1
fi

# The server runs straight from TypeScript source, which needs a Node that can
# strip types on its own (24+). Without this the failure is a confusing
# "Cannot find module" rather than anything about versions.
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "  Node 24+ is required (found $(node -v)). See https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "  Installing dependencies…"
  npm install --silent
fi

# First run on a new machine: give it a config to edit rather than an error.
if [ ! -f config.json ]; then
  cp config.example.json config.json
  echo ""
  echo "  Created config.json for you."
  echo "  It scans ~/Movies and ~/Downloads — edit 'libraries' if your films"
  echo "  live somewhere else, then run this again."
  echo ""
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
