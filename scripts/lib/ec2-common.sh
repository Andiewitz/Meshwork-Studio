#!/usr/bin/env bash
# Meshwork Studio — shared EC2 + pretty TUI helpers.
# Sourced by scripts/start.sh and scripts/deploy.sh. Not run directly.
# Usage: source "$SCRIPT_DIR/lib/ec2-common.sh"

# --- Colors (disabled when NO_COLOR set or stdout is not a TTY) ---
if [[ -n "${NO_COLOR:-}" ]] || [[ ! -t 1 ]]; then
  TUI_GREEN=''; TUI_BLUE=''; TUI_YELLOW=''; TUI_RED=''; TUI_CYAN=''; TUI_BOLD=''; TUI_DIM=''; TUI_NC=''
else
  TUI_GREEN='\033[0;32m'; TUI_BLUE='\033[0;34m'; TUI_YELLOW='\033[1;33m'
  TUI_RED='\033[0;31m'; TUI_CYAN='\033[0;36m'; TUI_BOLD='\033[1m'
  TUI_DIM='\033[2m'; TUI_NC='\033[0m'
fi

tui_banner() {
  local title="$1"
  local line="======================================================"
  echo -e "${TUI_BOLD}${TUI_CYAN}${line}${TUI_NC}"
  echo -e "${TUI_BOLD}${TUI_CYAN}   ${title}${TUI_NC}"
  echo -e "${TUI_BOLD}${TUI_CYAN}${line}${TUI_NC}"
}

tui_step() {
  # tui_step "2/5" "Connecting to EC2..."
  echo -e "${TUI_BLUE}▶ [$1]${TUI_NC} $2"
}

tui_ok()   { echo -e "${TUI_GREEN}  ✓${TUI_NC} $1"; }
tui_info() { echo -e "${TUI_DIM}  ●${TUI_NC} $1"; }
tui_warn() { echo -e "${TUI_YELLOW}  ⚠${TUI_NC} $1"; }
tui_fail() { echo -e "${TUI_RED}  ❌${TUI_NC} $1"; }

# tui_bar current total [width] — e.g. tui_bar 3 10 → ██████░░░░ 30%
tui_bar() {
  local cur="${1:-0}" total="${2:-100}" width="${3:-24}"
  (( total <= 0 )) && total=1
  (( cur < 0 )) && cur=0
  (( cur > total )) && cur="$total"
  local pct=$(( cur * 100 / total ))
  local filled=$(( cur * width / total ))
  local bar=""
  for ((i = 0; i < filled; i++)); do bar+="█"; done
  for ((i = filled; i < width; i++)); do bar+="░"; done
  printf "${TUI_CYAN}%s${TUI_NC} ${TUI_BOLD}%3d%%${TUI_NC} (%s/%s)" "$bar" "$pct" "$cur" "$total"
}

# tui_spin PID message — watches PID, draws spinner + elapsed until done.
tui_spin() {
  local pid="$1"; shift
  local msg="$*"
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  local i=0 start now
  start=$(date +%s)
  while kill -0 "$pid" 2>/dev/null; do
    now=$(date +%s)
    printf "\r  ${TUI_CYAN}%s${TUI_NC} %s ${TUI_DIM}%ds${TUI_NC}   " \
      "${frames[i]}" "$msg" "$(( now - start ))"
    i=$(( (i + 1) % ${#frames[@]} ))
    sleep 0.12
  done
  printf "\r%80s\r" " "
}

# --- Shared EC2 config (env-overridable) ---
: "${AWS_REGION:=us-east-1}"
: "${MESHWORK_SSH_USER:=ubuntu}"
: "${SSH_USER:=$MESHWORK_SSH_USER}"

# ec2_find_key — prints first existing key path, fails otherwise.
ec2_find_key() {
  local repo_dir="${1:-}"
  local candidates=(
    "${MESHWORK_SSH_KEY:-}"
    "$repo_dir/ssh-keys/Mesh-EC2.pem"
    "$HOME/.ssh/meshwork.pem"
    "$HOME/.ssh/id_rsa"
    "$HOME/.ssh/id_ed25519"
  )
  local key
  for key in "${candidates[@]}"; do
    if [[ -n "$key" && -f "$key" ]]; then
      chmod 400 "$key" 2>/dev/null || true
      echo "$key"
      return 0
    fi
  done
  return 1
}

# ec2_resolve_host — DOMAIN preferred, else EC2 public IP via AWS CLI.
ec2_resolve_host() {
  local instance_id="${MESHWORK_EC2_INSTANCE_ID:-}"
  local domain="${MESHWORK_DOMAIN:-}"
  local target="$domain"
  if command -v aws &>/dev/null && [[ -n "$instance_id" ]]; then
    local ip
    ip=$(aws ec2 describe-instances --instance-ids "$instance_id" \
      --region "$AWS_REGION" \
      --query "Reservations[0].Instances[0].PublicIpAddress" \
      --output text 2>/dev/null || echo "")
    if [[ -n "$ip" && "$ip" != "None" ]]; then
      target="$ip"
    fi
  fi
  echo "$target"
}

# ec2_ensure_running — starts stopped instance via AWS CLI (best effort).
ec2_ensure_running() {
  local instance_id="${MESHWORK_EC2_INSTANCE_ID:-}"
  if ! command -v aws &>/dev/null || [[ -z "$instance_id" ]]; then
    return 0
  fi
  local state
  state=$(aws ec2 describe-instances --instance-ids "$instance_id" \
    --region "$AWS_REGION" \
    --query "Reservations[0].Instances[0].State.Name" \
    --output text 2>/dev/null || echo "unknown")
  if [[ "$state" == "stopped" ]]; then
    tui_warn "EC2 $instance_id is stopped — starting it..."
    aws ec2 start-instances --instance-ids "$instance_id" \
      --region "$AWS_REGION" >/dev/null
    tui_info "Waiting for instance to enter 'running'..."
    aws ec2 wait instance-running --instance-ids "$instance_id" \
      --region "$AWS_REGION"
    tui_ok "EC2 instance is now running."
  elif [[ "$state" == "running" ]]; then
    tui_ok "EC2 $instance_id already running (${AWS_REGION})."
  else
    tui_info "EC2 state: ${state} (continuing to SSH check)"
  fi
}

# ec2_wait_ssh KEY USER HOST [max_retries] — spinner + progress bar.
ec2_wait_ssh() {
  local key="$1" user="$2" host="$3" max_retries="${4:-30}"
  local n=0
  while (( n < max_retries )); do
    if ssh -i "$key" -o StrictHostKeyChecking=accept-new \
        -o ConnectTimeout=5 -o BatchMode=yes \
        "$user@$host" "echo ready" &>/dev/null; then
      printf "\r%80s\r" " "
      tui_ok "SSH connected to ${user}@${host}"
      echo "$host"
      return 0
    fi
    n=$(( n + 1 ))
    printf "\r  ${TUI_CYAN}⠋${TUI_NC} Waiting for SSH %-28s " "$host"
    tui_bar "$n" "$max_retries" 16
    printf "  "
    sleep 3
  done
  printf "\n"
  return 1
}

# ec2_explain_target — friendly "EC2 not found" message. Always returns 1.
# Call when HOST_TARGET is empty or SSH is unreachable: it just tells the
# user what is missing and how to fix it, instead of failing cryptically.
ec2_explain_target() {
  local reason="${1:-missing}"
  echo ""
  if [[ "$reason" == "missing" ]]; then
    tui_fail "Couldn't find your EC2 — no address configured."
  else
    tui_fail "Couldn't reach your EC2 at '${reason}'."
  fi
  echo ""
  echo -e "  Current setup:"
  echo -e "    MESHWORK_DOMAIN=${TUI_BOLD}${MESHWORK_DOMAIN:-<not set>}${TUI_NC}"
  echo -e "    MESHWORK_EC2_INSTANCE_ID=${TUI_BOLD}${MESHWORK_EC2_INSTANCE_ID:-<not set>}${TUI_NC}"
  echo -e "    MESHWORK_SSH_USER=${TUI_BOLD}${SSH_USER}${TUI_NC}  AWS_REGION=${TUI_BOLD}${AWS_REGION}${TUI_NC}"
  echo ""
  echo -e "  To fix, tell the script where your EC2 lives (either one):"
  echo -e "    ${TUI_BOLD}export MESHWORK_DOMAIN=your-server.com${TUI_NC}"
  echo -e "    ${TUI_BOLD}export MESHWORK_EC2_INSTANCE_ID=i-0abc12345def${TUI_NC}  (needs AWS CLI)"
  if [[ "$reason" != "missing" ]]; then
    echo ""
    echo -e "  If the address looks right, the box itself may be down:"
    echo -e "    ● Instance stopped? Start it in AWS console or via CLI."
    echo -e "    ● Security group blocking port 22? Allow your IP."
    echo -e "    ● Wrong SSH key? Set ${TUI_BOLD}MESHWORK_SSH_KEY=/path/to/key.pem${TUI_NC}"
  fi
  echo ""
  return 1
}

# ec2_remote_dir KEY USER HOST — detect remote app dir (single canonical).
ec2_remote_dir() {
  local key="$1" user="$2" host="$3"
  ssh -i "$key" "$user@$host" '
    if [ -n "${REMOTE_APP_DIR:-}" ] && [ -d "${REMOTE_APP_DIR}" ]; then
      echo "${REMOTE_APP_DIR}"
    elif [ -d "/home/ubuntu/meshwork-studiov2" ]; then
      echo "/home/ubuntu/meshwork-studiov2"
    elif [ -d "/home/ubuntu/app/meshwork-studio" ]; then
      echo "/home/ubuntu/app/meshwork-studio"
    else
      echo "$HOME/meshwork-studiov2"
    fi
  '
}
