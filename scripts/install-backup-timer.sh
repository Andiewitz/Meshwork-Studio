#!/usr/bin/env bash
# Install the reviewed backup timer on the documented Ubuntu EC2 host.
# It intentionally does not create buckets, grant IAM permissions, or run a
# backup: validate those prerequisites first, then inspect the first run.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE="$REPO_DIR/deploy/systemd/meshwork-backup.service"
TIMER="$REPO_DIR/deploy/systemd/meshwork-backup.timer"

if [[ ! -f "$SERVICE" || ! -f "$TIMER" ]]; then
  echo "Backup systemd templates are missing from $REPO_DIR/deploy/systemd" >&2
  exit 1
fi

if [[ "$(id -un)" != "ubuntu" ]]; then
  echo "Run as the ubuntu application owner so the documented service paths remain correct." >&2
  exit 1
fi

sudo install -o root -g root -m 0644 "$SERVICE" /etc/systemd/system/meshwork-backup.service
sudo install -o root -g root -m 0644 "$TIMER" /etc/systemd/system/meshwork-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now meshwork-backup.timer
sudo systemctl list-timers meshwork-backup.timer --all

echo "Timer installed. Before relying on it, run: sudo systemctl start meshwork-backup.service"
echo "Then inspect: journalctl -u meshwork-backup.service -n 100 --no-pager"
