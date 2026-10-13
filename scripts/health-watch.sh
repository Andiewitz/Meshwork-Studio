#!/usr/bin/env bash
# Meshwork Studio — on-box health watch (runs via cron, NOT a deploy step).
# Checks the monolith + auth service, restarts a dead PM2 process ONCE per
# incident (state file prevents restart loops), and logs everything with
# timestamps for joining to request logs.
#
# Install on EC2 (ubuntu user):
#   crontab -e   →   */5 * * * * /home/ubuntu/meshwork-studiov2/scripts/health-watch.sh >> /home/ubuntu/health-watch.log 2>&1
#
# NOTE: no email alerts yet — prod SMTP is broken (530 auth errors in logs).
# Fix SMTP creds first, then add a mail step on state transitions.
set -uo pipefail

APP_DIR="${REMOTE_APP_DIR:-/home/ubuntu/meshwork-studiov2}"
STATE_DIR="${STATE_DIR:-/tmp/meshwork-health}"
mkdir -p "$STATE_DIR"

stamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

check() { # check <name> <url>
  local code
  code=$(curl -s -m 8 -o /dev/null -w "%{http_code}" "$2" 2>/dev/null || true)
  code="${code:-000}"
  if [ "$code" = "200" ]; then
    rm -f "$STATE_DIR/$1.down"
    return 0
  fi
  echo "$(stamp) CHECK-FAIL $1 -> $2 returned $code"
  if [ ! -f "$STATE_DIR/$1.down" ]; then
    echo "$(stamp) RESTARTING pm2:$1 (first failure this incident)"
    pm2 restart "$1" >/dev/null 2>&1 || true
    sleep 5
    code=$(curl -s -m 8 -o /dev/null -w "%{http_code}" "$2" 2>/dev/null || true)
  code="${code:-000}"
    if [ "$code" = "200" ]; then
      echo "$(stamp) RECOVERED $1 after restart"
      return 0
    fi
    touch "$STATE_DIR/$1.down"
  fi
  echo "$(stamp) STILL-DOWN $1 (already restarted once; needs a human — see docs/operations/OBSERVABILITY.md)"
  return 1
}

cd "$APP_DIR" 2>/dev/null || true
fail=0
check meshwork "http://127.0.0.1:5000/health" || fail=1
check meshwork-auth "http://127.0.0.1:8081/healthz" || fail=1
exit "$fail"
