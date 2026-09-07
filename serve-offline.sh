#!/usr/bin/env bash
# Quick local static server for offline / no-internet accreditation venues.
PORT="${1:-8000}"
echo "Starting BSESS Accreditation Evidence Portal on http://localhost:$PORT"
echo "Press Ctrl+C to stop."
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  python -m http.server "$PORT"
elif command -v npx >/dev/null 2>&1; then
  npx --yes serve -l "$PORT" .
else
  echo "No Python or Node/npx found. Install Python 3, or open index.html directly (see README)."
  exit 1
fi
