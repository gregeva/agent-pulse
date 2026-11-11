#!/usr/bin/env bash
# Set up agent-pulse on macOS/Linux: Python venv + Playwright.
# Usage: ./setup.sh [--with-chromium]   (--with-chromium only needed when Google Chrome isn't installed)
set -euo pipefail
cd "$(dirname "$0")"

WITH_CHROMIUM=0
[[ "${1:-}" == "--with-chromium" ]] && WITH_CHROMIUM=1

PYTHON="$(command -v python3 || command -v python || true)"
[[ -z "$PYTHON" ]] && { echo "Python 3.11+ not found." >&2; exit 1; }
"$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' \
  || { echo "Python 3.11+ required; found: $("$PYTHON" --version)" >&2; exit 1; }

[[ -d .venv ]] || "$PYTHON" -m venv .venv
VENV_PY=.venv/bin/python
[[ -x "$VENV_PY" ]] || VENV_PY=.venv/Scripts/python.exe   # Git Bash on Windows

"$VENV_PY" -m pip install --upgrade pip --quiet
"$VENV_PY" -m pip install -r requirements.txt

if [[ $WITH_CHROMIUM -eq 1 ]]; then
  "$VENV_PY" -m playwright install --with-deps chromium
elif ! command -v google-chrome >/dev/null && ! command -v google-chrome-stable >/dev/null \
     && [[ ! -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  echo "WARNING: Google Chrome not found. Install it, set AGENT_PULSE_CHROME, or re-run with --with-chromium." >&2
fi

echo
echo "Setup complete. Next: $VENV_PY -m agent_pulse browser"
