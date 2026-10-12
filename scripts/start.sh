#!/usr/bin/env bash
# ==============================================================================
# Meshwork Studio — Start EC2 from current dist (no build)
# ==============================================================================
# Manual use: EC2 rebooted, services down, or push the LAST local build
# without rebuilding. For fresh code changes use ./scripts/deploy.sh.
#
# Usage:
#   ./scripts/start.sh            # push current dist/, start everything, check health
#   ./scripts/start.sh --no-push  # start remote services only (no upload)
#   ./scripts/start.sh --ssh/-s   # ...then open an interactive SSH shell
#   ./scripts/start.sh --help     # this help
#
# Env: MESHWORK_EC2_INSTANCE_ID, MESHWORK_DOMAIN, MESHWORK_SSH_USER (ubuntu),
#      MESHWORK_SSH_KEY, AWS_REGION (us-east-1), REMOTE_APP_DIR (override).
# ==============================================================================
set -euo pipefail

# Resolve symlinks so global installs (~/.local/bin/meshwork-start) still
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

NO_PUSH=false
WANT_SSH=false
for arg in "$@"; do
  case "$arg" in
    --no-push) NO_PUSH=true ;;
    --ssh|-s) WANT_SSH=true ;;
    --help|-h)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

tui_banner "🔌 Meshwork — Start EC2 (current dist, no build)"

# ── [1/5] Local dist check ──────────────────────────────────────────────────
tui_step "1/5" "Checking current local dist..."
if [[ "$NO_PUSH" == false ]]; then
  if [[ ! -d "$REPO_DIR/dist" || ! -f "$REPO_DIR/dist/index.cjs" ]]; then
    tui_fail "Local dist/ or dist/index.cjs missing."
    tui_info "Run ./scripts/deploy.sh first to build, or use --no-push to skip upload."
    exit 1
  fi
  tui_ok "Found dist/index.cjs ($(du -sh "$REPO_DIR/dist" | cut -f1))"
else
  tui_info "--no-push: skipping dist upload, starting remote services only."
fi

# ── [2/5] EC2 power + SSH ───────────────────────────────────────────────────
tui_step "2/5" "Waking EC2 + connecting..."
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
  if [[ -n "${MESHWORK_DOMAIN:-}" && "$HOST_TARGET" != "${MESHWORK_DOMAIN}" ]]; then
    tui_warn "Retrying via domain ${MESHWORK_DOMAIN}..."
    HOST_TARGET="$(ec2_wait_ssh "$SSH_KEY" "$SSH_USER" "${MESHWORK_DOMAIN}" 10)" || {
      ec2_explain_target "${MESHWORK_DOMAIN}"
      exit 1
    }
  else
    ec2_explain_target "$HOST_TARGET"
    exit 1
  fi
}
REMOTE_APP_DIR="$(REMOTE_APP_DIR="${REMOTE_APP_DIR:-}" ec2_remote_dir "$SSH_KEY" "$SSH_USER" "$HOST_TARGET")"
tui_ok "Remote app dir: $REMOTE_APP_DIR"

# ── [3/5] Push current dist (no build) ──────────────────────────────────────
if [[ "$NO_PUSH" == false ]]; then
  tui_step "3/5" "Pushing current dist/ (no build)..."
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
  tui_ok "Upload complete."
  ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET" bash -s "$REMOTE_APP_DIR" <<'REMOTE_SWAP'
    set -euo pipefail
    TARGET_DIR="$1"
    if [ -d "$TARGET_DIR/dist" ]; then
      rm -rf "$TARGET_DIR/dist.old" 2>/dev/null || true
      mv "$TARGET_DIR/dist" "$TARGET_DIR/dist.old"
    fi
    mv "$TARGET_DIR/dist.new" "$TARGET_DIR/dist"
REMOTE_SWAP
  tui_ok "Swapped dist.new → dist (old kept as dist.old)."
else
  tui_step "3/5" "Skipped dist push (--no-push)."
fi

# ── [4/5] Start services ────────────────────────────────────────────────────
tui_step "4/5" "Starting Docker / nginx / PM2..."
ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET" bash <<'REMOTE_START'
  set -e
  if systemctl is-active --quiet docker; then echo "  ✓ Docker active";
  else echo "  ⚡ Starting Docker..."; sudo systemctl start docker; fi

  # Canonical compose names (see docker-compose.yml)
  for c in meshwork-postgres meshwork-redis meshwork-dynamodb-local; do
    if sudo docker ps --filter "name=^/${c}$" --filter "status=running" \
        --format '{{.Names}}' | grep -q "$c"; then
      echo "  ✓ $c running"
    else
      echo "  ⚡ Starting $c..."
      sudo docker start "$c" 2>/dev/null || echo "  ⚠ $c not found (ok if using compose)"
    fi
  done

  if systemctl is-active --quiet nginx; then echo "  ✓ nginx active";
  else echo "  ⚡ Starting nginx..."; sudo systemctl start nginx; fi

  for app in meshwork meshwork-auth; do
    if pm2 describe "$app" >/dev/null 2>&1; then
      echo "  ⚡ Restarting PM2 $app..."
      pm2 restart "$app" --update-env >/dev/null 2>&1 || pm2 resurrect >/dev/null 2>&1 || true
    else
      echo "  ℹ PM2 $app not registered (deploy.sh registers it on next deploy)"
    fi
  done
  pm2 save >/dev/null 2>&1 || true
REMOTE_START
tui_ok "Remote start sequence done."

# ── [5/5] Health ────────────────────────────────────────────────────────────
tui_step "5/5" "Health checks..."
tui_bar 1 3 20; echo ""
MONO="$(ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET" \
  "curl -sf http://localhost:5000/health 2>/dev/null || curl -sf http://localhost/health 2>/dev/null || echo FAILED")"
tui_bar 2 3 20; echo ""
AUTH="$(ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET" \
  "curl -sf http://127.0.0.1:8081/healthz 2>/dev/null || echo UNAVAILABLE")"
tui_bar 3 3 20; echo ""
if [[ "$MONO" == *"status"* || "$MONO" == *"ok"* || "$MONO" == *"200"* ]]; then
  tui_ok "Monolith: $MONO"
else
  tui_warn "Monolith response: $MONO"
fi
tui_info "Auth service: $AUTH"

echo ""
tui_banner "🎉 EC2 started!"
echo -e "  🌐 Live:      ${TUI_BOLD}https://${MESHWORK_DOMAIN:-$HOST_TARGET}${TUI_NC}"
echo -e "  📡 Host:      $HOST_TARGET"
echo -e "  📊 Monolith:  $MONO"
echo -e "  🔐 Auth:      $AUTH"
echo -e "  🔑 SSH:       ssh -i $SSH_KEY $SSH_USER@$HOST_TARGET"
echo ""

if [[ "$WANT_SSH" == true ]]; then
  tui_info "Opening interactive SSH shell..."
  exec ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET"
fi
