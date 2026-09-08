# Meshwork Studio

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS">
</p>

<p align="center">
  <strong>A visual architecture design platform with enterprise-grade security, AI-assisted diagramming, and a high-performance canvas engine.</strong>
</p>

---

## What is Meshwork Studio?

Meshwork Studio lets you design system architecture diagrams by dragging infrastructure components onto an infinite canvas and connecting them. Think of it as Figma for backend engineers — you can visually map out your servers, databases, VPCs, Kubernetes clusters, and more.

### Core Features

- **🎨 60+ Infrastructure Components** — Drag-and-drop servers, databases, load balancers, Lambda functions, Kubernetes pods, and more onto a visual canvas
- **🧠 AI-Assisted Design** — Bring your own OpenAI/Anthropic API key to generate architecture suggestions (keys are AES-256 encrypted, never stored in plaintext)
- **📦 Spatial Containment** — Drop an EC2 instance into a VPC and it automatically nests inside, just like real infrastructure
- **⚡ Smart Sync** — Canvas changes are persisted using a Postgres upsert strategy that only writes what changed, not the entire diagram
- **🔐 Security Hardened** — IDOR protection, brute-force lockouts, CSRF tokens, rate limiting, and PII-safe logging
- **📁 Workspaces & Collections** — Organize diagrams into projects with nested folder structures
- **🎭 Dark/Light Themes** — Full theme support
- **🐳 Docker-Ready** — One command to launch the full stack with NGINX, Postgres, and the app

---

## Architecture

```
┌────────────────────┐     ┌────────────────────┐     ┌────────────────────┐
│   CLIENT LAYER     │     │   NGINX GATEWAY    │     │   API SERVER       │
│   (React + Vite)   │◄───►│   (Port 80)        │◄───►│   (Express :5000)  │
│                    │     │                    │     │                    │
│ • React 18         │     │ • Reverse Proxy    │     │ • Go Auth Service  │
│ • React Flow       │     │ • Static Assets    │     │ • Drizzle ORM      │
│ • TanStack Query   │     │ • Gzip + Caching   │     │ • Zod Validation   │
│ • Tailwind + Radix │     │ • SPA Fallback     │     │ • AES-256 BYOK     │
└────────────────────┘     └────────────────────┘     └────────┬───────────┘
                                                               │
                                          ┌────────────────────┼────────────┐
                                          │       DATA LAYER   │            │
                                          │                    ▼            │
                                          │  ┌──────────────┐  ┌────────┐  │
                                          │  │  PostgreSQL   │  │ Postgres│  │
                                          │  │  Auth DB      │  │ Work DB │  │
                                          │  │  :5433        │  │ :5434   │  │
                                          │  └──────────────┘  └────────┘  │
                                          └─────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- **Docker Desktop** (for the full stack) or **Node.js 20+** (for local dev)

### Option 1: Docker (Full Stack)

```bash
git clone https://github.com/Andiewitz/Meshwork-Studio.git
cd Meshwork-Studio

cp .env.example .env
# Edit .env with your credentials

docker-compose up -d
# Visit http://localhost
```

### Option 2: Local Development

```bash
npm install
npm run dev              # monolith + frontend on :5000
make -C server/services/auth run  # auth service on :8081 (auth endpoints are Go)
# Visit http://localhost:5000
```

---

## Tech Stack

### Frontend

| Technology         | Purpose                               |
| ------------------ | ------------------------------------- |
| **React 18**       | UI framework                          |
| **TypeScript**     | Type safety across the full stack     |
| **React Flow**     | Node-based visual diagram editor      |
| **TanStack Query** | Server state management with caching  |
| **Tailwind CSS**   | Utility-first styling                 |
| **Radix UI**       | Accessible component primitives       |
| **Framer Motion**  | Page transitions                      |
| **Wouter**         | Lightweight client-side routing (2KB) |

### Backend

| Technology      | Purpose                                        |
| --------------- | ---------------------------------------------- |
| **Express 5**   | Monolith API server                            |
| **Go 1.26**     | Auth service: sessions, MFA, OAuth, audit      |
| **Argon2id**    | Password hashing (transparent bcrypt upgrade)  |
| **Drizzle ORM** | Type-safe PostgreSQL queries                   |
| **Zod**         | Runtime schema validation                      |
| **Redis**       | Session cache, rate limits, pub/sub revocation |
| **AES-256-GCM** | API key encryption for BYOK AI + MFA secrets   |

### Infrastructure

| Technology         | Purpose                             |
| ------------------ | ----------------------------------- |
| **Docker Compose** | Multi-container orchestration       |
| **NGINX**          | Reverse proxy, static serving, gzip |
| **Vitest**         | Unit and integration testing        |
| **Playwright**     | End-to-end browser testing          |
| **Drizzle Kit**    | Database schema migrations          |

---

## Available Scripts

```bash
# Development
npm run dev                    # Monolith + frontend on :5000
make -C server/services/auth run      # Auth service on :8081 (required — auth
                               # endpoints are served by Go, not Express)
npm run check                  # TypeScript type checking

# Testing
npm run test:run         # Run all tests
npm run test:coverage    # Generate HTML coverage report

# Production
npm run build            # Bundle client + server
npm run start            # Start production server

# Database
npm run db:backup        # verified Postgres + canvas archive; requires BACKUP_S3_URI
npm run diagnose         # Verify required config is present and valid

# Docker
docker-compose up -d     # Start full stack
docker-compose logs -f   # Tail all container logs
docker-compose down -v   # Stop and remove volumes
```

---

## Documentation

Every major system has its own deep-dive guide:

| Document                                                                          | What You'll Learn                                                                                         |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **[Security Architecture](./docs/SECURITY.md)**                                   | Auth flows, IDOR protection, brute-force lockouts, AES-256 encryption, CSRF, rate limiting, PII redaction |
| **[Auth Architecture](./docs/AUTH_ARCHITECTURE.md)**                              | The Go identity service: sessions, MFA, OAuth, threat model, cutover/rollback                             |
| **[Canvas Engine](./docs/architecture/ENGINE.md)**                                | How drag-and-drop works, spatial containment logic, the Postgres upsert sync strategy                     |
| **[Canvas Schema](./docs/architecture/CANVAS_SCHEMA.md)**                         | ReactFlow node/edge structures and canvas data model                                                      |
| **[Canvas Persistence](./docs/architecture/PERSISTENCE.md)**                      | Browser recovery cache plus DynamoDB document persistence                                                 |
| **[Workspace & Collections API](./docs/features/WORKSPACES.md)**                  | REST API reference for workspaces and collections, IDOR pattern, client hooks                             |
| **[AI Engine Guide](./docs/features/JENKOS_AI.md)**                               | Bring-your-own-key AI integration, encryption flow, and API endpoints                                     |
| **[Theming & Design System](./docs/features/THEMING.md)**                         | Dark/light/system modes, CSS variables, brand identity                                                    |
| **[Settings & Privacy](./docs/features/SETTINGS.md)**                             | User profile management, security settings, account controls                                              |
| **[Testing Strategy](./docs/development/TESTING.md)**                             | The testing pyramid, how to run tests, how to write new ones                                              |
| **[AWS Infrastructure (ECS/Terraform)](./docs/infrastructure/INFRASTRUCTURE.md)** | ECS/Fargate + ALB + RDS architecture via Terraform (with EC2 single-node path)                            |
| **[Deployment Runbook](./docs/operations/DEPLOYMENT.md)**                         | Production deploy paths, verification checklist, rollback table                                           |
| **[Secrets Inventory](./docs/operations/SECRETS.md)**                             | Every secret: generation, consumers, rotation & blast radius                                              |
| **[Post-Mortem Log](./docs/archive/process/post-mortem.md)**                      | Production bugs found and fixed, with root cause analysis                                                 |

Historical documents (tickets, investigations, older audits) live in
[`docs/archive/`](./docs/archive).
---

## Deployment Architectures

Meshwork Studio deploys to a single EC2 instance:

1. **Deploy paths**: GitHub Actions on push to `main`, or local `./scripts/deploy.sh` (dist-swap + Go auth binary). Full runbook: [`docs/operations/DEPLOYMENT.md`](./docs/operations/DEPLOYMENT.md).
2. **Topology**: NGINX (TLS, static frontend) → Go auth service :8081 + Node monolith :5000 → Dockerized Postgres ×2 + Redis.
3. **Future ECS path**: an archived Terraform stack lives in `docs/archive/terraform/` if horizontal-scale migration ever becomes a priority.

---

## Security Highlights

This isn't a toy project with `if (loggedIn)` checks. Every security feature is battle-tested:

| Feature                 | Implementation                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| **IDOR Protection**     | Every data endpoint verifies resource ownership — tested with cross-user attack simulations |
| **Brute-Force Lockout** | Progressive delays (1min → 5min → 15min → 30min → 60min) after failed login attempts        |
| **CSRF Protection**     | Double-submit cookie pattern on all 15 state-changing endpoints                             |
| **Rate Limiting**       | 100 req/min globally, 10 req/15min on auth routes                                           |
| **API Key Encryption**  | AES-256-GCM with unique IVs — keys never stored in plaintext                                |
| **PII-Safe Logging**    | Production logs automatically redact emails, passwords, tokens, and API keys                |
| **Input Validation**    | 4-layer defense: Client → Zod → Drizzle ORM → React output encoding                         |
| **Type Safety**         | Zero `any` casts in route handlers — backed by global Express.User type declaration         |

Read the full [Security Architecture](./docs/SECURITY.md) for details.

---

## Project Structure

```
meshwork-studio/
├── client/                      # React frontend
│   └── src/
│       ├── features/workspace/  # Canvas components and utilities
│       ├── hooks/               # React Query hooks
│       ├── lib/                 # secureFetch, CSRF, query client
│       └── pages/               # Route-level page components
├── server/                      # Everything server-side
│   ├── services/
│   │   ├── auth/                # Go identity service (sessions, MFA,
│   │   │                        #  OAuth; api/openapi.yaml inside)
│   │   ├── canvas/  workspace/  # TS domain services
│   │   └── team/  ai/  metrics/
│   ├── auth/                    # Assertion verifier + CSRF (tiny)
│   ├── middleware/              # Rate limiting
│   └── types/
├── client/src/                  # React frontend
├── deploy/                      # Infra artifacts: nginx.conf, user-data, RDS notes
├── docs/operations/              # deployment, EC2, and secrets runbooks
├── scripts/                     # deploy.sh, build.ts, backup-db.ts, guards
├── docs/                        # Deep-dive documentation (+ docs/archive/)
├── docker-compose.yml           # Full stack local orchestration
└── vitest.config.ts             # Test runner configuration
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5434/emnesh_workspace
AUTH_DATABASE_URL=postgresql://user:password@localhost:5433/emnesh_auth

# Auth
SESSION_SECRET=<generate with: openssl rand -base64 32>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>

# AI Encryption (for BYOK feature)
ENCRYPTION_KEY=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">

# CAPTCHA (optional — skipped in development)
HCAPTCHA_SECRET=<from hCaptcha dashboard>
```

---

## License

MIT License. See `LICENSE` for details.

---

<p align="center">
  <strong>Built with TypeScript, secured by design.</strong>
</p>
