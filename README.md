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
- **⚡ Smart Sync** — Canvas documents are validated and persisted in DynamoDB, with browser recovery for interrupted edits
- **🔐 Security Hardened** — IDOR protection, brute-force lockouts, CSRF tokens, rate limiting, and PII-safe logging
- **📁 Workspaces & Collections** — Organize diagrams into projects with nested folder structures
- **🎭 Dark/Light Themes** — Full theme support
- **🐳 Docker-Ready** — One command to launch the full stack with NGINX, Postgres, and the app

---

## Architecture

```
┌────────────────────┐     ┌────────────────────┐     ┌────────────────────┐
│   CLIENT LAYER     │     │   NGINX GATEWAY    │     │   API SERVER       │
│   (React + Vite)   │◄───►│   (Host :5000)     │◄───►│   (Express)       │
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

- **Docker Desktop** for the supported local stack
- **Node.js 20.19+** and npm 10+ for repository commands

### Option 1: Docker (Full Stack)

```bash
git clone https://github.com/Andiewitz/Meshwork-Studio.git
cd Meshwork-Studio
npm ci
npm run setup
docker compose up --build
# Visit http://localhost:5000
```

`npm run setup` generates local-only credentials and configuration in ignored
`.env`. Docker starts the Node app, Go identity service, PostgreSQL, Redis,
DynamoDB Local, and NGINX together. No AWS account or AI provider key is needed
for this local flow.

### Option 2: Native Node/Go Development

Use this when changing server code with hot reload. Docker still supplies the
data services; the Go identity service is required for login.

```bash
npm ci
npm run setup
docker compose up -d emnesh-postgres emnesh-dynamodb-local emnesh-redis
make -C server/services/auth run
# In another terminal:
npm run dev
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
npm run test:system      # DynamoDB/WebSocket tests; requires DynamoDB Local
npm run test:coverage    # Generate HTML coverage report

# Production
npm run build            # Bundle client + server
npm run start            # Start production server

# Database
npm run db:backup        # verified Postgres + canvas archive; requires BACKUP_S3_URI
npm run diagnose         # Verify required config is present and valid

# Docker
docker compose up --build # Start full stack
docker compose logs -f    # Tail all container logs
docker compose down       # Stop containers and retain data volumes
```

Use `docker compose down -v` only when you deliberately want to erase local
PostgreSQL, Redis, and DynamoDB data.

---

## Documentation

Every major system has its own deep-dive guide:

| Document                                                                                  | What You'll Learn                                                                                         |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **[Security Architecture](./docs/SECURITY.md)**                                           | Auth flows, IDOR protection, brute-force lockouts, AES-256 encryption, CSRF, rate limiting, PII redaction |
| **[Auth Architecture](./docs/AUTH_ARCHITECTURE.md)**                                      | The Go identity service: sessions, MFA, OAuth, threat model, cutover/rollback                             |
| **[Canvas Engine](./docs/architecture/ENGINE.md)**                                        | How drag-and-drop works, spatial containment logic, and validated canvas synchronization                  |
| **[Canvas Schema](./docs/architecture/CANVAS_SCHEMA.md)**                                 | ReactFlow node/edge structures and canvas data model                                                      |
| **[Canvas Persistence](./docs/architecture/PERSISTENCE.md)**                              | Browser recovery cache plus DynamoDB document persistence                                                 |
| **[Workspace & Collections API](./docs/features/WORKSPACES.md)**                          | REST API reference for workspaces and collections, IDOR pattern, client hooks                             |
| **[AI Engine Guide](./docs/features/JENKOS_AI.md)**                                       | Bring-your-own-key AI integration, encryption flow, and API endpoints                                     |
| **[Theming & Design System](./docs/features/THEMING.md)**                                 | Dark/light/system modes, CSS variables, brand identity                                                    |
| **[Settings & Privacy](./docs/features/SETTINGS.md)**                                     | User profile management, security settings, account controls                                              |
| **[Testing Strategy](./docs/development/TESTING.md)**                                     | The testing pyramid, how to run tests, how to write new ones                                              |
| **[Infrastructure Topology](./docs/infrastructure/INFRASTRUCTURE.md)**                    | Current single-EC2 topology, private dependencies, and measured growth triggers                           |
| **[Deployment Runbook](./docs/operations/DEPLOYMENT.md)**                                 | Production deploy paths, verification checklist, and rollback                                             |
| **[CI/CD Operations](./docs/operations/CI_CD.md)**                                        | Required CI gates, promotion, releases, and failure triage                                                |
| **[Secrets Inventory](./docs/operations/SECRETS.md)**                                     | Every secret: generation, consumers, rotation & blast radius                                              |
| **[Observability](./docs/operations/OBSERVABILITY.md)**                                   | Health, metrics, logs, alert policy, and first response                                                   |
| **[Recovery](./docs/operations/RECOVERY.md)**                                             | Off-host archive, restore drills, and production recovery safeguards                                      |
| **[Historical Credential Response](./docs/operations/HISTORICAL-CREDENTIAL-RESPONSE.md)** | Private rotation and verification procedure for an exposed historical secret                              |
| **[Post-Mortem Log](./docs/archive/process/post-mortem.md)**                              | Production bugs found and fixed, with root cause analysis                                                 |

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

Security controls are covered by focused unit, integration, and Go-service tests:

| Feature                 | Implementation                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| **IDOR Protection**     | Every data endpoint verifies resource ownership — tested with cross-user attack simulations |
| **Brute-Force Lockout** | Progressive delays (1min → 5min → 15min → 30min → 60min) after failed login attempts        |
| **CSRF Protection**     | Double-submit cookie pattern on all 15 state-changing endpoints                             |
| **Rate Limiting**       | 100 req/min globally, 10 req/15min on auth routes                                           |
| **API Key Encryption**  | AES-256-GCM with unique IVs — keys never stored in plaintext                                |
| **PII-Safe Logging**    | Production logs automatically redact emails, passwords, tokens, and API keys                |
| **Input Validation**    | 4-layer defense: Client → Zod → Drizzle ORM → React output encoding                         |
| **Type Safety**         | TypeScript contracts and runtime validation at API boundaries                               |

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

Run `npm run setup` to generate a complete local `.env`, or copy
[`.env.example`](./.env.example) when integrating an existing development
environment. Production configuration is separate: use a secret manager and the
[secrets inventory](./docs/operations/SECRETS.md), never the generated file.

---

## Community & Contributing

- **[Contributing Guide](./CONTRIBUTING.md)** — Setting up local dev, testing standards, and pull request workflow
- **[Code of Conduct](./CODE_OF_CONDUCT.md)** — Our community standards and expectations
- **[Security Policy](./SECURITY.md)** — Responsible vulnerability reporting and security SLAs

---

## Trademarks & Disclaimers

All product names, logos, brands, and registered trademarks (including AWS, Google Cloud, Docker, Oracle, Kubernetes, Redis, GitHub, and others) displayed or referenced in this project are the property of their respective owners. Their inclusion in diagramming nodes, templates, and documentation is strictly for technical architecture visualization and educational purposes and does not imply endorsement, affiliation, or sponsorship.

---

## License

Meshwork Studio is open-source software licensed under the [MIT License](./LICENSE).

---

<p align="center">
  <strong>Built with TypeScript, secured by design.</strong>
</p>
