# Solution — canvas performance and capacity

Tracks: [`issue.md`](issue.md) · GitHub
[#48](https://github.com/Andiewitz/Meshwork-Studio/issues/48) · Parent audit:
[`plans/SCALE-AUDIT-1M.md`](../../../plans/SCALE-AUDIT-1M.md)

Status: Phase 2a + 2b implemented · pending real-DynamoDB/S3 and load
verification · Plan commit:
[`7b2d332`](https://github.com/Andiewitz/Meshwork-Studio/commit/7b2d332) ·
2b implementation commit:
[`ae65505`](https://github.com/Andiewitz/Meshwork-Studio/commit/ae65505)
Goal: remove the per-request work that scales with canvas size, then raise the
verified concurrency ceiling in measurable steps. Phase 0 is config-only and
unlocks the next measurement; Phase 2 is the actual fix for the issue.

## Principles

1. Fix the gate before measuring the ceiling. Today the 600-VU stage fails on
   **login throughput**, so it tells us nothing about canvas capacity.
2. Every phase has an acceptance test at a known VU count and canvas size.
3. Prefer O(1) storage operations per request over faster O(N) ones. A
   full-canvas read is still O(N) bytes and parse time — that is expected.
4. Keep the public API stable (`GET/POST /workspaces/:id/canvas`) so the client
   and load tests survive each step.

## Impact summary

| Phase | Change                      | Effort | Expected result                                                |
| ----- | --------------------------- | ------ | -------------------------------------------------------------- |
| 0     | Auth cores + login spread   | hours  | 600 VUs pass; measure 800–1,000                                |
| 1     | Redis access caches         | 1–2 d  | −20–30% backend CPU/request; p95 −30–50 ms                     |
| 2a    | ETag/304 + snapshot cache   | 1 d    | repeat opens = 0 DDB reads                                     |
| 2b    | DDB doc + S3 overflow       | 2–3 d  | GET 1 DDB op (+1 S3 for large); save 1 CAS; 5–10× less CPU/RCU |
| 2c    | Delta saves                 | 2–3 d  | payload O(changes), not O(canvas)                              |
| 3     | WS process split + replicas | 3–5 d  | ~2–4× app ceiling; stops WS blocking HTTP                      |
| 4     | WS gateway + NATS + CRDT    | weeks  | 100k+ (see audit)                                              |

## Phase 0 — Auth capacity and a realistic login burst

The measured auth ceiling is ~3 logins/s/vCPU (6/s on 2 cores). The test logs
`VUs / LOGIN_STAGGER_SEC` users in per second, so 600 VUs at 90 s = 6.7/s >
6/s → 429s. This is a capacity/config issue, not a code issue.

Changes:

- Run auth with **4 vCPU** (`c6i.2xlarge` for the whole box, or a dedicated
  auth instance) and `AUTH_HASH_CONCURRENCY=8–10` while cores allow.
- If replicating auth, put it behind the existing NGINX upstream group; it is
  already stateless enough (sessions, lockouts, rate limits in Redis/Postgres).
- Keep `AUTH_HASH_WAIT_MS` bounded. A 10 s queue produces the observed 10.6 s
  p99; returning 429 + `Retry-After` earlier is better UX at the same
  throughput.
- Fix the test, not reality: production logins spread naturally; the 90 s
  stagger is a stress burst. Keep both scenarios:
  - burst: 600 @ 90 s (capacity of the login path)
  - realistic: 1,000 @ 240 s (capacity of the app)

Commands:

```sh
# Burst gate
LOADTEST_BIG=1 USERS=1200 STAGE_TABLE="600:240" LOGIN_STAGGER_SEC=90 \
  ./scripts/loadtest.sh --yes

# Realistic app ceiling (auth at 4 cores)
LOADTEST_BIG=1 USERS=1200 STAGE_TABLE="800:300 1000:300" LOGIN_STAGGER_SEC=240 \
  ./scripts/loadtest.sh --yes
```

Acceptance: 600 VUs at 90 s passes p95; 800–1,000 at 240 s measured with
`checks` failures = 0 and no auth 429s after the login phase.

## Phase 1 — Remove per-request access amplification

Every canvas request currently does: workspace row, then
`teamStorage.canAccessWorkspace` / `getWorkspaceRole` (up to 3 DB/HTTP hops),
then the canvas read. Workspace list makes a loopback HTTP call to the team
service per request (`workspace/db/storage.ts:154`).

Changes:

- Redis (`server/lib/redis.ts`) caches:
  - `role:<workspaceId>:<userId>` → role, TTL 60 s
  - `sharedws:<userId>` → workspace id list, TTL 60 s
- Invalidate on team/workspace membership mutations (join, leave, role change,
  workspace add/remove, delete) via the existing event bus or direct deletes.
- On Redis outage, fall through to the current DB path (never fail closed).
- Batch workspace lookups: replace the per-id loop in
  `workspace/db/internal-routes.ts:26-33` with one `inArray` query.
- Move API rate limiting to a Redis store keyed by authenticated user/session;
  keep IP keying only for unauthenticated routes.

Acceptance: cache hit rate > 95% on the 400-VU run; backend mean CPU per RPS
down ≥ 20%; p95 at 400 VUs ≤ 180 ms; workspace list makes 0 internal HTTP
calls on a cache hit.

## Phase 2 — Canvas storage v2

### 2a. ETag/304 + revision-keyed cache (ship first, low risk)

- `GET /canvas` returns `ETag: "<revision>"`. If `If-None-Match` matches,
  return 304 with no storage call.
- Cache the serialized snapshot in Redis: `canvas:<workspaceId>:<revision>`,
  TTL 10 min, set after a successful save and on first read.
- `POST` invalidates the previous revision key (new revision is a new key).
- Keep the existing item model as fallback; this phase changes no data.

Implementation: `server/services/canvas/cache.ts` stores
`canvas:<workspaceId>:rev` plus `canvas:<workspaceId>:<revision>` with a 10
minute TTL. Writes use one Redis Lua script so a late writer cannot move the
cached revision backwards. `GET /canvas` returns `ETag`/304 from cache; on a
cache miss it reads storage, caches the snapshot, and can still answer 304.
`POST /canvas` and import update the cache; duplicate and workspace deletion
invalidate the destination. Redis failure falls through to storage.

Acceptance: a reload of an unchanged canvas performs 0 DynamoDB operations;
repeat-open p95 < 50 ms.

### 2b. Document model (the actual fix)

**Storage decision (2026-10-20): DynamoDB is the live document store; S3 is the
overflow/archive tier. Do not use S3 as the hot read/write path.**

```
Small canvas (gzip-compressed document ≤ ~350 KB)
pk = ws#<workspaceId>
sk = doc          { revision, nodes, edges, bytes, updatedAt }

Large canvas (gzip-compressed document > ~350 KB)
pk = ws#<workspaceId>
sk = doc          { revision, s3Key, etag, bytes, updatedAt }
S3: canvases/<workspaceId>/<revision>-<writerId>.json.gz   // immutable per write
```

- **Why DynamoDB for the live doc:** single-digit-ms reads, conditional writes
  give conflict-free CAS on `revision`, no per-object HTTP overhead. The 400 KB
  item cap is why the compressed inline threshold is 350 KB (headroom for DDB
  metadata).
- **Why S3 for overflow:** no item-size limit, cheap durable storage
  (~$0.023/GB-month), versioning gives history, and one GET/PUT request works
  at any object size. It is the cold tier, not the interaction path.
- **Read**:
  - small: consistent `GetItem(doc)` → parse. 1 storage round trip.
  - large: `GetItem(doc)` → `GetObject(s3Key)`. The S3 object is immutable, so
    it is cacheable by `(workspaceId, revision)` and safe to serve to concurrent
    readers.
- **Write**:
  - read `doc`; validate `baseRevision` against `revision`;
  - small: conditional `PutItem(doc, ConditionExpression: revision = :base)`;
  - large: `PutObject` to
    `canvases/<ws>/<rev+1>-<writerId>.json.gz`, then conditional
    `PutItem(doc, { revision, s3Key, etag, bytes }, revision = :base)`;
  - CAS failure → delete the orphan S3 object best-effort and return 409 with
    the current revision; an S3 lifecycle rule sweeps stragglers. Keys include
    a writer UUID so a losing writer never deletes the winner's object;
  - no lock, no full-partition re-read, no per-item diff.
- **Cache/ETag (2a)** sits in front: Redis `canvas:<id>:<rev>` stores the
  serialized bytes; unchanged reads return 304 without touching DDB or S3.
- **History:** S3 versioning retains older revisions; DDB holds only the current
  pointer. Apply an S3 lifecycle policy (IA/expire) so history does not grow
  unbounded.
- **Migration:** feature flag `CANVAS_DOC_MODEL=off|read|on`.
  - `read`: doc first, fall back to the item model.
  - Backfill (`scripts/migrate-canvas-docs.ts`) reads each partition and writes
    the doc (S3 object if >350 KB); it does not delete items.
  - `on`: write path uses docs; keep legacy items for one release as rollback.
  - Delete legacy items only after a full read-back verification.
- **Keep the API shape**; the client can keep sending the full canvas in this
  phase. Error codes stay 409/503 as today.

Complexity (`N` = nodes + edges, `C` = changed items):

| Operation               | Current item-per-node | DDB document | DDB doc + S3 overflow   |
| ----------------------- | --------------------- | ------------ | ----------------------- |
| GET storage operations  | O(N)                  | **O(1)**     | **O(1)** (1 DDB + 1 S3) |
| GET bytes / parse time  | O(N)                  | O(N)         | O(N)                    |
| Save storage operations | O(N) + O(N/25)        | **O(1)**     | **O(1)** (1 S3 + 1 CAS) |
| Save bytes / CPU        | O(N) diff             | O(N)         | O(N)                    |
| Repeat open (ETag/304)  | O(N)                  | **O(1)**     | **O(1)**                |
| Delta upload (2c)       | O(N)                  | O(C)         | O(C)                    |

The document/S3 design is O(1) in **storage operations**, not end-to-end time:
a full-canvas read still transfers and parses O(N) bytes. Delta saves (2c)
shrink the wire payload to O(C), but the server still rewrites the document
(O(N) CPU) until the CRDT/room-server model in Phase 4.

Implementation touch points:

- `server/services/canvas/db/dynamo.ts` — storage modes, doc CAS, gzip
  `GetObject`/`PutObject`, isolated writer keys, best-effort delete for CAS
  losers; `getCanvas`, `syncCanvas`, `getCanvasRevision`, `canvasTableReady`.
  S3 helpers stay in this module rather than a separate `s3.ts`.
- `server/services/canvas/routes/canvasRoutes.ts` — 503 mapping for
  `CanvasDocConfigError`; ETag handling lands in 2a.
- `server/services/canvas/db/model.ts` — storage contract unchanged.
- `server/shared/canvas.ts` — unchanged caps; validate before serializing.

Acceptance (re-run the heavy profile):

- `GET` performs exactly **1 DDB `GetItem`** (≤350 KB compressed) or **1
  `GetItem` + 1 S3 `GetObject`** (larger); zero partition queries.
- `POST` performs exactly **1 conditional DDB write** (≤350 KB compressed) or
  **1 S3 `PutObject` + 1 conditional DDB write** (larger); zero partition
  re-reads.
- 400 VUs with `CANVAS_NODES=400 CANVAS_EDGES=500` passes p95 ≤ 250 ms.
- Canvas RCU per run drops ≥ 10× vs the item model; S3 cost is 1 GET/PUT per
  large read/save plus storage.
- Existing conflict test suite passes; new tests for CAS, the 350 KB overflow
  boundary, orphan cleanup, ETag, and rollback flag.

### 2b implementation notes

- Code: `server/services/canvas/db/dynamo.ts` (modes, gzip doc, S3 overflow,
  CAS), `server/services/canvas/routes/canvasRoutes.ts` (503 on missing S3
  config), `scripts/migrate-canvas-docs.ts` (backfill).
- Flag: `CANVAS_DOC_MODEL=off|read|on` (default `off`).
- Config: `CANVAS_S3_BUCKET`, `CANVAS_S3_PREFIX` (default `canvases`),
  `CANVAS_DOC_INLINE_MAX_BYTES` (default 350 KB), optional `S3_ENDPOINT`.
- In `read` mode, doc reads are only served when the legacy revision is not
  newer; otherwise reads fall back to the item model.
- Rollout: `off` → backfill (`npm run canvas:migrate-docs -- --dry-run`, then
  for real) → `read` → verify → `on`. Backfill preserves the legacy revision;
  rerunning it reconciles a doc that is behind legacy by CAS on the doc
  revision. Quiesce writes before the final reconcile and `on` flip. Rollback:
  quiesce, run `npm run canvas:migrate-docs -- --to-legacy` to rewrite the item
  model from the doc, then set `off`.
- Tests: `tests/unit/canvas/dynamo-doc.test.ts` covers CAS, overflow, fallback,
  read mode, backfill, and S3 deletion; system parity adds document-mode cases.
- Ops: enable S3 versioning + lifecycle (and replication if S3 is the only copy
  of large canvases). The existing `db:backup` archive covers DynamoDB items,
  not S3 objects.
- Pending: run the system parity suite against DynamoDB Local and the heavy
  400-VU profile against real DynamoDB + S3 before flipping `on`.

### 2c. Delta saves (optional, after 2b)

Client sends `{changes: {upserts, deletes}, baseRevision}` instead of the whole
canvas. Server applies the changes to the stored document and still writes one
revision (the wire payload becomes O(edited nodes); server CPU stays O(N) until
Phase 4). Keep full-snapshot saves as a fallback for import/duplicate.

Acceptance: a 2-node edit on a 5,000-node canvas uploads < 20 KB and the server
does the same 1 CAS write.

## Phase 3 — Use the cores and allow replicas

- Split the WebSocket server into its own process/entry point
  (`WORKER_ROLE=http|ws`), same codebase. WS no longer shares the event loop
  with HTTP and AI streaming.
- Run backend replicas behind NGINX:
  - fix `docker/nginx.conf:54-64` to use an `upstream` block with `keepalive`
    and send `Connection: ""` for HTTP (keep `Upgrade` only in `/ws`);
  - add `proxy_next_upstream` for idempotent GETs.
- Move migrations to a pre-boot step or wrap `ensureSchema` in a Postgres
  advisory lock (`pg_advisory_lock`), because parallel boot currently races
  (`server/routes.ts:43-49`).
- Give each replica a unique metrics port, or scrape per-container through the
  existing loopback design.

Acceptance: 2 replicas ≈ 2× the single-process RPS at equal p95; a rolling
restart boots cleanly with no migration race; WS reconnect storm does not move
HTTP p95.

## Phase 4 — Long-term (not part of this issue)

WS gateway fleet + NATS subject-per-workspace + Redis presence + coalesced
binary deltas, then CRDT room servers. Required for 100k+; see
`plans/SCALE-AUDIT-1M.md` §B1/B3. Do not start this before Phases 0–2 are
measured.

## Risks / open questions

- **Cost of migration complexity**: 2b adds a generation/GC path. If canvases
  stay under 400 KB forever, a single-item doc is enough; chunking can wait.
  Decide with production canvas-size percentiles, not the test seed.
- **Cache invalidation**: role/shared-id caches are security-sensitive. Bound
  staleness at 60 s and invalidate on every membership mutation; on Redis
  failure, bypass the cache.
- **ETag + Redis**: ETag must be derived only from revision; never serve a
  cached snapshot under a different revision.
- **Backfill**: run against a copy first; the script must be idempotent and
  safe to interrupt.
- **Login spread**: don't use a longer stagger to claim production capacity.
  Report both burst and steady numbers.

## Verification checklist

1. Unit: CAS conflict, chunk boundary, orphan cleanup, ETag match/mismatch,
   cache invalidation on role change.
2. Integration: existing canvas sync/conflict/import/duplicate tests.
3. Load: baseline (400/90, 90 items) and heavy (400, 400/500 items) runs;
   capture p50/p95/p99, DDB ops, backend CPU.
4. Cost: estimate RCU/WCU for one heavy run; compare with the item model.
5. Rollback: flag off returns to the item model with no data loss.
