#!/bin/bash
echo "Starting Constellation Sim..."
cd "$(dirname "$0")" || exit 1

PORT=5175
URL="http://localhost:${PORT}"

# Finder double-click gives a minimal PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [[ -f "$HOME/.zprofile" ]]; then source "$HOME/.zprofile"; fi
if [[ -f "$HOME/.zshrc" ]]; then source "$HOME/.zshrc"; fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Install Node.js from https://nodejs.org"
  read -r -p "Press Enter to close…"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "First run — installing dependencies…"
  npm install
fi

open_when_ready() {
  for _ in $(seq 1 40); do
    if curl -sf "$URL" >/dev/null 2>&1; then
      open "$URL"
      echo "Opened $URL"
      return 0
    fi
    sleep 0.25
  done
  echo "Open $URL manually once Vite finishes starting."
}

if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "Server already running."
  open "$URL"
  read -r -p "Press Enter to close…"
  exit 0
fi

echo "Press Ctrl+C here to stop the server."
open_when_ready &
npm run dev
