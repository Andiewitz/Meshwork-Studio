# Infrastructure & Deployment Guide

This document covers the complete infrastructure setup for Meshwork Studio, including AWS EC2 deployment, NGINX architecture, database backup procedures, and deployment strategy.

---

## 1. NGINX Architecture (EC2 / Docker)

When running the full stack, NGINX acts as the **"Front Door"** to the application.

### Core Responsibilities

- **High-Speed Static File Serving:** NGINX handles the delivery of our compiled React frontend (`dist/public`). Optimized for static delivery, it can serve thousands of concurrent requests rapidly.
- **Reverse Proxy:** NGINX routes traffic intelligently:
  - `/api/` or `/ws` requests are securely forwarded to the Node.js backend on port 5000.
  - All other traffic serves static assets.
- **SPA Routing:** Our `nginx.conf` solves React Router fallback automatically using `try_files $uri $uri/ @node;`.
- **Performance:** NGINX applies GZIP compression to plain-text responses and aggressive caching headers (`expires 1y;`) for static assets.

---

## 2. Cloud Deployment (AWS EC2)

The application is deployed on AWS EC2 (`t3.micro`) running Amazon Linux 2023 / Ubuntu.

### Production Environment Variables:

| Variable         | Example Value                         | Why?                                                             |
| ---------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `FRONTEND_URL`   | `https://meshwork-studio.duckdns.org` | Tells the backend to allow requests from your production domain. |
| `SESSION_SECRET` | `openssl rand -base64 32`             | Encrypts user sessions.                                          |
| `ENCRYPTION_KEY` | `node -e "..."` (32 bytes)            | Encrypts AI API keys (BYOK).                                     |
| `DATABASE_URL`   | `postgresql://...`                    | Connection to your Postgres instance.                            |
| `GEMINI_API_KEY` | `AQ.Ab8RN6Icid5E...`                  | App-owned Gemini API key for free-tier users.                    |
| `NODE_ENV`       | `production`                          | Enables security headers (Helmet) and optimizations.             |

---

## 3. Deployment Strategy

To deploy updates cleanly:

1. **Build Locally / CI**: Run `npm run build` to generate production artifacts.
2. **Deploy to EC2**: Sync built `dist` files to EC2 `/home/ubuntu/meshwork-studiov2/`.
3. **Restart Service**: Execute `pm2 restart meshwork --update-env` to reload environment variables and apply code updates without downtime.
4. **Verification**: Run `curl http://localhost:5000/health` to confirm Postgres and Redis connectivity.

---

## 4. Backups and Data Safety

This project implements two layers of data safety:

### Application-Level Backup (JSON)

Run this before manual schema changes to capture table data as human-readable JSON.

```bash
DATABASE_URL=postgres://... npm run db:backup
```

- Creates a timestamped folder in `./backups/` containing `users.json`, `workspaces.json`, `nodes.json`, etc.
- Safe to run anywhere. `./backups/` is gitignored.

### Infrastructure Backup (PostgreSQL Binary)

If using Docker, run the provided scripts to create full binary `.dump` files.

- Windows: `.\scripts\backup-db.ps1`
- Mac/Linux: `./scripts/backup-db.sh`

### Safe Schema Migrations (Idempotent)

To prevent production data loss, all internal initialization scripts use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. This ensures new columns are safely injected into existing tables without dropping existing data.
