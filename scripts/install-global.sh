#!/usr/bin/env bash
# Meshwork Studio — install start/deploy as global commands.
# Creates symlinks so you can run them from ANY directory:
#   meshwork-start [options]    (same as ./scripts/start.sh)
#   meshwork-deploy [options]   (same as ./scripts/deploy.sh)
#
# Usage:
#   ./scripts/install-global.sh                  # install to ~/.local/bin
#   GLOBAL_BIN_DIR=/usr/local/bin ./scripts/install-global.sh
#   ./scripts/install-global.sh --uninstall      # remove the symlinks
#
# The scripts find the repo from their own location, so the symlinks keep
# working no matter where you call them from.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${GLOBAL_BIN_DIR:-$HOME/.local/bin}"

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$BIN_DIR/meshwork-start" "$BIN_DIR/meshwork-deploy"
  echo "Removed meshwork-start + meshwork-deploy from $BIN_DIR"
  exit 0
fi

mkdir -p "$BIN_DIR"
ln -sf "$SCRIPT_DIR/start.sh" "$BIN_DIR/meshwork-start"
ln -sf "$SCRIPT_DIR/deploy.sh" "$BIN_DIR/meshwork-deploy"
chmod +x "$SCRIPT_DIR/start.sh" "$SCRIPT_DIR/deploy.sh"

echo "Installed:"
echo "  meshwork-start  -> $SCRIPT_DIR/start.sh"
echo "  meshwork-deploy -> $SCRIPT_DIR/deploy.sh"
echo ""
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo "NOTE: $BIN_DIR is not on your PATH. Add this to ~/.bashrc:"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
else
  echo "$BIN_DIR is on your PATH — try: meshwork-start --help"
fi
