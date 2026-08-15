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
│ • React 18         │     │ • Reverse Proxy    │     │ • Passport.js Auth │
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
npm run dev
# Visit http://localhost:5000

# Dev login:  test@example.com / Test123!@#
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

| Technology      | Purpose                           |
| --------------- | --------------------------------- |
| **Express 5**   | API server                        |
| **Passport.js** | Multi-strategy authentication     |
| **Drizzle ORM** | Type-safe PostgreSQL queries      |
| **Zod**         | Runtime schema validation         |
| **bcrypt**      | Password hashing (12 salt rounds) |
| **AES-256-GCM** | API key encryption for BYOK AI    |

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
npm run dev              # Start the dev server (API + frontend)
npm run check            # TypeScript type checking (must pass with 0 errors)

# Testing
npm run test:run         # Run all tests
npm run test:coverage    # Generate HTML coverage report
npm run test:lockout     # Run auth lockout tests specifically

# Production
npm run build            # Bundle client + server
npm run start            # Start production server

# Database
npm run db:generate      # Generate new migration files from schema changes
npm run db:migrate       # Apply pending migrations to the database
npm run db:push          # Push schema changes directly (dev shortcut, no migration files)

# Docker
docker-compose up -d     # Start full stack
docker-compose logs -f   # Tail all container logs
docker-compose down -v   # Stop and remove volumes
```

---

## Documentation

Every major system has its own deep-dive guide:

| Document                                                           | What You'll Learn                                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **[Security Architecture](./docs/SECURITY.md)**                    | Auth flows, IDOR protection, brute-force lockouts, AES-256 encryption, CSRF, rate limiting, PII redaction       |
| **[Canvas Engine](./docs/ENGINE.md)**                              | How drag-and-drop works, spatial containment logic, the Postgres upsert sync strategy                           |
| **[Canvas Persistence](./docs/PERSISTENCE.md)**                    | The offline-first localStorage cache layer, debounced auto-save, and edge normalization fix                     |
| **[Workspace & Collections API](./docs/WORKSPACES.md)**            | Full REST API reference for workspaces and collections, IDOR pattern, client hooks                              |
| **[AI Engine Guide](./docs/AI_ENGINE.md)**                         | Bring-your-own-key AI integration, encryption flow, and API endpoints                                           |
| **[Theming & Design System](./docs/THEMING.md)**                   | Dark/light/system modes, neo-brutalist CSS utilities, brand identity                                            |
| **[Testing Strategy](./docs/TESTING.md)**                          | The testing pyramid, how to run tests, how to write new ones                                                    |
| **[AWS Infrastructure (ECS/Terraform)](./docs/INFRASTRUCTURE.md)** | Production ECS/Fargate + ALB + RDS + Redis architecture via Terraform (with EC2 single-node emergency fallback) |
| **[NGINX Architecture](./docs/NGINX_ARCHITECTURE.md)**             | Why NGINX sits in front of Express, SPA routing, caching                                                        |
| **[Settings & Privacy](./docs/SETTINGS.md)**                       | User profile management, account deletion, data export                                                          |
| **[Database Backup & Restore](./docs/BACKUP.md)**                  | How to back up both Postgres databases and restore from a dump                                                  |
| **[Security Audit Report](./docs/AUDIT_REPORT.md)**                | The original security audit and critical fixes implemented during hardening                                     |
| **[Post-Mortem Log](./docs/post-mortem.md)**                       | Every production bug we've found and fixed, with root cause analysis                                            |

---

## Deployment Architectures

Meshwork Studio supports two deployment workflows:

1. **Production (Canonical)**: **AWS ECS / Fargate behind an Application Load Balancer** with Amazon RDS Multi-AZ PostgreSQL, ElastiCache Redis, and S3/CloudFront static assets managed via declarative Terraform in `terraform/`. Security groups enforce strict SG-to-SG isolation (RDS/Redis accessible only from ECS; ECS accessible only from ALB).
2. **Single-Node / Emergency Fallback**: Automated bash and systemd/PM2 scripts in `deploy/` for running the entire stack (NGINX reverse proxy + Node.js API + local DB) on a single EC2 instance for rapid evaluation or disaster recovery.

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
├── server/                      # Express backend
│   ├── modules/
│   │   ├── auth/                # Passport strategies, lockout, CAPTCHA
│   │   ├── canvas/              # Node/edge storage with upsert sync
│   │   ├── workspace/           # Workspace CRUD with IDOR checks
│   │   └── ai/                  # BYOK encryption and AI proxy
│   ├── middleware/              # CSRF, rate limiting
│   └── types/                   # Express.User type augmentation
├── terraform/                   # Production ECS/RDS/Redis/ALB IAC
├── deploy/                      # Single-node EC2 deployment & NGINX scripts
├── shared/                      # Drizzle schema + Zod validators
├── tests/
│   ├── unit/                    # Pure logic tests
│   ├── integration/             # HTTP route tests with Supertest
│   └── e2e/                     # Playwright browser tests
├── docs/                        # Deep-dive documentation
├── docker-compose.yml           # Full stack local orchestration
├── vitest.config.ts             # Test runner configuration
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
