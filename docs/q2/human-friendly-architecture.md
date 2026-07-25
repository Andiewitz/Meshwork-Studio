# Human-Friendly Architecture & AI Agent Specification Guide

This document defines the architectural standards, folder structures, migration roadmap, and strict rules of engagement for developing and maintaining Meshwork Studio.

---

## 🎯 Architecture Vision: "Nested Repositories in a Monorepo"

Each service domain (`auth`, `workspace`, `canvas`, `team`, `ai`, `metrics`) lives inside `services/<service-name>/` formatted as if it were an **independent, self-contained repository nested inside the monorepo**.

This design delivers two major outcomes:

1. **Human DX (Developer Experience)**: Instant readability, zero ambiguity, and zero mental overhead.
2. **Zero-Friction Microservices Migration**: Any service can be Dockerized and deployed as a standalone container at any moment without refactoring code logic.

---

## 📂 Target Folder Layout

```
Meshwork-Studio/
├── packages/ (or shared/)
│   └── contracts/                    # Shared Types, Schemas & Validation Contracts
│       ├── src/
│       │   ├── auth.types.ts         # User, Session, Password validation
│       │   ├── workspace.types.ts    # Workspace, Collection schemas & Zod validators
│       │   ├── canvas.types.ts       # Node, Edge schemas & React Flow types
│       │   ├── team.types.ts         # Team, TeamMember, Cursor Color schemas
│       │   ├── metrics.types.ts      # Metrics snapshot schemas
│       │   └── index.ts              # Central export entrypoint
│       └── package.json
│
├── services/                         # Nested Self-Contained Domain Services
│   ├── auth/
│   │   ├── src/
│   │   │   ├── auth.router.ts        # Express Router (/api/v1/auth)
│   │   │   ├── auth.store.ts         # Auth persistence storage & operations
│   │   │   └── index.ts              # Standalone Express Server entry point
│   │   ├── Dockerfile                # Standalone container build config
│   │   ├── .env.example              # Service-specific environment variables
│   │   └── README.md                 # Service documentation & API spec
│   │
│   ├── workspace/
│   │   ├── src/
│   │   │   ├── workspace.router.ts
│   │   │   ├── workspace.store.ts
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   ├── .env.example
│   │   └── README.md
│   │
│   ├── canvas/
│   │   ├── src/
│   │   │   ├── canvas.router.ts
│   │   │   ├── canvas.store.ts
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   ├── .env.example
│   │   └── README.md
│   │
│   ├── team/                         # Team permissions & Real-time WebSockets
│   │   ├── src/
│   │   │   ├── team.router.ts
│   │   │   ├── team.store.ts
│   │   │   ├── team.websocket.ts     # Real-time WebSocket Presence & Redis Pub/Sub
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   ├── .env.example
│   │   └── README.md
│   │
│   ├── ai/
│   ├── metrics/
│   └── gateway/                      # Development & Reverse Proxy Routing
│
├── nginx.conf                        # Production API Gateway configuration
├── docker-compose.yml                # Multi-container local orchestration
└── package.json                      # Monorepo root scripts & dev server
```

---

## 🛣️ 2-Phase Migration Roadmap

### Phase 1: In-Monorepo DX Simplification (Immediate Goal)

- **Execution**: Move `server/modules/<domain>` into `services/<domain>/`.
- **Naming**: Rename ambiguous files to explicit domain names (`auth.router.ts`, `auth.store.ts`).
- **Development**: Single-command development (`npm run dev`) mounts all service routers into Express in-process.
- **Database**: Single fallback pool (`DATABASE_URL`) with support for service override URLs (`AUTH_DATABASE_URL`).
- **Migrations**: Remove all inline raw SQL `CREATE TABLE IF NOT EXISTS` hooks in favor of Drizzle ORM schema files.

### Phase 2: Full Standalone Microservices (Production Goal)

- **Deployment**: Each service in `services/<domain>/` is built into its own Docker container (`docker build -f services/auth/Dockerfile .`).
- **Routing**: NGINX (`nginx.conf`) handles reverse proxying (`/api/v1/auth/` -> `auth-service:5001`).
- **Databases**: AWS RDS PostgreSQL with dedicated logical databases per service.
- **Caching & WebSockets**: AWS ElastiCache (Redis) handles cross-container WebSocket Pub/Sub and presence.

---

## 🤖 Strict AI Agent Guidelines & Rules of Engagement

> [!CAUTION]
> All AI agents working on this codebase **MUST** strictly adhere to the following rules:

### Rule 1: No Ambiguous File Names

- ❌ **NEVER** create ambiguous files like `auth.ts` or `routes.ts` in generic folders.
- ✅ **ALWAYS** use explicit suffixes: `<domain>.router.ts`, `<domain>.store.ts`, `<domain>.types.ts`.

### Rule 2: Zero Inline DDL / Startup SQL

- ❌ **NEVER** write `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE`, or raw SQL schema modification strings in TypeScript files (`db.ts` or `index.ts`).
- ✅ **ALWAYS** define tables using Drizzle ORM schemas (`shared/schema/` or `packages/contracts/`) and run migrations via `drizzle-kit`.

### Rule 3: No Cross-Service Database Joins

- ❌ **NEVER** write SQL `JOIN` queries between tables owned by different domain services (e.g. `workspaces` joined directly with `users`).
- ✅ **ALWAYS** decouple service queries by referencing decoupled string/integer IDs (`userId`, `workspaceId`) or fetching via internal API call/event.

### Rule 4: Self-Contained Service Entrypoints

- ✅ Every service directory (`services/<name>/`) **MUST** contain a standalone `src/index.ts` capable of launching an independent Express server on its dedicated port (e.g., `PORT_AUTH=5001`), while also exporting its Express Router for unified in-process dev mounting.

### Rule 5: Shared Contracts for Client & Server

- ✅ Any TypeScript interface, type, or Zod schema shared between Frontend and Backend **MUST** be declared in `shared/` / `packages/contracts/`.

---

## 🔍 Verification & Quality Assurance

Before committing any changes:

1. `npm run check` (`tsc --noEmit`) must report **0 TypeScript errors**.
2. `npm run test:run` must report **100% passing unit & integration test suites**.
3. Service boundaries must be verified by confirming no direct internal imports exist across service boundaries (`services/auth` must never directly import from `services/workspace`).
