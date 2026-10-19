# Optimization Audit — squeezing the box

Scope: caching, indexes, query shape, transport, client payload, and what to
offload (serverless/managed). Evidence: the 10 req/s × 15 min realistic run
(8,130 reqs, p95 20 ms, backend 142 MB / 5.4% CPU) plus code inspection.
Companion doc: `plans/PERF-AUDIT.md` (auth OOM incident + P0 fixes).

> **Status (2026-10-19):** ranked items #1–#3 implemented — saves update the
> React Query cache in place, canvas GET is one consistent Dynamo query, and
> the workspace/auth index migrations are added. Re-running the realistic
> profile is the next verification step.

## Baseline (measured)

| Component      | Actual steady        | Actual peak                                  | Current cap       |
| -------------- | -------------------- | -------------------------------------------- | ----------------- |
| backend-api    | 92–142 MB, 5.4% CPU  | 13% CPU                                      | 2 GB / 1.5 cpu    |
| auth (Go)      | 12–260 MB            | ~600 MB during login wave (now pool-bounded) | 1.5 GB / 1 cpu    |
| postgres       | 75–82 MB, 0.7% CPU   | 4% CPU                                       | 1 GB / 1 cpu      |
| dynamodb-local | 207–210 MB, 4.1% CPU | 19% CPU                                      | 1 GB / 0.5 cpu    |
| redis          | 9 MB                 | 4% CPU                                       | 512 MB / 0.25 cpu |
| nginx/frontend | 6 MB, 0.3% CPU       | 1% CPU                                       | 256 MB / 0.25 cpu |

Total actual ≈ 0.7–1.0 GB, ~11% of one core at 10 req/s. The box is not
compute-bound at this load; the caps are the only thing "using" the 8 GB.
Traffic mix: 45% canvas reads, 15% workspace lists, 20% canvas saves,
10% landing, 10% WS presence.

## Ranked wins

| #   | Change                                                                                                                           | Effort | Expected impact                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| 1   | Stop refetching the whole canvas after every save (client)                                                                       | S      | −1,817 full canvas GETs per 15 min run (≈22% of all requests, ≈33% of canvas reads); removes their DDB+PG work |
| 2   | One DDB partition query for canvas GET instead of 3 calls                                                                        | S      | 3 round trips → 1 on 45% of traffic                                                                            |
| 3   | Index `workspaces(user_id, collection_id, created_at desc)` + `collections(user_id, parent_id)` + `login_attempts(last_attempt)` | S      | List/coll queries stop seq-scanning; stats query stops scanning                                                |
| 4   | Cache shared-workspace ids + workspace role/access in Redis (30–60 s)                                                            | M      | Removes 1 internal HTTP hop + 2 SQL from every workspace list; 3 SQL from shared-user canvas access            |
| 5   | nginx upstream keepalive + fix unconditional `Connection: upgrade`                                                               | S      | One persistent TCP conn per upstream instead of one per request (600 conns/min today)                          |
| 6   | ETag/304 on `GET /canvas` keyed by revision                                                                                      | S      | Repeat loads skip nodes/edges reads + payload entirely                                                         |
| 7   | Team page polling 5 s → 30 s + invalidate on mutation/WS                                                                         | S      | 3 queries × 12/min/tab → ~2/min/tab                                                                            |
| 8   | Images: 3.3 MB of PNGs → WebP/AVIF (build time)                                                                                  | S      | ~70–80% fewer bytes on first landing visit, zero server compute                                                |
| 9   | Right-size container caps to measured usage                                                                                      | S      | Caps 6.25 GB → ~3 GB; headroom for page cache on an 8 GB host                                                  |
| 10  | cache everything else with short TTLs (workspace list, metrics counts)                                                           | M      | Fewer PG round trips at higher RPS                                                                             |
| 11  | Canvas save diff: avoid `JSON.stringify` on every item                                                                           | M      | Less event-loop CPU per save on large canvases                                                                 |
| 12  | Move metrics collector to a cron; prune snapshots                                                                                | S      | Removes 30 s timer + 3 internal HTTP calls + insert from app                                                   |

---

## 1. The big one: canvas save triggers a full re-read

`client/src/hooks/use-canvas.ts:58` — after a successful save the mutation
invalidates `[url]`, and React Query immediately refetches the full canvas
(nodes + edges + revision = 3 DDB calls, one PG row, access check). The save
response already contains the new `revision` and the client just persisted the
exact snapshot the server acknowledged.

Fix: on success, update the query cache locally (`setQueryData`) with the
persisted snapshot + returned revision. Keep the local-cache clear. On 409,
keep the current conflict behaviour (reload).

Why it is safe: the save is revision-gated. If another writer landed first,
this save returns 409; if it succeeded, this snapshot is the newest state.

Measured run: 1,817 saves → 1,817 avoidable canvas GETs. Canvas reads were
~3,659 of 8,130 requests; removing the refetch cuts canvas GET volume by ~33%
and total API calls by ~22%, with no behaviour change.

## 2. Canvas GET: 3 DynamoDB calls → 1

`server/services/canvas/routes/canvasRoutes.ts:70-74` fetches nodes, edges and
revision in parallel; `server/services/canvas/db/dynamo.ts:342,350,246` issues
two paginated `Query`s plus a `GetItem`, all `ConsistentRead: true`. All three
items live in the same partition (`pk = ws#<id>`, `sk = node#… | edge#… |
meta`).

Fix: one `Query` on the partition, split items in memory by `sk` prefix.
Round trips 3 → 1 on 45% of traffic; same RCU (consistency unchanged), less
Node overhead and less tail latency. Keep `ConsistentRead: true` — eventually
consistent reads could return new revision + stale nodes, and the client would
save that stale canvas back.

`syncCanvas` deliberately keeps its dedicated revision `GetItem`
(`dynamo.ts:369`) so a stale save fails before scanning the partition; the
extra call is save-only and cheaper than reading every item on conflict.

## 3. Missing indexes (postgres)

Workspace DB migrations (`server/services/workspace/db/migrations/index.ts`)
create **no indexes** on the hot tables:

- `workspaces.user_id` / `collection_id` — `getWorkspaces`
  (`workspace/db/storage.ts:150-174`) filters `user_id` + `collection_id IS
NULL` and orders by `created_at desc`; `listWorkspaceIdsByOwner` and
  `countWorkspaces` also scan.
- `collections.user_id` / `parent_id` — `getCollections` (`storage.ts:104-112`).

Recommended (new migration `0023_perf_indexes`):

```sql
CREATE INDEX IF NOT EXISTS IDX_workspaces_user_collection_created
  ON workspaces (user_id, collection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS IDX_workspaces_collection_id
  ON workspaces (collection_id);
CREATE INDEX IF NOT EXISTS IDX_collections_user_parent
  ON collections (user_id, parent_id);
```

Auth DB (`server/services/auth/internal/store/migrations/0001_baseline.sql:59`):
`login_attempts` is indexed on `email` only, but
`handleUserStats` (`handlers_stats.go:22-28`) filters `last_attempt >= …`
twice, every 30 s. Add `login_attempts(last_attempt)`.

Existing indexes are otherwise reasonable (team tables, outbox partial index,
metrics `captured_at`, auth sessions/audit). The transitional canvas tables
(`nodes`, `edges`) are dead in production (DynamoDB is the only storage path) —
drop them to save disk and migration noise once the rollback window closes.

## 4. Caching

Redis is already connected in the monolith but only used for WS pub/sub and
auth revocation — nothing is cached. Short-TTL caches with explicit
invalidation are the safe pattern here.

a) **Shared workspace ids** (`workspace/db/storage.ts:154` calls
`fetchSharedWorkspaceIds` — an internal HTTP hop to the team service
(`team/db/internal-routes.ts:18-42`) which runs 2 SQL queries — on EVERY
workspace list). Cache `ws:shared:<userId>` in Redis for 30 s, or maintain a
local mirror updated on share/unshare/join/leave. Invalidate on those
mutations.

b) **Role/access checks**: `canAccessWorkspace` / `getWorkspaceRole`
(`team/db/storage.ts:365,425`) do mirror lookup + 2 queries per call, on every
canvas GET/POST and workspace GET for non-owners. The WS presence layer already
keeps a 60 s in-process role cache (`presence.ts:151-162`); the HTTP path does
not. Move that cache to Redis (`role:<userId>:<workspaceId>`, TTL 30–60 s)
shared by both paths, invalidated on role/membership changes.

c) **Workspace list**: optional `ws:list:<userId>:<collectionId>` TTL 5–10 s,
invalidated on create/update/delete/duplicate/share. Only worth it if the
client stops over-fetching; measure first.

d) **HTTP 304s**: `GET /canvas` can emit `ETag: W/"<revision>"` and answer
`If-None-Match` with 304 after a single revision `GetItem` (skip nodes/edges
and the payload). Same for `GET /workspaces/:id` keyed by `updated_at`.
The client's `staleTime: Infinity` already limits refetches, but reloads and
extra tabs benefit.

e) **Auth**: already good — assertions verified locally (zero I/O), 60 s Redis
session cache (`session/store.go:57`), 10 s negative introspection cache with
in-flight dedup (`auth/introspect.ts:40-41`). Leave as is.

f) **Metrics counts**: `queryMetricsCounts` hits three internal endpoints
(including 4 COUNTs in auth) every 30 s. Cache 60 s or move the collector off
the app process (see §7).

Do NOT cache canvas content server-side without revision-keyed invalidation;
one stale read + save clobbers a collaborator's work. If you do it later, key
by `ws:<id>:rev:<revision>` only.

## 5. Transport / nginx

- `docker/nginx.conf:49-61` sends `Upgrade: $http_upgrade` and
  `Connection: upgrade` on **every** `/api/` request (copied from the WS
  block). Node only treats a connection as an upgrade when the `Upgrade`
  header is present, so it works today — but it prevents upstream keepalive
  and is fragile. Use the standard pattern:

  ```nginx
  map $http_upgrade $connection_upgrade { default upgrade; "" ""; }

  upstream backend { server meshwork-backend:5000; keepalive 32; }
  upstream auth    { server meshwork-auth:8081;    keepalive 16; }

  location /api/ {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    # ...
  }
  location ~ ^/api/v1/(auth|user)/ { ... same keepalive ... }
  location /ws { proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade; ... }
  ```

  Today every proxied request opens a new TCP connection (600/min at 10 rps).
  Keepalive also enables `proxy_next_upstream` retries to mask the ~2 s auth
  container restart window (`proxy_next_upstream error timeout http_502
http_503;`).

- **SSE buffering**: AI chat streams (`aiRoutes.ts:390,423,456,489`) set
  `text/event-stream` but no `X-Accel-Buffering: no`; nginx buffers proxied
  responses by default, so tokens can arrive in bursts. Add the header in the
  route (or `proxy_buffering off;` on a dedicated `/api/v1/ai/` location).
  UX fix, no compute.

- Static assets already cache for 1 y; `index.html` is `no-store`. Add
  `immutable` to the hashed-asset header so browsers skip revalidation.
  `gzip` covers JS/CSS/JSON; no brotli module in nginx:alpine (skip or use a
  different image).

- If you ever deploy without nginx, `server/static.ts:25` uses
  `express.static` with default `maxAge: 0` — hashed assets get revalidated
  every load. Set `maxAge: "1y", immutable: true` for `/assets/*` there too.

## 6. Client payload / bundle

- Images: `web-preview.png` 1.6 MB, `carousel_1.png` 710 KB,
  `carousel_2.png` 651 KB, `auth-hero.png` 364 KB (~3.3 MB). Convert to
  WebP/AVIF at build time (vite-imagetools/sharp) and `loading="lazy"` the
  below-the-fold ones. Biggest first-visit bandwidth win, zero server cost.
- Team page polls 3 endpoints every 5 s (`use-teams.ts:50,67,87`) — while a
  Team tab is open that is 36 req/min for data that changes on user action.
  Raise to 30 s and invalidate on mutations / WS presence events.
- Bundle is already route-split; `Workspace` chunk is 588 KB (React Flow +
  framer-motion). Fine; only revisit if LCP on the workspace route matters.
- Workspace list select returns every column including `ai_context` (possibly
  large text) for the whole list (`storage.ts:171`). Select only list fields
  (id, title, type, icon, isFavorite, collectionId, timestamps, tags,
  canvasCopyStatus). Smaller JSON, less serialization, faster first paint.

## 7. Offload to serverless / managed — verdicts

| Candidate                                    | Verdict                        | Why                                                                                                                   |
| -------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| SPA static hosting (Vercel/Cloudflare Pages) | **Yes**                        | Compute saved ≈ 0 (nginx is 6 MB / 0.3%), but CDN + TLS + one less container; WS/API stay on origin via rewrites      |
| Image transforms                             | **Yes, at build time**         | 3.3 MB → ~0.7 MB with zero runtime cost; no need for an image service                                                 |
| DynamoDB                                     | **Already serverless in prod** | Local DDB (207 MB, 0.5 cpu) exists only for dev/load tests; production uses real DDB                                  |
| Postgres (managed: RDS/Neon/Supabase)        | **Maybe**                      | Removes ~1 cpu / 80 MB from the box but adds network latency to every query; only if the box must shrink below ~2 GB  |
| Metrics collector                            | **Optional**                   | Move to a 1-min cron hitting an internal endpoint; removes a 30 s timer + 3 internal calls + insert. Tiny win         |
| AI streaming proxy                           | **No (for now)**               | Needs auth assertions, BYOK decryption and DB; serverless SSE limits + cold starts. Keep in-process; revisit at scale |
| WebSocket presence                           | **No (for now)**               | Stateful long-lived connections; managed (Ably/Pusher) only if you need multi-region/horizontal scale                 |
| Email sending                                | Already async in Go            | Provider API (Resend/SES) is an ops win, not compute                                                                  |
| Backups                                      | Off-box cron                   | Operational; do not run pg_dump inside the app box under load                                                         |

## 8. Right-sizing the box

Current caps total ≈ 5.5 cpu / 6.25 GB; actual ≈ 11% of a core / 0.7–1.0 GB.
The caps don't reserve memory, but over-cap limits are meaningless and invite
OOM-kill choices under pressure. Suggested envelope (same safety margins):

| Container      | cpu      | memory                            |
| -------------- | -------- | --------------------------------- |
| backend-api    | 1.0      | 768M (`--max-old-space-size=512`) |
| auth           | 0.75     | 1G (pool 4, GOMEMLIMIT 640MiB)    |
| postgres       | 0.75     | 512M (`shared_buffers=128MB`)     |
| dynamodb-local | 0.25     | 512M (`-Xmx384m`)                 |
| redis          | 0.1      | 128M                              |
| nginx          | 0.1      | 64M                               |
| **Σ**          | **~3.0** | **~3.0 GB**                       |

Leaves ~5 GB for page cache/OS on an 8 GB host. On a 2 GB t3.small the t3
profile already sums below that; the auth pool fix (3 slots × 64 MiB) is what
makes the earlier stage-4 death unlikely now — worth re-measuring the t3
ladder before claiming the 2 GB spec is impossible.

Do **not** add a second Node process/cluster yet: one process is at 5% CPU,
and WS room state is in-process. Revisit at >~100 rps or lag p95 > 50 ms.

## 9. Suggested implementation order

1. `use-canvas.ts` save-cache fix (win #1) — one file, no server risk.
2. Single partition query for canvas GET.
3. Workspace/collections/login_attempts indexes (one migration each DB).
4. nginx keepalive + `Connection ""` + `proxy_next_upstream`; SSE header.
5. Redis caches for shared ids and roles (with invalidation).
6. ETag/304 on canvas GET; workspace list slim select.
7. Images to WebP + team polling interval.
8. Right-size compose caps; move metrics collector to cron; retention.

After each batch re-run the realistic profile
(`LOADTEST_BIG=1 ... ./scripts/loadtest.sh --yes --realistic`) and compare
p95 / RPS / per-container CPU / DDB reads. Expected outcome of steps 1–3
alone: ~22% fewer requests, ~60–78% fewer DDB read operations per editing
session, and a workspace list that no longer seq-scans.

## Caveats

- The load rig's k6 "save" traffic is a full-canvas POST every 3 s per VU;
  real users save far less often, so absolute wins scale with editing
  intensity. The _relative_ improvement (no refetch after save) holds.
- Do not switch canvas GETs to eventually-consistent reads.
- Any Redis cache must either be invalidated on the relevant mutation or have
  a TTL short enough that staleness is harmless; workspace visibility is a
  permission boundary.
