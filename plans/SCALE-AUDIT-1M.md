# Scale audit — what stands between Meshwork Studio and 1M concurrent requests

Scope: full-stack read of the running system (Node monolith + Go auth + NGINX +
Postgres ×4 + Redis + DynamoDB), the measured load-test record (240 / 400 / 600
VUs), and the 1M-concurrent target. This document is an audit and a roadmap: it
says what breaks, in what order, what to change, and what to learn. Companion
docs: `plans/AWS-MICROSERVICES-WISH.md` (instance-level wish list) and
`plans/OPTIMIZATION-AUDIT.md` (micro-optimizations).

> **Status (2026-10-20):** measured ceiling today is ~400 concurrent active VUs
> (82 RPS, p95 228 ms, 0 failures) on the `big` profile. The 600-VU stage fails
> p95 because of auth login backpressure (429s), not the API. 1M is a fleet
> architecture problem, not a tuning problem — this doc explains every layer of
> the distance.

---

## 1. Where the system is today (measured)

| Run (big profile) | RPS  | p95      | Failures                | Binding resource                              |
| ----------------- | ---- | -------- | ----------------------- | --------------------------------------------- |
| 240 VUs (t3)      | 60.5 | 35 ms    | 0                       | none (>=240 verdict)                          |
| 400 VUs           | 81.7 | 228 ms   | 0                       | backend 110% of one core, auth 152% of 2      |
| 600 VUs           | 84.2 | 3 966 ms | 0.407% — 72 × login 429 | **auth at 197% of its 2-core cap (~6 log/s)** |

Per-active-user request cadence measured by k6: **~0.2 req/s per active VU**
(82 RPS ÷ 400). Canvas seeded at 40 nodes + 50 edges (90 DDB items + `meta`);
`jitterNodes` mutates ~a handful of nodes per save (`tests/load/k6-lib.js:108`).

Topology today (all in one Docker Compose box):

- **NGINX** (`docker/nginx.conf`) — one config, one instance. Splits
  `/api/v1/(auth|user)/` to Go, everything else to Node, `/ws` to Node.
- **Node monolith** (`server/index.ts:45-46`) — one process, 1.5-core cap,
  hosting workspace + team + canvas + AI + metrics services. WebSocket server
  attached to the same process (`presence.ts:236`).
- **Go auth** — one process, 2-core cap, Argon2id semaphore
  (`internal/password/pool.go`), Redis-backed rate limits and sessions.
- **Postgres** — 4 databases (workspace, team, AI, metrics), each with its own
  Node pool `max: 10` (`server/lib/db.ts:29-34`) ⇒ up to 40 app conns + Go's 10.
- **DynamoDB Local** — canvas documents only (`canvas/db/dynamo.ts`).
- **Redis** — WS pub/sub (`ws:room:<id>`), session revocation, auth sessions,
  Go rate limits.

## 2. The 1M arithmetic

"1M concurrent requests" needs decomposition. Assume 1M concurrent WS-connected
users with 20% actively interacting (typical collaboration/app split):

| Workload                         | Per unit                           | At 200k active (20%)  | At 1M active (pessimistic) |
| -------------------------------- | ---------------------------------- | --------------------- | -------------------------- |
| HTTP RPS (0.2 req/s/active user) | measured                           | **40 000 RPS**        | 200 000 RPS                |
| Cursor/presence messages         | ~0.3 msg/s/user in a room          | 60 000 msg/s in       | 300 000 msg/s in           |
| WS fan-out deliveries            | × (room size − 1), say 10          | **600 000 msg/s out** | 3 000 000 msg/s out        |
| Canvas syncs                     | 25% of HTTP ≈ 0.05/s/user          | 10 000 syncs/s        | 50 000 syncs/s             |
| Canvas items read (90 items/get) | 1 consistent Query per GET         | **3.6M item reads/s** | 18M item reads/s           |
| Logins (14-day session, churn)   | ~1M ÷ (14 × 86 400) ≈ 0.8/s steady | bursts 100s/s         | bursts 1 000s/s            |

The two numbers that kill the current design are **fan-out deliveries** and
**canvas items read per GET**. Everything else is engineering work with known
solutions; those two are architecture.

## 3. Blockers, ranked by how hard they stop 1M

### B1 — Canvas read/write model (hardest data blocker)

Evidence, all verified in code:

- `GET /canvas` runs **one consistent Query over the whole partition**
  (`dynamo.ts:208-240`, called at `:353`). Today 90 items; the schema allows
  5 000 nodes + 10 000 edges (`server/shared/canvas.ts:98-99`) ⇒ 15 000 items
  **per read**, at 2× RCU because `ConsistentRead: true`.
- `syncCanvas` (`dynamo.ts:392-459`) is **5+ sequential DDB round trips**:
  lock PutItem (`:398`), revision GetItem (`:400`), full partition re-query
  (`:414`), batch writes in 25-item chunks (`:437`), revision conditional Put
  (`:441`), lock delete (`:457`). A revision conflict after the lock means the
  client replays.
- No transaction (`TransactWriteItems` nowhere); a batch write success followed
  by a failed revision write leaves items newer than `meta` — recovery relies on
  the next writer's diff.
- Payload: the client sends the **entire canvas** on every save
  (`client/src/pages/Workspace.tsx:920`), not a delta. 15k-item canvas at the
  cap is ~ a multi-MB body every save (JSON body limit is 5 MB,
  `server/index.ts:241`).

At 10k syncs/s and 40k reads/s this model consumes ~3.6M item reads/s and
~60k+ DDB ops/s at _only_ 2% of the 1M target. DynamoDB can be made to do this
(on-demand + huge tables), but not with a whole-partition consistent read per
request, at a cost measured in six figures/month.

**Change path:**

1. **Now (≤1k–10k users):** single-item document (or 1 item + an item per
   ~300 KB chunk) with `ConditionExpression` on revision — one conditional Put
   per save, one GetItem per read. Compress; store node/edge maps as one blob.
   Add `ETag: <revision>` + 304 on GET; cache the document in Redis for 5–30 s
   with revision-keyed invalidation. This is a real code change (~a day) but
   removes the item-per-node model that sets the 1M ceiling.
2. **10k–100k:** per-workspace in-memory document registry on a small fleet of
   "canvas rooms" (one owner per workspace via Redis lock/consistent hash),
   writes append to a per-room log, periodic snapshot to DynamoDB. Reads served
   from memory. This is how Figma/Firebase-class apps do "multiplayer" without
   per-keystroke DB traffic.
3. **→1M:** CRDT (Yjs/Automerge-family) per node subtree + eventually-consistent
   merge; server only relays/merges and persists logs (DynamoDB or S3 + stream).
   Conflict resolution moves from "409 → client replays whole canvas" to
   "merge". The current lock-based optimistic model cannot survive wide
   collaboration (a 20-person room today serializes saves on one TTL lock).

### B2 — One Node process for everything (structural blocker)

- One event loop serves HTTP, WS, AI streaming (SSE), metrics, outbox timer,
  and all four domains. The 1.5-core cap means ~110% of one core maxes it at
  400 VUs; CPU work (JSON of 15k-item canvases, `JSON.stringify` diffing at
  `dynamo.ts:431`) is on that loop.
- Single-instance assumptions, verified:
  - Migrations run **at boot, in parallel, with no advisory lock**
    (`server/routes.ts:43-49`, `server/lib/migrate.ts:43-61`) — two replicas
    racing the same migration = boot failure, not silent corruption.
  - `express-rate-limit` uses the in-memory store (`middleware/rateLimit.ts`)
    — limits are per process, so N replicas multiply them.
  - WS `rooms`, `roleCache`, assertion key maps, introspection negative cache,
    revocation denylist, metrics counters — all module-level per process.
  - Loopback HTTP self-calls assume one app on port 5000
    (`server/lib/internal.ts:26-31`); NGINX upstreams are single targets.
- AI SSE responses pin sockets for up to 45 s (`ai/providers/runtime.ts`) — on
  the same event loop that serves canvas.

**Change path:** split processes per service (the code seam exists — every
service already owns a DB and internal API), run N API replicas behind the
proxy, make migrations a pre-boot job (or advisory-lock `pg_advisory_lock`),
give each replica unique metrics/pprof ports, move all shared state to
Redis/DB. Then give **WebSocket its own fleet** (B3) because connection count,
not CPU, sizes it.

### B3 — WebSocket fan-out and presence (hardest network blocker)

Evidence:

- Fan-out is an O(room) loop of `ws.send` with **no backpressure handling** —
  no `bufferedAmount` check, no drop policy, no batch/coalesce
  (`presence.ts:176-191`). One slow socket or one 500-person room blocks the
  loop for everyone.
- `getPresenceList` reads **only the local process's `rooms` map**
  (`presence.ts:193-198`) — with 2+ replicas, presence rosters are partial.
- Redis pub/sub is used as the cross-instance bus (`presence.ts:68-87`): every
  message is JSON-serialized, published, and re-broadcast by **every** instance
  that subscribed — O(instances) fan-in per message and no sharding/retention.
  At 600k–3M deliveries/s this is a different product (NATS/Redis Cluster
  sharded subjects, per-workspace partitioning), not a config change.
- No server-side cursor rate limit; a buggy client can flood the room
  (`presence.ts:490-511`; client throttles at `use-presence.ts:281` only).
- Canvas ops over WS are relayed but **not persisted** (`presence.ts:539-582`)
  — two collaboration paths (HTTP sync vs WS relay) with different semantics.

**Change path:** dedicated WS gateway fleet; protocol upgrade to **binary
deltas + coalescing** (send latest cursor at 10–20 Hz, not every event);
per-socket send queue with drop-oldest; presence stored in Redis (keyed
`ws:<id>:presence`) and initialized from Redis on join; broker with
subject-per-workspace (NATS) or sharded Redis streams with consumer groups;
admission control per connection (`maxPayload`, per-connection budget); room
ownership so one gateway owns a room's writes.

### B4 — Auth service (today's measured wall)

- 2 cores, `AUTH_HASH_CONCURRENCY=6`, ~3 logins/s/vCPU ⇒ **~6 logins/s**, which
  is why 600 VUs (6.7 logins/s over 90 s) produce 429s and p99 ≈ 10 s
  (`AUTH_HASH_WAIT_MS=10000`).
- Steady-state at 1M users is ~1 login/s, so the _steady_ number is fine — the
  blockers are **bursts** (deploys, mobile reconnect storms, session expiry
  cliffs). The 5-minute assertion TTL (`config.go:213`) means bursty
  introspection traffic as assertions lapse mid-session; Node caches
  negatively/inflight locally only (`server/auth/introspect.ts:38-44`).
- One Go process: those introspects land on the same hash-free but still
  single-process service; no replicas tested.

**Change path:** treat auth as a horizontally scaled fleet (it is nearly
stateless: sessions/lockouts/rate limits already Redis/Postgres-backed);
dedicated login queue per user; at fleet scale, validate at the edge (short-TTL
signed tokens, periodic re-auth) so per-message introspection disappears; keep
Argon2 on the login path only.

### B5 — Postgres and internal HTTP amplification

- Per-service pools `max: 10` (`server/lib/db.ts:29-34`) — 4 pools + Go's 10 ⇒
  ~50 conns/box today; at 20 API replicas that's 1 000 conns, which needs
  PgBouncer/proxy or much smaller pools. Pool sizing is a global math problem,
  not per-service.
- `getWorkspaces` does a **loopback HTTP call to the team service on every
  list** (`workspace/db/storage.ts:154` → `team/db/internal-routes.ts:18-46`),
  then one query; `canAccessWorkspace`/`getWorkspaceRole` are up to 3
  DB/HTTP hops (`team/db/storage.ts:365-470`); workspace internal lookup is N
  queries for N ids (`workspace/db/internal-routes.ts:26-33`); WS join loops
  teams → members (`presence.ts:429-440`). At high RPS this is the second
  largest amplification source after canvas.
- No pagination on `GET /workspaces` (`workspace/db/storage.ts:170-174`).

**Change path:** short-TTL Redis caches for role and shared-workspace-id
results, invalidated on membership events; batch internal lookups
(`inArray` instead of per-id loops); paginate lists; then read replicas and a
connection proxy. At 1M, Postgres becomes **control-plane only** (auth,
membership, metadata) — never per-interaction.

### B6 — Edge (NGINX) and transport

- No upstream `keepalive` (each proxied request opens a new upstream conn) and
  `/api/` sets `Connection: "upgrade"` unconditionally
  (`docker/nginx.conf:54-64`) — keepalive is defeated even if added.
- One NGINX instance, no TLS termination sophistication, no HTTP/2 or 3.
- `/ws` proxy has no `X-Forwarded-For`/`Proto` (`docker/nginx.conf:67-75`).
- `trust proxy = 1` fixed (`server/index.ts:91`) — correct only for exactly one
  fronting proxy; a CDN in front breaks IP-based limiting.

**Change path:** upstream keepalive + correct `Connection` header (S effort),
then move to ALB/NLB (+ CloudFront) with WS termination at the edge, per-zone
redundancy, and HTTP/2. This is configuration, not architecture — do it when
replicas arrive.

### B7 — Fan-in and per-process limits

- Global API limiter is 100/min **per IP, per process**, in memory. Real users
  behind corporate NATs share IPs; the load rig itself is one IP and had to
  raise `API_RATE_LIMIT_MAX`. At fleet scale: Redis sliding window keyed by
  user/session for authenticated routes (the Go service already does this —
  `internal/ratelimit/ratelimit.go`).
- Assertion revocation denylist is a per-process Set fed by pub/sub
  (`server/auth/denylist.ts`): correct only if every instance is subscribed;
  worst case a revoked session lives ≤5 min (assertion TTL).
- Metrics counters/deltas are per process; snapshots from N replicas
  double-count.

### B8 — Data-client hygiene

- DynamoDB client has **no tuning** (`dynamo.ts:41-59`): default socket pool,
  no explicit retry mode/attempts, no request timeout. At 1M-item traffic you
  need `maxSockets`, `retryMode: adaptive`, timeouts, and per-operation
  metrics.
- No caching layer for canvas documents (Redis/DAX) — every read is a DDB read.
- Outbox is safe for replicas (`FOR UPDATE SKIP LOCKED`,
  `workspace/outbox.ts:130-138`) — good; keep it.

## 4. Target architecture at 1M (fleet)

```
CloudFront/edge (TLS, HTTP/2+3, WS passthrough)
   ├── ALB → API fleet (N × stateless Node/Go)        ~40–200k RPS
   ├── NLB → WS gateway fleet (M × connection-dense)  1M sockets, ~20k/box
   │        └── NATS / sharded pub-sub, subject-per-workspace
   ├── auth fleet (stateless, Redis sessions, edge-validated assertions)
   ├── canvas room servers (owner-per-workspace, in-memory doc + CRDT merge)
   │        └── snapshot/log persistence → DynamoDB (S3 offload for big rooms)
   ├── Aurora Postgres (control plane: users, membership, metadata) + replicas
   ├── ElastiCache Redis (presence, roles, caches, rate limits, locks)
   └── S3 + CloudFront (assets, exports, logs)
```

Sizing intuition (from measured per-unit costs): ~20k WS conns/node,
~0.1–0.2 vCPU per 1 000 active HTTP VUs on the _current_ code, so the API fleet
is ~10–40 boxes; the WS gateway fleet is ~50 boxes (conns-bound, mostly idle
CPU); the canvas room fleet is sized by room count and edit rate, not users.
Multi-region = cells of ~100–200k users with regional data, global control
plane. Cost at that scale: $150k–400k/month (see the earlier sketch) — worth
stating because "1M concurrent" is also a budget decision, and long before
that, **load shedding and quotas are features**.

## 5. Staged roadmap (what to change, in order)

| Stage | Trigger (measured)                  | Changes                                                                                                                                                                                                            |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1    | >400 VUs / auth >5 log/s            | Auth replicas + more cores; Redis-backed API rate limiting; nginx keepalive + `Connection` fix; migration advisory lock; unique metrics ports per replica; DDB client tuning.                                      |
| S2    | ~1k–5k concurrent, canvas >1k items | Canvas document model v2: single/chunked item, conditional write, ETag/304, Redis read cache; batch internal lookups; role/shared-id Redis caches; split WS to its own process; presence in Redis.                 |
| S3    | ~10k–50k concurrent                 | WS gateway fleet behind NLB; NATS subject-per-workspace; binary delta protocol + coalescing + backpressure; canvas room servers; RDS replica; CDN; tracing (OTel); k6 operator fleet for reproducible scale tests. |
| S4    | ~100k–1M                            | Cells/multi-region; CRDT sync; sharded persistence; global control plane; SLOs + load shedding + quotas; capacity automation (scale on connections, RPS, lag).                                                     |

Each stage's acceptance test is a load test at the next order of magnitude with
the **failure budget as the pass condition** — not "it survived".

## 6. What to learn (and why, in this codebase's terms)

- **Queueing basics / Little's law** — why 600 VUs turned into 10 s p99 at a
  6 logins/s server; concurrency = rate × latency.
- **Tail latency & coordinated omission** — why p95-first verdicts matter more
  than RPS; how load generators hide stalls.
- **Fan-out math** — recipients × messages/s; when pub/sub is a broadcast storm;
  backpressure (buffers, drop-oldest, coalescing).
- **CRDTs vs OT vs locks** — why revision+lock serializes collaboration and
  what Yjs/Automerge actually solve (merge, not conflict).
- **DynamoDB modeling** — item collections, hot partitions, RCU/WCU math,
  consistent vs eventual reads, on-demand limits, DAX.
- **Postgres at scale** — pool math across replicas, PgBouncer, replicas and
  read-after-write, N+1 detection, index/EXPLAIN discipline.
- **Statelessness & session design** — assertions vs sessions, edge
  validation, revocation propagation, sticky vs stateless WS.
- **Distributed limits & coordination** — Redis sliding windows, locks, leases,
  idempotency, exactly-once illusions.
- **SRE practice** — SLOs, error budgets, load shedding, admission control,
  graceful degradation (the AI SSE path is a nice case study).
- **Observability** — RED/USE metrics, tracing across HTTP/WS, per-operation
  DDB metrics; per-process counters are a trap.
- **Deployment safety** — migrate-before-boot, blue/green, canaries, schema
  compatibility both ways.

## 7. Reusable checklist — "how to scale this properly next time"

1. **Decompose the target**: users → active fraction → RPS, msg/s, items/s,
   bytes/s. If you can't write the arithmetic, you can't size anything.
2. **Find the per-interaction cost** of every request path (round trips × items
   × bytes). Anything O(items-per-user) or O(room) is a time bomb.
3. **Push state out of processes**: no rooms, counters, caches, limiters,
   schedules in module scope unless you're single-instance forever.
4. **One writer per unit of data** (workspace, room, document) — then queues
   along that key; avoid shared locks across network round trips.
5. **Size pools globally**: connections = pools × replicas × services; the DB
   bill arrives before the scale does.
6. **Design for failure**: every dependency gets a timeout, every retry a
   budget, every queue a shed policy.
7. **Make it observable before it's fast**: per-path latency, saturation, and
   queue depth. Load-test at the next order of magnitude, not the current one.
8. **Prefer boring, horizontal primitives**: managed queues/streams, CDN,
   autoscaled stateless fleets; the exotic part should be your product, not
   your plumbing.

## Appendix — measured evidence and code map

- Load-test record: `tests/load/results/capacity-report.md` (400/600 run),
  `plans/LOAD-TEST-T3-SMALL.md` (240 run), `tests/load/k6-capacity.js`.
- Auth wall: `server/services/auth/internal/password/pool.go`,
  `docs/archive/plans/PERF-AUDIT.md`; 600-VU stage failures all
  `login failed status=429`, auth CPU 197/200%.
- Canvas: `server/services/canvas/db/dynamo.ts:208-240` (partition read),
  `:392-459` (sync), `server/services/canvas/routes/canvasRoutes.ts:40,74`,
  `server/shared/canvas.ts:96-102` (caps), `client/src/pages/Workspace.tsx:900,920`
  (3 s debounce, full-payload save).
- WS/presence: `server/services/team/websocket/presence.ts:132` (rooms),
  `:176-191` (fan-out), `:193-198` (local presence), `:68-87` (Redis bus),
  `:385-490` (join), `:490-582` (cursor/canvas relay), `:596+` (authz cache).
- Bootstrap/edge: `server/index.ts:45-46,90-98,241-255`, `docker/nginx.conf:42-75`,
  `deploy/nginx.conf`.
- Data: `server/lib/db.ts`, `server/lib/redis.ts`, `server/lib/internal.ts`,
  `server/services/workspace/db/storage.ts:150-175`,
  `server/services/team/db/storage.ts:365-470`,
  `server/lib/migrate.ts`, `server/services/workspace/outbox.ts`.
- Auth flow: `server/auth/middleware.ts`, `server/auth/introspect.ts`,
`server/auth/assertion.ts`, `server/auth/denylist.ts`,
`server/services/auth/internal/httpapi/*`.
</content>
