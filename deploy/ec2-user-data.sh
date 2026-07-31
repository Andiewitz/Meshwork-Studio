#!/bin/bash
# EC2 User Data — runs on first boot of t3.micro Amazon Linux 2023
# Installs: Node 22, Redis 7, Nginx, PM2, psql client, certbot
# Region: ap-southeast-1 (adjust as needed)

set -e

echo "=== EC2 setup started at $(date) ==="

dnf update -y

# ─── Node.js 22 (matches CI) ───────────────────────────────────────
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs

# ─── Redis 7 (session store, token revocation, presence) ────────────
dnf install -y redis7
systemctl enable redis
systemctl start redis

# Configure Redis for localhost only (security)
sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf 2>/dev/null || true
sed -i 's/^# maxmemory .*/maxmemory 128mb/' /etc/redis/redis.conf 2>/dev/null || true
sed -i 's/^# maxmemory-policy .*/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf 2>/dev/null || true
systemctl restart redis

# ─── Nginx (reverse proxy) ──────────────────────────────────────────
dnf install -y nginx
systemctl enable nginx
systemctl start nginx

# ─── PM2 (process manager for Node.js) ──────────────────────────────
npm install -g pm2

# Configure PM2 to start on boot
pm2 startup systemd -u ec2-user --hp /home/ec2-user
# Note: run `pm2 save` after first deploy to persist the process list

# ─── PostgreSQL client (for RDS database setup) ─────────────────────
dnf install -y postgresql15

# ─── Certbot (for HTTPS when you have a domain) ─────────────────────
dnf install -y certbot python3-certbot-nginx

# ─── Git (for pulling code) ─────────────────────────────────────────
dnf install -y git

# ─── Swap space (t3.micro only has 1GB RAM — npm install needs more) ─
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=128M count=8  # 1GB swap
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
  echo "Swap configured (1GB)"
fi

# ─── Create app directory ───────────────────────────────────────────
mkdir -p /home/ec2-user/app
chown -R ec2-user:ec2-user /home/ec2-user/app

echo "=== EC2 setup complete at $(date) ==="
echo "Next steps:"
echo "  1. SSH in: ssh -i your-key.pem ec2-user@<public-ip>"
echo "  2. Clone: cd /home/ec2-user/app && git clone <repo-url> meshwork-studio"
echo "  3. Configure: cp meshwork-studio/deploy/.env.example .env && nano .env"
echo "  4. Deploy: cd meshwork-studio && ./deploy/deploy.sh"