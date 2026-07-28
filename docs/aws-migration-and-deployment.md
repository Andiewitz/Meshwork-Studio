# AWS Migration & Deployment Plan — Meshwork Studio

## Context

Meshwork Studio is a full-stack TypeScript app (React + Express) currently run via `docker-compose.yml` with local Postgres (workspace + auth), Redis, a Node backend, and an Nginx front-end. It is also pre-wired for Railway (`railway.json`) and Vercel (`vercel.json`). The goal is to migrate off local Docker / PaaS to **AWS**, with a reproducible, secure, and observable deployment.

## Key Findings (from code review)

- **Stack**: Node 20, Express 5, React 18 + Vite, Drizzle ORM (`pg`), `ioredis` + `connect-redis`, `express-session`, `passport` (local + Google OAuth), `helmet`, `csurf`, `jsonwebtoken`, `openai`.
- **Stateful deps**: two Postgres DBs (`emnesh_workspace`, `emnesh_auth`), one Redis (sessions/cache).
- **Build**: single `Dockerfile` (multi-stage, builds `dist/`, runs `drizzle-kit push` at startup). Frontend static build served by Nginx (`nginx.conf`).
- **Env/Secrets**: `SESSION_SECRET`, `JWT_SECRET`, `GOOGLE_CLIENT_*`, `SMTP_*`, `OPENROUTER_API_KEY`, `DATABASE_URL`, `REDIS_URL` — currently in `.env` and compose.
- **Infra docs present**: `docs/INFRASTRUCTURE.md` (review before finalizing). `drizzle.config.ts` + `migrations/` exist.
- **CI/CD**: GitHub Actions (`.github`), semantic-release (`.releaserc.cjs`), Husky/commitlint.

## Recommended AWS Target Architecture

- **Compute**: ECS on Fargate (two services: `backend`, `frontend`) behind an **ALB** (HTTPS via ACM). Avoids managing EC2.
- **Databases**: **Amazon RDS for PostgreSQL** (Multi-AZ, two logical DBs or one instance w/ two schemas) — replaces the two local Postgres containers.
- **Cache/Sessions**: **Amazon ElastiCache (Redis)** — replaces local Redis.
- **Secrets**: **AWS Secrets Manager** (or SSM Parameter Store) for `SESSION_SECRET`, `JWT_SECRET`, OAuth, SMTP, API keys.
- **Container Registry**: **Amazon ECR** for backend + frontend images.
- **IaC**: **Terraform** (or AWS CDK) to provision VPC, subnets, ECS, RDS, ElastiCache, ALB, ECR, IAM, Secrets.
- **CI/CD**: GitHub Actions → build/push to ECR → `terraform apply` / ECS rolling deploy. Reuse existing `.github` workflows.
- **Observability**: CloudWatch Logs + metrics; reuse `prom-client` metrics via CloudWatch agent or `/metrics` scraping.

## Migration Steps (ordered)

1. **Review** `docs/INFRASTRUCTURE.md` and confirm external service assumptions (OAuth, SMTP, OpenRouter) and data volumes.
2. **Provision networking** (VPC, private/public subnets, NAT, security groups) via Terraform.
3. **Provision RDS PostgreSQL** (pg15 to match `postgres:15-alpine`), with separate DBs/schemas for workspace + auth; capture connection strings into Secrets Manager.
4. **Provision ElastiCache Redis** (with auth token); store `REDIS_URL` in Secrets Manager.
5. **Create ECR repos**; update `Dockerfile` so schema push (`drizzle-kit push`) runs as a separate migration task, not at container start (better for Fargate rollouts).
6. **Containerize frontend** properly: build static assets and serve via a small Nginx/Fargate task or **S3 + CloudFront** (recommended for cost/perf). Decide in question below.
7. **Define ECS task definitions + services** for backend (port 5000) and frontend (port 80), wired to ALB; inject secrets from Secrets Manager at runtime.
8. **Provision ALB + ACM cert + Route53** for custom domain; enforce HTTPS, keep `helmet`/`csurf`.
9. **Data migration**: `pg_dump` local DBs → restore into RDS (one-time).
10. **CI/CD**: extend GitHub Actions to build images, push to ECR, run Terraform, and trigger ECS deploy; reuse semantic-release.
11. **Observability & backup**: CloudWatch alarms, RDS automated backups/PITR, ElastiCache snapshots.

## Open Questions for User

- **Frontend hosting**: Fargate+Nginx (matches today) vs **S3 + CloudFront** (cheaper, recommended)?
- **IaC tool**: **Terraform** (recommended) vs AWS CDK vs manual Console?
- **Environment scope**: prod only, or also staging/non-prod accounts?
- **Region / compliance**: target AWS region and any data-residency needs?
- **Cost posture**: managed Multi-AZ (resilient) vs single-AZ (cheaper) for initial launch?

## Validation

- `npm run check` / `npm run lint` still pass.
- Staging deploy: app boots, `drizzle-kit push` applies schema, login (local + Google OAuth) works, sessions persist via ElastiCache, AI calls succeed.
- Load test against ALB; verify CloudWatch logs/metrics and RDS/PITR backups.

## Risks

- Two-DB coupling (`WORKSPACE_DATABASE_URL`, `AUTH_DATABASE_URL`) — confirm backend uses both; plan RDS layout accordingly.
- Schema push at container start conflicts with immutable Fargate tasks → move to migration job.
- Secrets handling must avoid committing to `.env` in images.
- External integrations (OAuth/SMTP/OpenRouter) need prod credentials + redirect URIs updated.
