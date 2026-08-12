#!/bin/bash
# Launch the constellation sim dev server and open the browser.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=5175
URL="http://localhost:${PORT}"

# Double-clicked .command files get a minimal PATH — load the user's shell setup.
if [[ -f "$HOME/.zprofile" ]]; then
  # shellcheck disable=SC1090
  source "$HOME/.zprofile"
fi
if [[ -f "$HOME/.zshrc" ]]; then
  # shellcheck disable=SC1090
  source "$HOME/.zshrc"
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Install Node.js or add it to your PATH."
  read -r -p "Press Enter to close…"
  exit 1
fi

cd "$PROJECT_DIR"

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies (first run)…"
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
  echo "Server did not respond on $URL — open it manually once Vite is ready."
}

if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "Dev server already running on port $PORT."
  open "$URL"
  echo "Opened $URL"
  read -r -p "Press Enter to close…"
  exit 0
fi

echo "Starting dev server on $URL …"
echo "Press Ctrl+C in this window to stop the server."
open_when_ready &
npm run dev
