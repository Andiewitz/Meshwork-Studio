# Meshwork Studio — Single-Node EC2 / Evaluation Deployment

> [!NOTE]
> This folder contains scripts and documentation for running Meshwork Studio on a **single EC2 instance** (useful for staging, evaluation, or emergency self-hosted backup).
> For canonical production deployments, see the declarative **ECS / Fargate + ALB + Multi-AZ RDS / ElastiCache Terraform infrastructure** in [`terraform/`](../terraform).

## Quick Start

### 1. Launch EC2 (t3.micro, Amazon Linux 2023, ap-southeast-1)

- **User Data**: Paste contents of `ec2-user-data.sh`
- **Security Group**: SSH (22, your IP), HTTP (80, 0.0.0.0/0)
- **Key Pair**: Your SSH key
- **Storage**: 20 GB gp3

Wait for instance to initialize (~2-3 min).

### 2. Create RDS (db.t3.micro, PostgreSQL 15, same VPC)

- **DB identifier**: `meshwork-db`
- **DB name**: `emnesh_workspace`
- **Username**: `admin` (or your choice)
- **Password**: Strong password, save it
- **VPC Security Group**: Create new "meshwork-rds-sg"
  - Inbound: 5432 from EC2 security group only
- **Public access**: No
- **Backup retention**: 0 (free tier)

Wait for "Available" (~5-10 min).

### 3. Create Second Database

SSH to EC2, then:

```bash
psql -h <rds-endpoint> -U admin -d emnesh_workspace
# Password from step 2
CREATE DATABASE emnesh_auth;
\q
```

### 4. Configure Environment on EC2

```bash
ssh -i your-key.pem ec2-user@<ec2-public-ip>
cd /home/ec2-user/app
cp deploy/.env.example .env
nano .env
# Fill in:
# - RDS endpoint (from RDS console)
# - Database password
# - SESSION_SECRET (openssl rand -base64 32)
# - JWT_SECRET (openssl rand -base64 64)
# - FRONTEND_URL=http://<ec2-public-ip>
# - APP_URL=http://<ec2-public-ip>
chmod 600 .env
```

### 5. First Deploy

```bash
cd /home/ec2-user/app
git clone https://github.com/Andiewitz/Meshwork-Studio.git meshwork-studio
cd meshwork-studio
./deploy/deploy.sh
```

### 6. Verify

- `http://<ec2-public-ip>/health` → JSON with status
- `http://<ec2-public-ip>` → Frontend loads
- Register/login works

---

## Subsequent Deploys

```bash
ssh -i your-key.pem ec2-user@<ec2-public-ip>
cd /home/ec2-user/app/meshwork-studio
./deploy/deploy.sh
```

---

## Files in This Folder

| File               | Purpose                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `ec2-user-data.sh` | Runs on EC2 first boot (installs Node, Redis, Nginx, PM2)        |
| `nginx.conf`       | Reverse proxy config (port 80 → Node :5000, serves static files) |
| `deploy.sh`        | Run on EC2 to pull, build, migrate, restart                      |
| `.env.example`     | Template for production env vars                                 |
| `rds-setup.md`     | AWS CLI commands for RDS (optional, console works too)           |
| `README.md`        | This file                                                        |

---

## Architecture

```
Internet (port 80)
    │
    ▼
EC2 t3.micro (Amazon Linux 2023)
    ├─ Nginx (port 80)
    │   ├─ / → static files from /home/ec2-user/app/dist/public
    │   └─ /api/, /health, WebSocket → proxy to localhost:5000
    │
    ├─ Node.js app (PM2, port 5000)
    │   ├─ API routes (/api/v1/*)
    │   ├─ WebSocket (real-time cursors)
    │   └─ serveStatic() fallback for SPA routing
    │
    └─ Redis 7 (localhost:6379, bind 127.0.0.1 only)
        └─ Session store, token revocation, presence

RDS db.t3.micro (private subnet)
    ├─ emnesh_workspace
    └─ emnesh_auth
```

---

## Costs (Free Tier, 12 Months)

| Service         | Free Tier Limit | Monthly After |
| --------------- | --------------- | ------------- |
| EC2 t3.micro    | 750 hrs         | ~$8.50        |
| RDS db.t3.micro | 750 hrs         | ~$15          |
| EBS 20 GB gp3   | 30 GB           | ~$2.40        |
| Data transfer   | 100 GB          | ~$9/100GB     |

**First year: $0** (if you stay within limits)

---

## When to Upgrade

| Signal                    | Action                                  |
| ------------------------- | --------------------------------------- |
| Redis OOM / evictions     | ElastiCache cache.t3.micro (~$15/mo)    |
| EC2 CPU > 80% sustained   | t3.small ($15/mo) or t3.medium ($30/mo) |
| RDS storage > 20 GB       | Increase gp3 (cheap)                    |
| Real users, need HTTPS    | Add domain, ACM cert, CloudFront        |
| Need zero-downtime deploy | GitHub Actions + blue/green or Fargate  |

---

## Troubleshooting

**App won't start:**

```bash
pm2 logs meshwork
# Check .env values, RDS connectivity
```

**Nginx 502:**

```bash
sudo systemctl status nginx
sudo nginx -t
sudo systemctl restart nginx
```

**Database connection failed:**

- Check RDS security group allows EC2 SG on 5432
- Verify `.env` has correct endpoint (no trailing slash, port 5432)
- Test: `psql -h <endpoint> -U admin -d emnesh_workspace` from EC2

**WebSocket not working:**

- Nginx config must have `proxy_set_header Upgrade` and `Connection` (already in `nginx.conf`)
- Check browser console for WS connection errors

---

## Adding HTTPS Later (When You Have a Domain)

1. Point domain A record to EC2 Elastic IP
2. `sudo certbot --nginx -d yourdomain.com`
3. Update `.env`: `FRONTEND_URL=https://yourdomain.com`, `APP_URL=https://yourdomain.com`
4. Redeploy
