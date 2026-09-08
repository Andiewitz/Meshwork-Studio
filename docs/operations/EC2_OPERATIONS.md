# Meshwork Studio — EC2 Operations Guide

This guide covers operating the production EC2 instance.

---

## 📌 Quick Reference

| Resource / Setting     | Value                                        | Notes                                  |
| :--------------------- | :------------------------------------------- | :------------------------------------- |
| **Domain**             | `https://meshwork-studio.duckdns.org`        | Reverse-proxied through Nginx with SSL |
| **AWS Region**         | `us-east-1`                                  | N. Virginia                            |
| **Instance ID**        | `i-0a96823caafbf35b6`                        | Ubuntu 22.04 LTS x86_64                |
| **SSH User**           | `ubuntu`                                     | Default EC2 user                       |
| **SSH Key Path**       | `ssh-keys/Mesh-EC2.pem`                      | Permissions must be `chmod 400`        |
| **Remote App Dir**     | `/home/ubuntu/meshwork-studiov2`             | PM2 root and dist location             |
| **Local Start Script** | `~/start-ec2.sh` (or `scripts/start-ec2.sh`) | Starts instance + all services         |

---

## 🚀 One-Command Start: `~/start-ec2.sh`

To save AWS costs, the EC2 instance can be kept stopped when not in use. When you want to work:

### 1. Start Services and Verify Health

```bash
~/start-ec2.sh
```

**What happens:**

1. Checks AWS to ensure the EC2 instance is started (if AWS CLI is configured).
2. Waits for network and SSH port 22 to become available.
3. Automatically connects via SSH using `ssh-keys/Mesh-EC2.pem`.
4. Starts the Docker daemon and containers (`emnesh-postgres-workspace`, `emnesh-postgres-auth`, `emnesh-redis`).
5. Starts the Nginx web server.
6. Starts/Restarts the Node.js backend under PM2 (`pm2 resurrect` / `pm2 restart meshwork`).
7. Checks the `/health` endpoint and prints a readiness summary.

### 2. Start Services + Open SSH Shell

```bash
~/start-ec2.sh --ssh
```

Starts everything and immediately attaches an interactive SSH terminal (`ubuntu@meshwork-studio:~$`).

---

## 💰 Cost Saving: Stopping the Instance

When finished working, turn off the instance to stop compute and RAM billing:

### Via AWS CLI:

```bash
aws ec2 stop-instances --instance-ids i-0a96823caafbf35b6 --region us-east-1
```

_(Or stop instance directly in the AWS Management Console.)_

---

## 🔄 Building & Deploying Updates

When you make changes to frontend or backend code locally and want to push them to the server:

### Step 1: Build Locally

```bash
npm run build
```

This compiles:

- Frontend assets into `dist/public/`
- Backend bundle into `dist/index.cjs`

### Step 2: Upload `dist/` to EC2

```bash
rsync -avz -e "ssh -i ssh-keys/Mesh-EC2.pem" dist/ ubuntu@meshwork-studio.duckdns.org:/home/ubuntu/meshwork-studiov2/dist/
```

### Step 3: Restart App on EC2

```bash
ssh -i ssh-keys/Mesh-EC2.pem ubuntu@meshwork-studio.duckdns.org "pm2 restart meshwork"
```

---

## 🛠️ Remote Server Management

### SSH into EC2

```bash
ssh -i ssh-keys/Mesh-EC2.pem ubuntu@meshwork-studio.duckdns.org
```

### PM2 Commands

```bash
# Check application status
pm2 status

# View live application logs
pm2 logs meshwork

# Restart backend process
pm2 restart meshwork

# Save current PM2 state for reboots
pm2 save
```

### Docker Containers (Database & Redis)

```bash
# Check running containers
sudo docker ps

# Restart containers manually if needed
sudo docker restart emnesh-postgres-workspace emnesh-postgres-auth emnesh-redis
```

### Verified backup timer

The deployment bundles the recovery runner in `dist/recovery/backup.cjs`. After
creating the S3 destination, granting the least-privilege role, enabling canvas
PITR, and setting the `BACKUP_*` values in the protected `.env`, install the
reviewed timer once:

```bash
cd ~/meshwork-studiov2
chmod +x scripts/install-backup-timer.sh
./scripts/install-backup-timer.sh
sudo systemctl start meshwork-backup.service
journalctl -u meshwork-backup.service -n 100 --no-pager
```

The service runs nightly with a randomized delay, a 384 MiB memory ceiling, and
low CPU/I/O priority. A failed service is deliberately visible through systemd;
do not treat a local Docker volume as a disaster-recovery backup. See
[`../../plans/Q5-BACKUP-AND-RECOVERY.md`](../../plans/Q5-BACKUP-AND-RECOVERY.md)
for restore-drill and AWS prerequisites.

### Nginx (Reverse Proxy & SSL)

```bash
# Test nginx configuration syntax
sudo nginx -t

# Reload / restart nginx
sudo systemctl reload nginx
sudo systemctl restart nginx
```

### Health Check Endpoint

```bash
# Test from server
curl -i http://localhost:5000/health

# Test publicly
curl -i https://meshwork-studio.duckdns.org/health
```
