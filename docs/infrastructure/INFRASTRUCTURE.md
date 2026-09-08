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

### Application-Level Recovery Archive

Run this before manual schema changes to capture the complete service databases
and canvas snapshot as a verified archive.

```bash
BACKUP_S3_URI=s3://meshwork-backups/prod npm run db:backup
```

- Requires explicit DSNs for auth, workspace, team, Jenkos/AI, and metrics; it
  creates custom PostgreSQL dumps plus a `canvas.ndjson` snapshot and
  checksum manifest.
- Uploads artifacts to the configured S3 prefix and uploads `manifest.json`
  last, so an archive without that manifest is incomplete.
- In production it also requires PostgreSQL globals and managed DynamoDB PITR.
  See [`../../plans/Q5-BACKUP-AND-RECOVERY.md`](../../plans/Q5-BACKUP-AND-RECOVERY.md)
  for restore and operational prerequisites.

### Infrastructure Backup (PostgreSQL Binary)

If using Docker, run the provided scripts to create full binary `.dump` files.

- Any supported host: `npm run db:backup` (requires Node, `pg_dump`, and AWS CLI)

Restore drills use only newly provisioned, empty targets whose names contain
`restore-$RESTORE_DRILL_ID`; the tool rejects production mode and the active
canvas table. Download a complete archive (including `manifest.json`) to an
isolated host, set the `RESTORE_*_DATABASE_URL` values and
`RESTORE_CANVAS_DDB_TABLE`, then run:

```bash
RESTORE_MODE=drill RESTORE_DRILL_ID=20260908 \
  RESTORE_ARCHIVE_DIR=/secure/archive/2026-09-08T00-00-00-000Z \
  npm run db:restore:drill
```

Do not use this drill command for a production cutover. That procedure needs an
approved maintenance plan, a new DynamoDB table, and explicit service config
changes after validation.

### Safe Schema Migrations (Idempotent)

To prevent production data loss, all internal initialization scripts use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. This ensures new columns are safely injected into existing tables without dropping existing data.
