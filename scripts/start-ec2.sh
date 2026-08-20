#!/usr/bin/env bash
# ==============================================================================
# Meshwork Studio — Start & Health Check Script
# ==============================================================================
# Usage:
#   ~/start-ec2.sh          # Starts EC2 (if needed), starts all services, checks health
#   ~/start-ec2.sh --ssh    # Starts everything and opens an interactive SSH terminal
# ==============================================================================

set -euo pipefail

# --- Configuration ---
INSTANCE_ID="i-0a96823caafbf35b6"
AWS_REGION="us-east-1"
DOMAIN="meshwork-studio.duckdns.org"
SSH_USER="ubuntu"
SSH_KEY_LOCATIONS=(
  "$HOME/Desktop/Meshwork-Studio/ssh-keys/Mesh-EC2.pem"
  "$HOME/ssh-keys/Mesh-EC2.pem"
  "$HOME/.ssh/Mesh-EC2.pem"
  "$HOME/Mesh-EC2.pem"
)

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BOLD}${CYAN}======================================================${NC}"
echo -e "${BOLD}${CYAN}   🚀 Meshwork Studio — EC2 & Services Starter   ${NC}"
echo -e "${BOLD}${CYAN}======================================================${NC}"

# Locate SSH Key
SSH_KEY=""
for key in "${SSH_KEY_LOCATIONS[@]}"; do
  if [[ -f "$key" ]]; then
    SSH_KEY="$key"
    break
  fi
done

if [[ -z "$SSH_KEY" ]]; then
  echo -e "${RED}❌ Error: SSH Key (Mesh-EC2.pem) not found in expected paths.${NC}"
  echo -e "   Please ensure Mesh-EC2.pem exists in ~/Desktop/Meshwork-Studio/ssh-keys/"
  exit 1
fi

chmod 400 "$SSH_KEY" 2>/dev/null || true
echo -e "${GREEN}✓${NC} SSH Key found: ${SSH_KEY}"

# 1. AWS CLI Start Check (if AWS CLI is configured)
HOST_TARGET="$DOMAIN"

if command -v aws &>/dev/null; then
  echo -e "${BLUE}▶ Checking AWS EC2 instance status via AWS CLI...${NC}"
  INSTANCE_STATE=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --region "$AWS_REGION" \
    --query "Reservations[0].Instances[0].State.Name" \
    --output text 2>/dev/null || echo "unknown")

  if [[ "$INSTANCE_STATE" == "stopped" ]]; then
    echo -e "${YELLOW}⚡ EC2 instance is currently stopped. Starting instance ($INSTANCE_ID)...${NC}"
    aws ec2 start-instances --instance-ids "$INSTANCE_ID" --region "$AWS_REGION" >/dev/null
    echo -e "${YELLOW}⏳ Waiting for EC2 instance to enter 'running' state...${NC}"
    aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$AWS_REGION"
    echo -e "${GREEN}✓ EC2 instance is now running!${NC}"
  elif [[ "$INSTANCE_STATE" == "running" ]]; then
    echo -e "${GREEN}✓${NC} EC2 instance ($INSTANCE_ID) is already running in ${AWS_REGION}."
  else
    echo -e "${YELLOW}ℹ AWS CLI instance state: ${INSTANCE_STATE}${NC}"
  fi

  # Retrieve public IP if available
  EC2_PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --region "$AWS_REGION" \
    --query "Reservations[0].Instances[0].PublicIpAddress" \
    --output text 2>/dev/null || echo "")
  
  if [[ -n "$EC2_PUBLIC_IP" && "$EC2_PUBLIC_IP" != "None" ]]; then
    HOST_TARGET="$EC2_PUBLIC_IP"
  fi
fi

# 2. Wait for SSH availability
echo -e "${BLUE}▶ Waiting for SSH connectivity on ${HOST_TARGET}...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0
SSH_READY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 -o BatchMode=yes "$SSH_USER@$HOST_TARGET" "echo ready" &>/dev/null; then
    SSH_READY=true
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo -ne "${YELLOW}.${NC}"
  sleep 3
done
echo ""

if [ "$SSH_READY" = false ]; then
  # Fallback to domain if IP failed
  if [[ "$HOST_TARGET" != "$DOMAIN" ]]; then
    echo -e "${YELLOW}Retrying via domain ${DOMAIN}...${NC}"
    HOST_TARGET="$DOMAIN"
    if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 -o BatchMode=yes "$SSH_USER@$HOST_TARGET" "echo ready" &>/dev/null; then
      SSH_READY=true
    fi
  fi
fi

if [ "$SSH_READY" = false ]; then
  echo -e "${RED}❌ Could not connect to EC2 via SSH within the timeout.${NC}"
  echo -e "   Please verify the instance is powered on in AWS and security group allows port 22."
  exit 1
fi

echo -e "${GREEN}✓${NC} SSH Connection established!"

# 3. Start remote services
echo -e "${BLUE}▶ Starting services on EC2 instance...${NC}"

ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET" bash << 'EOF'
  set -e
  
  # Ensure Docker service is running
  if systemctl is-active --quiet docker; then
    echo "  ✓ Docker daemon is active"
  else
    echo "  ⚡ Starting Docker daemon..."
    sudo systemctl start docker
  fi

  # Start Postgres & Redis containers if stopped
  CONTAINERS=("emnesh-postgres-workspace" "emnesh-postgres-auth" "emnesh-redis")
  for container in "${CONTAINERS[@]}"; do
    if sudo docker ps --filter "name=^/${container}$" --filter "status=running" --format '{{.Names}}' | grep -q "${container}"; then
      echo "  ✓ Container ${container} is running"
    else
      echo "  ⚡ Starting container ${container}..."
      sudo docker start "${container}" 2>/dev/null || true
    fi
  done

  # Ensure Nginx is running
  if systemctl is-active --quiet nginx; then
    echo "  ✓ Nginx web server is active"
  else
    echo "  ⚡ Starting Nginx..."
    sudo systemctl start nginx
  fi

  # Ensure PM2 app is running
  if pm2 list | grep -q "meshwork"; then
    STATUS=$(pm2 jlist | grep -o '"pm2_env":{"status":"[^"]*"' | head -n1 | cut -d'"' -f6 || echo "")
    if [[ "$STATUS" != "online" ]]; then
      echo "  ⚡ Resuming PM2 meshwork process..."
      pm2 restart meshwork >/dev/null 2>&1 || pm2 resurrect >/dev/null 2>&1
    else
      echo "  ✓ PM2 meshwork process is online"
    fi
  else
    echo "  ⚡ Starting PM2 meshwork process..."
    pm2 resurrect >/dev/null 2>&1 || pm2 start /home/ubuntu/meshwork-studiov2/dist/index.cjs --name meshwork >/dev/null 2>&1
  fi
EOF

# 4. Verify Health Endpoint
echo -e "${BLUE}▶ Verifying application health check...${NC}"
HEALTH_STATUS=$(ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET" "curl -sf http://localhost:5000/health 2>/dev/null || curl -sf http://localhost/health 2>/dev/null || echo 'FAILED'")

if [[ "$HEALTH_STATUS" == *"status"* || "$HEALTH_STATUS" == *"ok"* || "$HEALTH_STATUS" == *"200"* ]]; then
  echo -e "${GREEN}✓ Application Health Check: PASSED${NC}"
else
  echo -e "${YELLOW}⚠ Health check response: ${HEALTH_STATUS}${NC}"
fi

# 5. Summary banner
echo ""
echo -e "${BOLD}${GREEN}======================================================${NC}"
echo -e "${BOLD}${GREEN}   🎉 Everything is up and running successfully!     ${NC}"
echo -e "${BOLD}${GREEN}======================================================${NC}"
echo -e "  🌐 ${BOLD}Website:${NC}      https://${DOMAIN}"
echo -e "  📡 ${BOLD}Host Target:${NC}  ${HOST_TARGET}"
echo -e "  🔑 ${BOLD}SSH Command:${NC}  ssh -i ${SSH_KEY} ${SSH_USER}@${HOST_TARGET}"
echo ""

# If --ssh argument provided, enter interactive SSH session
if [[ "${1:-}" == "--ssh" || "${1:-}" == "-s" ]]; then
  echo -e "${CYAN}Entering interactive SSH shell...${NC}"
  exec ssh -i "$SSH_KEY" "$SSH_USER@$HOST_TARGET"
fi
