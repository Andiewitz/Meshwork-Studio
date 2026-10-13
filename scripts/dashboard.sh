#!/usr/bin/env bash
# Meshwork Studio — open the metrics dashboard on localhost.
# The dashboard is admin-gated (no backdoors): log in with an admin account,
# which you get by setting BOOTSTRAP_ADMIN_EMAILS in .env before booting.
#
# Usage:
#   npm run dashboard          # checks the dev server, prints the URL, opens it
#   ./scripts/dashboard.sh --no-open
set -euo pipefail

PORT="${PORT:-5000}"
URL="http://localhost:${PORT}/admin"

if ! curl -sf "http://localhost:${PORT}/ready" -o /dev/null 2>/dev/null; then
  echo "Dev server isn't up. Start it first with: npm run dev"
  echo "(needs postgres/redis running — docker compose up -d)"
  exit 1
fi
echo "Dashboard: $URL"
echo "Log in as admin first (BOOTSTRAP_ADMIN_EMAILS in .env promotes you at boot)."

if [[ "${1:-}" != "--no-open" ]]; then
  (xdg-open "$URL" 2>/dev/null || open "$URL" 2>/dev/null || true) &
fi
