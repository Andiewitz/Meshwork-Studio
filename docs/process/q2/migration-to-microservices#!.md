# Target Microservices Architecture Plan

## Architecture Overview (The 3 Core Pillars)

1. **Decoupled Service Containers**:
   - Each domain service (`auth`, `workspace`, `canvas`, `team`, `ai`, `metrics`) is isolated in `server/services/` with its own entrypoint (`standalone.ts`), allowing each to run as an independent container in AWS ECS / Docker.
   - An API Gateway (`gateway`) routes incoming HTTP and WebSocket traffic to the appropriate service containers.

2. **AWS ElastiCache (Redis) for In-Memory WebSockets & Cursors**:
   - Real-time cursor coordinates (`x, y`), presence states, active room sessions, and multi-node event broadcasting are stored in-memory in **AWS ElastiCache Redis**.
   - Ensures sub-millisecond latency for live canvas collaboration and smooth cursor tracking across distributed container instances.

3. **AWS RDS (PostgreSQL) for Centralized Databases**:
   - Dedicated logical databases (`emnesh_auth`, `emnesh_workspace`, `emnesh_canvas`, `emnesh_team`, `emnesh_ai`) hosted on a single **AWS RDS PostgreSQL** instance.
   - Each service container connects to its designated database pool via service-specific connection strings (`AUTH_DATABASE_URL`, `WORKSPACE_DATABASE_URL`, etc.).
   - _(Optional Hybrid)_: Canvas nodes/edges can optionally use **AWS DynamoDB** for high-volume document storage via the pluggable `ICanvasStorage` interface.

---

## User Review & Design Guidelines

> [!IMPORTANT]
>
> - **Zero Breaking Changes for Local Dev**: Local development can still run in unified single-process mode (`npm run dev`) using in-memory fallbacks or local Docker containers.
> - **Clean Service Isolation**: No direct database cross-joins or shared internal storage imports between microservices. Communication occurs via explicit APIs or the Redis Pub/Sub event bus.

---

## Proposed Changes

### 1. Service Directory Structure & NGINX API Gateway (`nginx.conf`)

- **Production API Gateway (NGINX)**:
  - `location /api/v1/auth/` $\rightarrow$ `http://auth-service:5001`
  - `location /api/v1/workspaces/` $\rightarrow$ `http://workspace-service:5002`
  - `location /api/v1/canvas/` $\rightarrow$ `http://canvas-service:5003`
  - `location /api/v1/teams/` & `/ws` (WebSocket Upgrade) $\rightarrow$ `http://team-service:5004`
  - `location /api/v1/ai/` $\rightarrow$ `http://ai-service:5005`
  - `location /health`, `/ready`, `/metrics` $\rightarrow$ `http://metrics-service:5006`
  - Static frontend serving & SPA fallback (`index.html`) + Gzip compression.

- **Express Development Gateway (`server/services/gateway/gateway.ts`)**:
  - For single-command local development (`npm run dev`), Express acts as an in-process gateway routing calls to modular handlers.

- **Domain Microservices**:
  - `server/services/auth` — Auth, users, sessions, OAuth
  - `server/services/workspace` — Workspace metadata, collections
  - `server/services/canvas` — Canvas nodes, edges, position state
  - `server/services/team` — Team memberships, invite codes, permissions, WebSocket server
  - `server/services/ai` — BYOK AI provider proxy & key encryption
  - `server/services/metrics` — Metrics collection & Prometheus endpoint

### 2. Database & Cache Connection Pools

- `server/lib/db.ts` — Isolated database pool factory per service domain connecting to AWS RDS.
- `server/lib/redis.ts` — ElastiCache Redis connection manager supporting Pub/Sub & presence storage.

### 3. Execution & Deployment Setup

- Standalone runners for each service (`npm run dev:auth`, `npm run dev:workspace`, etc.).
- Multi-container Docker Compose file (`docker-compose.microservices.yml`) matching AWS production architecture.

---

## Verification Plan

### Automated Verification

1. Run `npm run check` (`tsc`) to verify type safety across all service boundaries.
2. Run `npm run test:run` to ensure unit & integration test suites pass.

### Manual Verification

1. Verify **Monolith Mode** (`npm run dev`) backward compatibility.
2. Verify **Microservices Mode** container startup and cross-service WebSocket cursor synchronization via ElastiCache.
