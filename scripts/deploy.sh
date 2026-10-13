#!/usr/bin/env bash
# ==============================================================================
# Meshwork Studio — Build locally, deploy live to EC2 (dist swap)
# ==============================================================================
# Use when you changed code and want it LIVE. Builds Node dist + Astro
# landing + Go auth binary on this machine, pushes all three to EC2,
# atomically swaps, restarts PM2. Static landing needs no restart.
# For reboot/start without rebuilding use ./scripts/start.sh instead.
#
# Usage:
#   ./scripts/deploy.sh               # build everything & deploy live
#   ./scripts/deploy.sh --skip-build  # push existing local dist (no rebuild)
#   ./scripts/deploy.sh --skip-auth   # skip Go auth build/upload
#   ./scripts/deploy.sh --help        # this help
#
# Env: MESHWORK_EC2_INSTANCE_ID, MESHWORK_DOMAIN, MESHWORK_SSH_USER (ubuntu),
#      MESHWORK_SSH_KEY, AWS_REGION (us-east-1), REMOTE_APP_DIR (override).
# ==============================================================================
set -euo pipefail

# Resolve symlinks so global installs (~/.local/bin/meshwork-deploy) still
# find the repo. Works with bash on Linux/macOS.
_SOURCE="${BASH_SOURCE[0]}"
while [[ -L "$_SOURCE" ]]; do
  _DIR="$(cd -P "$(dirname "$_SOURCE")" && pwd)"
  _SOURCE="$(readlink "$_SOURCE")"
  [[ "$_SOURCE" != /* ]] && _SOURCE="$_DIR/$_SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$_SOURCE")" && pwd)"
unset _SOURCE _DIR
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/ec2-common.sh
source "$SCRIPT_DIR/lib/ec2-common.sh"

SKIP_BUILD=false
SKIP_AUTH=false
for arg in "$@"; do
  case "$arg" in
    --skip-build|-s) SKIP_BUILD=true ;;
    --skip-auth|-a) SKIP_AUTH=true ;;
    --help|-h)
      sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

tui_banner "🚀 Meshwork — Build & Deploy LIVE to EC2"

# ── [1/5] Local build ───────────────────────────────────────────────────────
tui_step "1/5" "Local production build..."
tui_bar 0 5 24; echo ""
if [[ "$SKIP_BUILD" == false ]]; then
  cd "$REPO_DIR"
  npm run build
  tui_ok "Local build complete."
else
  tui_warn "Skipping build (--skip-build). Using existing dist/."
fi
if [[ ! -d "$REPO_DIR/dist" || ! -f "$REPO_DIR/dist/index.cjs" ]]; then
  tui_fail "dist/ or dist/index.cjs missing. Run without --skip-build."
  exit 1
fi
tui_ok "Bundle: dist/index.cjs ($(du -sh "$REPO_DIR/dist" | cut -f1))"
tui_bar 1 5 24; echo ""

# ── [1b] Landing page (Astro static) ──────────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
  tui_step "1b/5" "Building landing page (Astro static)..."
  if [[ ! -d "$REPO_DIR/landing/node_modules" ]]; then
    tui_info "Installing landing dependencies (first run)..."
    if [[ -f "$REPO_DIR/landing/package-lock.json" ]]; then
      (cd "$REPO_DIR/landing" && npm ci --no-audit --no-fund)
    else
      (cd "$REPO_DIR/landing" && npm install --no-audit --no-fund)
    fi
  fi
  (cd "$REPO_DIR/landing" && npm run build)
  tui_ok "Landing: landing/dist ($(du -sh "$REPO_DIR/landing/dist" | cut -f1))"
else
  tui_warn "Skipping landing build (--skip-build). Using existing landing/dist/."
fi
if [[ ! -f "$REPO_DIR/landing/dist/index.html" ]]; then
  tui_fail "landing/dist/index.html missing. Run without --skip-build."
  exit 1
fi

# ── [1c] Go auth binary ─────────────────────────────────────────────────────
AUTH_BIN="$REPO_DIR/server/services/auth/meshwork-auth"
if [[ "$SKIP_AUTH" == false ]]; then
  tui_step "1c/5" "Building Go auth service (linux/amd64)..."
  command -v go &>/dev/null || {
    tui_fail "Go toolchain missing. Install Go ≥1.26 or pass --skip-auth."
    exit 1
  }
  (cd "$REPO_DIR/server/services/auth" && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o meshwork-auth ./cmd/server) &
  tui_spin $! "Compiling Go auth..."
  wait $!
  tui_ok "Auth binary: server/services/auth/meshwork-auth"
else
  tui_warn "Skipping auth build (--skip-auth)."
fi

# ── [2/5] EC2 connection ────────────────────────────────────────────────────
tui_step "2/5" "Connecting to EC2..."
SSH_KEY="$(ec2_find_key "$REPO_DIR")" || {
  tui_fail "SSH key not found. Set MESHWORK_SSH_KEY=/path/to/key.pem"
  exit 1
}
tui_ok "SSH key: $SSH_KEY"
ec2_ensure_running
HOST_TARGET="$(ec2_resolve_host)"
if [[ -z "$HOST_TARGET" ]]; then
  ec2_explain_target missing
  exit 1
fi
HOST_TARGET="$(ec2_wait_ssh "$SSH_KEY" "$SSH_USER" "$HOST_TARGET" 30)" || {
  ec2_explain_target "$HOST_TARGET"
  exit 1
}
# tail -1: remote login banners (MOTD) must never become the directory.
REMOTE_APP_DIR="$(REMOTE_APP_DIR="${REMOTE_APP_DIR:-}" ec2_remote_dir "$SSH_KEY" "$SSH_USER" "$HOST_TARGET" | tail -n 1)"
tui_ok "Remote app dir: $REMOTE_APP_DIR"
tui_bar 2 5 24; echo ""

# Stale-dist guard: warn if remote dist is newer than local.
LOCAL_MTIME=$(stat -c %Y "$REPO_DIR/dist/index.cjs" 2>/dev/null || stat -f %m "$REPO_DIR/dist/index.cjs")
REMOTE_MTIME=$(ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET" \
  "stat -c %Y '$REMOTE_APP_DIR/dist/index.cjs' 2>/dev/null || stat -f %m '$REMOTE_APP_DIR/dist/index.cjs' 2>/dev/null || echo 0")
if [[ "$REMOTE_MTIME" -gt "$LOCAL_MTIME" ]]; then
  tui_warn "Remote dist is NEWER than local. Pushing would roll back live."
  tui_warn "Local: $(date -d @"$LOCAL_MTIME" 2>/dev/null || date -r "$LOCAL_MTIME") | Remote: $(date -d @"$REMOTE_MTIME" 2>/dev/null || echo "$REMOTE_MTIME")"
  read -r -p "  Push anyway? [y/N] " yn
  [[ "$yn" == "y" || "$yn" == "Y" ]] || { tui_info "Aborted. Rebuild first."; exit 1; }
fi

# ── [3/5] Upload ────────────────────────────────────────────────────────────
tui_step "3/5" "Uploading dist bundle..."
ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET" "mkdir -p '$REMOTE_APP_DIR/dist.new'"
if command -v rsync &>/dev/null; then
  rsync -avz --delete --info=progress2 \
    -e "ssh -i '$SSH_KEY' -o StrictHostKeyChecking=accept-new" \
    "$REPO_DIR/dist/" "$SSH_USER@$HOST_TARGET:$REMOTE_APP_DIR/dist.new/" \
    | stdbuf -o0 tr '\r' '\n' | tail -3
else
  tui_info "rsync missing — tar-stream fallback..."
  tar -czf - -C "$REPO_DIR/dist" . \
    | ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET" "tar -xzf - -C '$REMOTE_APP_DIR/dist.new'"
fi
tui_ok "Dist upload complete."

tui_step "3c/5" "Uploading landing page (static)..."
ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET" "mkdir -p '$REMOTE_APP_DIR/landing.new'"
if command -v rsync &>/dev/null; then
  rsync -avz --delete --info=progress2 \
    -e "ssh -i '$SSH_KEY' -o StrictHostKeyChecking=accept-new" \
    "$REPO_DIR/landing/dist/" "$SSH_USER@$HOST_TARGET:$REMOTE_APP_DIR/landing.new/" \
    | stdbuf -o0 tr '\r' '\n' | tail -3
else
  tar -czf - -C "$REPO_DIR/landing/dist" . \
    | ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET" "tar -xzf - -C '$REMOTE_APP_DIR/landing.new'"
fi
tui_ok "Landing upload complete."
tui_bar 3 5 24; echo ""

if [[ "$SKIP_AUTH" == false && -f "$AUTH_BIN" ]]; then
  tui_step "3b/5" "Uploading Go auth binary..."
  ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET" "mkdir -p '$REMOTE_APP_DIR/auth.staging'"
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
    "$AUTH_BIN" "$SSH_USER@$HOST_TARGET:$REMOTE_APP_DIR/auth.staging/meshwork-auth.new"
  tui_ok "Auth binary uploaded."
fi

# ── [4/5] Atomic swap + restart ─────────────────────────────────────────────
tui_step "4/5" "Swapping live + restarting PM2..."
ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET" SKIP_AUTH="$SKIP_AUTH" bash -s "$REMOTE_APP_DIR" <<'REMOTE_SCRIPT'
  set -euo pipefail
  TARGET_DIR="$1"
  if [ -d "$TARGET_DIR/dist" ]; then
    rm -rf "$TARGET_DIR/dist.old" 2>/dev/null || true
    mv "$TARGET_DIR/dist" "$TARGET_DIR/dist.old"
  fi
  mv "$TARGET_DIR/dist.new" "$TARGET_DIR/dist"

  # Landing page (Astro static, no restart needed — nginx reads the files).
  if [ -d "$TARGET_DIR/landing.new" ]; then
    rm -rf "$TARGET_DIR/landing.old" 2>/dev/null || true
    if [ -d "$TARGET_DIR/landing" ]; then
      mv "$TARGET_DIR/landing" "$TARGET_DIR/landing.old"
    fi
    mv "$TARGET_DIR/landing.new" "$TARGET_DIR/landing"
  fi

  set -a; [ -f "$TARGET_DIR/.env" ] && . "$TARGET_DIR/.env"; set +a
  echo "  ⚡ Restarting PM2 meshwork..."
  pm2 delete meshwork >/dev/null 2>&1 || true
  pm2 start "$TARGET_DIR/dist/index.cjs" --name meshwork --cwd "$TARGET_DIR" >/dev/null

  if [ "${SKIP_AUTH:-false}" != "true" ] && [ -f "$TARGET_DIR/auth.staging/meshwork-auth.new" ]; then
    chmod +x "$TARGET_DIR/auth.staging/meshwork-auth.new"
    [ -f "$TARGET_DIR/meshwork-auth" ] && mv "$TARGET_DIR/meshwork-auth" "$TARGET_DIR/meshwork-auth.old"
    mv "$TARGET_DIR/auth.staging/meshwork-auth.new" "$TARGET_DIR/meshwork-auth"
    rmdir "$TARGET_DIR/auth.staging" 2>/dev/null || true
    echo "  ⚡ Restarting PM2 meshwork-auth..."
    pm2 delete meshwork-auth >/dev/null 2>&1 || true
    pm2 start "$TARGET_DIR/meshwork-auth" --name meshwork-auth --cwd "$TARGET_DIR" >/dev/null
  fi
  pm2 save >/dev/null 2>&1 || true
  if systemctl is-active --quiet nginx; then
    sudo systemctl reload nginx 2>/dev/null || true
  fi
REMOTE_SCRIPT
tui_ok "Swap + restart done."
tui_bar 4 5 24; echo ""

# ── [5/5] Health ────────────────────────────────────────────────────────────
tui_step "5/5" "Verifying health..."
sleep 2
HEALTH_STATUS=$(ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET" \
  "curl -sf http://localhost:5000/health 2>/dev/null || curl -sf http://localhost/health 2>/dev/null || echo UNKNOWN")
AUTH_HEALTH="skipped"
if [[ "$SKIP_AUTH" == false ]]; then
  AUTH_HEALTH=$(ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET" \
    "curl -sf http://127.0.0.1:8081/healthz 2>/dev/null || echo UNAVAILABLE")
fi
tui_bar 5 5 24; echo ""

echo ""
tui_banner "🎉 Deployment complete!"
echo -e "  🌐 Live App:     ${TUI_BOLD}https://${MESHWORK_DOMAIN:-$HOST_TARGET}${TUI_NC}"
echo -e "  📡 Target Host:  $HOST_TARGET"
echo -e "  📊 Monolith:     $HEALTH_STATUS"
echo -e "  🔐 Auth Service: $AUTH_HEALTH"
echo -e "  🕒 Deployed At:  $(date)"
echo ""
