# AWS target architecture — microservices wish list

**Status:** Wish list. Not committed work, not a migration plan — a sketch of the
"ideal server" for each service if Meshwork ever leaves the single box.
**Grounding:** measured on the 4 vCPU / 8 GiB local box (big profile) on 2026-10-19:
400 VUs passed (82 RPS, p95 228 ms, 0 failures); 600 VUs fell over on the 2-core
Argon2id login wave (72 × 429, auth at 197% ≈ its cap), not on the API.
**Scope:** instance classes per service, gRPC seams, data-layer targets, and the
triggers that would justify each move. Numbers are order-of-magnitude, us-east-1
on-demand, 2026; verify before budgeting.

---

## 1. What we measured (why any of this is sized the way it is)

| Component                 | Local cap | Peak seen @ 400 | Peak seen @ 600       | Verdict                                                 |
| ------------------------- | --------- | --------------- | --------------------- | ------------------------------------------------------- |
| Backend (Node, 1 process) | 1.5 cpu   | 110% of 1 core  | 117% of 1 core        | Headroom; single-thread is the real wall (~800 VU est.) |
| Auth (Go, Argon2id)       | 2.0 cpu   | 152% of 1 core  | **197% ≈ cap**        | The measured ceiling: ~6 logins/s at t=3, p=2, 64 MiB   |
| Postgres                  | 1.0 cpu   | 16%             | 24%                   | Comfortable                                             |
| DynamoDB Local            | 0.5 cpu   | 53%             | 52%                   | Comfortable; becomes managed DynamoDB in AWS            |
| Redis                     | 0.25 cpu  | 6%              | 10%                   | Comfortable                                             |
| nginx                     | 0.25 cpu  | 13%             | 16%                   | Becomes ALB + CloudFront in AWS                         |
| Event-loop lag            | —         | 34 ms           | 37 ms                 | Node never blocked                                      |
| WebSockets                | —         | 385             | 533 conns, ~820 msg/s | Fine; fan-out already Redis-backed                      |

The box is 4 physical cores; k6 also runs on it. Any AWS plan should put the
load generator on its own machine before trusting an instance-size claim.

---

## 2. Instance-family cheat sheet

| Family     | Optimised for                                         | AWS examples          | Use for                                                              |
| ---------- | ----------------------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| `C`        | Highest clock per vCPU, best price/perf for CPU-bound | `c8g` / `c7i` / `c7g` | Go auth (Argon2id), Node event loop, WS gateway                      |
| `M`        | Balanced CPU/mem/network                              | `m8g` / `m7i` / `m7g` | Backend API, general ECS/EKS nodes                                   |
| `R`        | Memory per vCPU                                       | `r8g` / `r7g` / `r7i` | Postgres (RDS), Redis (ElastiCache)                                  |
| `I` / `Im` | NVMe storage                                          | `i4i`                 | Only if self-managing Postgres (not recommended)                     |
| `T`        | Burstable, credit-based                               | `t4g` / `t3`          | Dev, CI, low-traffic internal tools — never auth under a login storm |
| `G`        | GPU                                                   | `g5` / `g6`           | Not yet; possible future canvas/ML features                          |

Rules of thumb:

- **Graviton (`g` suffix) first.** `c8g`, `m8g`, `r8g` are ~20–40% better
  price/perf; Go and Node both ship arm64 images.
- **Node is single-threaded.** More cores do not speed one process; pick high
  clock (`C`) or run several tasks per node. One Node API process ≈ 1 usable core.
- **Argon2id scales with cores, not clock alone.** Auth wants vCPU count, with
  `AUTH_HASH_CONCURRENCY ≈ 2 × vCPU`.
- **Fargate has no instance choice.** If the target is Fargate/ECS, size tasks
  in vCPU/mem; the instance column below is for ECS-on-EC2 or EKS nodes.

---

## 3. Service-by-service target

| Service                   | Today (local)              | AWS target                                                     | Min / recommended                        | Why                                                     | Scale metric                    |
| ------------------------- | -------------------------- | -------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------- | ------------------------------- |
| Edge / LB                 | nginx container            | ALB (+ CloudFront for SPA)                                     | ALB                                      | HTTP/gRPC routing, TLS, sticky not needed               | LCU / requests                  |
| Frontend (static)         | nginx container            | S3 + CloudFront                                                | S3 + CloudFront                          | No compute; cache everything                            | Cache hit %, 5xx                |
| Backend API (Node)        | 1.5 cpu / 2 GiB, 1 process | ECS task on `m8g.large`–`m8g.xlarge`                           | 2 tasks min across AZs                   | Single-thread wall ~800 VU/process; scale by task count | ALB requests/task, CPU 60%      |
| WS gateway (future split) | bundled in backend         | ECS on `c8g.large` + **NLB**                                   | 2 tasks                                  | Long-lived sockets; network + per-conn memory, not CPU  | Active connections, msg/s       |
| Auth (Go)                 | 2.0 cpu / 1.5 GiB          | ECS on `c8g.large` → `c8g.xlarge`                              | 2 tasks min; `c8g.xlarge` for storm days | CPU-bound Argon2id: 2 vCPU ≈ 6 logins/s; 4 vCPU ≈ 12    | CPU 60%, logins/s, 429 rate     |
| Postgres                  | 1.0 cpu / 1 GiB            | **RDS `db.m7g.large`** + gp3; Aurora Serverless v2 if variable | Multi-AZ, 1 read replica                 | OLTP, small rows; backups/PITR come free                | CPU, connections, replica lag   |
| Redis                     | 0.25 cpu                   | **ElastiCache `cache.r7g.large`**                              | 1 primary + 1 replica, multi-AZ          | Sessions, WS pub/sub, caches                            | CPU, evictions, pub/sub clients |
| DynamoDB                  | Local (0.5 cpu)            | **DynamoDB on-demand**                                         | On-demand table + PITR                   | Canvas blobs; no instances to run                       | Throttles, consumed WCU/RCU     |
| Workers / email (future)  | in-process                 | ECS on `m8g.medium` + SQS                                      | 1 task                                   | Retries/backoff belong in queues                        | Queue depth                     |
| Load generator            | host k6                    | `c7i.xlarge` in its own VPC/subnet                             | On demand                                | Never share cores with the stack under test             | —                               |

Sizing notes:

- **Auth:** 64 MiB/op × concurrency 6 ≈ 384 MiB of hash memory; 1 GiB task is
  fine. Autoscale on CPU 60%, min 2 for AZ survival. A login storm is a burst
  problem — scale-out plus `AUTH_HASH_WAIT_MS` backpressure (429) beats one
  giant instance.
- **Backend:** at 600 VUs the process used ~1.17 cores peak; assume one process
  per vCPU and 2–4 GiB per task. Prefer several small tasks over one big one:
  deploys, blast radius, and the WS fan-out is already Redis-backed.
- **Postgres:** the workload is small; `db.m7g.large` (2 vCPU / 8 GiB) is
  generous. Keep `pgdata` on gp3, PITR on. Move canvas reads/writes to DynamoDB
  (already there) so Postgres stays control-plane only.
- **Redis:** one primary is enough for WS pub/sub; add a replica for failover.
  Cluster mode only if pub/sub channel count or ops/s demands it.
- **DynamoDB:** on-demand; watch for hot partitions on a single viral canvas.
  Consider DAX only if canvas reads ever dominate latency.

---

## 4. gRPC seams

Keep **REST/JSON externally** (browser, integrations) and make **internal hops
gRPC** where fan-out or latency matters. The existing `X-Request-Id` propagation
and the `auth` introspection contract translate directly.

| Hop                         | Today                            | Target                   | Proto sketch                                        |
| --------------------------- | -------------------------------- | ------------------------ | --------------------------------------------------- |
| Backend → Auth              | HTTP `POST /internal/introspect` | gRPC                     | `identity.v1.Identity/Introspect`, `IssueAssertion` |
| WS gateway → Backend        | in-process                       | gRPC server-stream       | `presence.v1.Presence/Subscribe`, `Publish`         |
| Backend → Canvas (if split) | DynamoDB SDK                     | gRPC or SDK              | `canvas.v1.Canvas/Get`, `Sync`                      |
| Workers → Backend           | in-process                       | gRPC (unary)             | `workspace.v1.Workspace/Get`, `ListForUser`         |
| Browser → Backend           | REST via nginx                   | unchanged (REST via ALB) | —                                                   |

gRPC operational notes:

- **LB:** ALB target group with protocol `GRPC` (end-to-end HTTP/2) or NLB with
  h2c for internal-only. gRPC over plain HTTP/2 needs a target group that
  understands it; don't put gRPC behind an HTTP/1.1-only listener.
- **Health:** implement `grpc.health.v1.Health` and point the target group at it;
  keep the existing `/health` for humans.
- **Connection lifecycle:** enable keepalive (`Time=30s`, `Timeout=10s`) and
  `MAX_CONNECTION_AGE` (e.g., 10 min) so clients rebalance onto new tasks;
  otherwise long-lived HTTP/2 streams pin to one task and skew load.
- **Deadlines:** the Node introspection timeout is 4 s today; carry that as a
  gRPC deadline and fail closed, same as the current middleware.
- **Client-side balancing:** `dns:///auth.internal:50051` with round-robin, or
  xDS/App Mesh/ECS Service Connect if you want it managed.
- **Retries:** retry only idempotent calls (`Introspect`, `Get`), never `Sync`.
- **Browser:** do not expose gRPC directly; if the SPA ever needs it use
  grpc-web/Connect behind the same ALB. REST is fine for now.
- **Tracing:** gRPC metadata carries `x-request-id` verbatim — the existing
  join between Node and Go logs keeps working.

Suggested repo layout when it happens:

```
proto/
  identity/v1/identity.proto
  presence/v1/presence.proto
  canvas/v1/canvas.proto
```

Codegen into `server/src/gen` (Node, `@grpc/grpc-js`) and
`server/services/auth/internal/gen` (Go, `google.golang.org/grpc`). Check the
generated stubs in; don't generate at container start.

---

## 5. Autoscaling defaults

| Service    | Metric                            | Target           | Min | Max (initial) |
| ---------- | --------------------------------- | ---------------- | --- | ------------- |
| API tasks  | ALB `RequestCountPerTarget`       | 800 req/min/task | 2   | 8             |
| API tasks  | CPU utilisation                   | 60%              | 2   | 8             |
| Auth tasks | CPU utilisation                   | 60%              | 2   | 8             |
| Auth tasks | Custom `logins/s` per task        | 5                | 2   | 8             |
| WS gateway | `ActiveConnections` per task      | 8,000            | 2   | 20            |
| Workers    | SQS `ApproximateNumberOfMessages` | 100/task         | 1   | 4             |

Scale-in cooldowns: 300 s for auth/API (login storms come in waves), 120 s for
workers. Always keep one task per AZ.

---

## 6. Migration phases (extract along measured seams)

1. **Phase 0 — stay single box.** 400 VUs / 82 RPS is enough for launch; add
   auth CPU if login storms hurt.
2. **Phase 1 — lift to AWS.** Same compose topology on ECS: ALB + S3/CloudFront,
   RDS, ElastiCache, DynamoDB on-demand. No code splits. This is where auth
   gets its own task and a real autoscaling group.
3. **Phase 2 — split WS gateway.** Highest value: isolates long-lived sockets
   from request/response traffic, enables NLB + connection-based scaling. Needs
   the Redis presence registry (the initial `getPresenceList` is still local in
   `presence.ts`) and gRPC or Redis between API and gateway.
4. **Phase 3 — split canvas service.** Only if DynamoDB/DAX tuning inside the
   monolith isn't enough; moves canvas sync + conflict handling out.
5. **Phase 4 — split domains** (teams, workspaces, billing) as team size and
   deploy cadence demand, not before.

Triggers that justify leaving the box:

| Signal               | Threshold                                 |
| -------------------- | ----------------------------------------- |
| Sustained active VUs | > 400 at p95 ≤ 300 ms                     |
| Login rate           | > 5/s sustained or > 20/s burst           |
| API RPS              | > 150 sustained on one process            |
| WS connections       | > 5,000 per instance                      |
| Deploy blast radius  | one team's change needs whole-box restart |

---

## 7. Rough monthly cost sketch (on-demand, us-east-1)

| Piece             | Spec                                | ~USD/mo      |
| ----------------- | ----------------------------------- | ------------ |
| ALB               | 1 ALB + LCU                         | 25–40        |
| API               | 2 × `m8g.large` tasks (EC2)         | 110–140      |
| Auth              | 2 × `c8g.large` tasks               | 100–120      |
| RDS Postgres      | `db.m7g.large` Multi-AZ + 50 GB gp3 | 200–260      |
| ElastiCache Redis | `cache.r7g.large` + replica         | 150–190      |
| DynamoDB          | on-demand, modest canvas traffic    | 10–40        |
| S3 + CloudFront   | SPA + assets                        | 5–20         |
| **Total**         |                                     | **~600–800** |

Aurora Serverless v2 can cut the Postgres line for low-traffic periods; Graviton
and 1-year commitments cut 20–40% across the board. This excludes the load
generator and data transfer.

---

## 8. Non-goals / open questions

- **Not a rewrite.** Extract along measured seams; the monolith's Redis WS
  fan-out and auth assertion fast path are already service-shaped.
- **REST stays the external contract.** gRPC is internal only.
- **Postgres and DynamoDB stay.** No database migration is implied.
- **Open:** single-tenant vs pooled auth databases; whether WS gateway should
  own presence registry writes; DAX vs ElastiCache for canvas reads; whether
  Fargate's simplicity beats EC2's instance choice for auth.
