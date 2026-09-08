# Codebase reliability, observability, and recovery audit

**Audited:** 2026-09-08  
**Baseline:** `main` at `10b93472c6091b5551f498f8c6015bb504d0d975`, plus the current uncommitted working tree  
**Runtime target:** one AWS EC2 `t3.small` running the Node application and Go identity service  
**Scope:** application code, persistence, authentication, AI integrations, process lifecycle, deployment, telemetry, backups, tests, and operating cost

This is an audit and implementation backlog, not a claim that the listed repairs
are already complete. It supersedes broad reliability statements in the older
root plan where the current code is more specific. The dedicated
[CI/CD audit](CI-CD-AUDIT.md) remains the deeper pipeline reference.

## Executive decision

Do not optimize infrastructure or add another platform layer before protecting
canvas data. The current system has multiple independent paths that can report a
successful save while data is missing, overwrite the root canvas with a nested
view, or lose concurrent edits. The repository also lacks a backup process that
covers the current database-per-service topology and DynamoDB.

The first release should therefore be a **data-safety release**. Its exit gate is:

1. A save either commits the exact revision or visibly fails; it never silently
   accepts an incomplete DynamoDB batch.
2. All DynamoDB pages are read before a snapshot is returned or diffed.
3. Nested-canvas navigation cannot persist the nested view as the root document.
4. Stale writers receive a conflict instead of overwriting a newer revision.
5. PostgreSQL and DynamoDB restores have both been exercised in an isolated target.

## Audit boundaries and confidence

- `npm run check` passed.
- The 24 Node unit-test files passed: 233 tests.
- `go test ./...` passed. Several important Go packages, including `internal/httpapi`,
  `internal/ratelimit`, `internal/captcha`, and `internal/email`, currently have no
  test files.
- Two isolated, in-memory probes reproduced the DynamoDB defects: a response with
  `LastEvaluatedKey` resulted in one query only, and a batch returning every item in
  `UnprocessedItems` still resolved successfully. No AWS data was touched.
- Isolated probes also reproduced the multi-tool Jenkos overwrite and Anthropic
  SSE chunk-boundary loss described below. No provider request was made.
- Live AWS settings, current database placement, disk/RAM use, CloudWatch alarms,
  RDS retention, DynamoDB PITR, S3 retention, secret custody, and actual restore
  times were not accessible from the repository. They are verification tasks, not
  assumed facts.
- Existing user changes were preserved. No production operation or code fix was
  performed during this audit.

## Priority register

| ID  | Priority | Area               | Confirmed condition                                                          | Primary consequence                                              |
| --- | -------- | ------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| D01 | P0       | DynamoDB writes    | `BatchWriteItem.UnprocessedItems` is ignored                                 | Save reports success with missing writes/deletes                 |
| D02 | P0       | DynamoDB reads     | Node and edge queries read one page only                                     | Canvases above the 1 MB page boundary load truncated             |
| D03 | P0       | Nested canvases    | Autosave persists the displayed sub-canvas as the root                       | Entering a node can erase the visible root after three seconds   |
| D04 | P0       | Concurrency        | Full snapshot sync has no revision precondition                              | Two tabs/users silently overwrite each other                     |
| B01 | P0       | Backups            | Backup script covers one obsolete PostgreSQL layout and no DynamoDB          | No demonstrated recovery from the data-loss paths above          |
| A01 | P1       | Auth key boundary  | Node receives an Ed25519 private seed under a public-key name                | Node compromise can mint auth assertions                         |
| A02 | P1       | Auth flows         | CAPTCHA consumes the registration body; email verification drops token/CSRF  | Production auth features fail when enabled                       |
| A03 | P1       | Auth availability  | Redis startup failure logs fail-closed but installs a nil, fail-open limiter | Brute-force controls disappear after a transient boot failure    |
| A04 | P1       | Sessions/WebSocket | Open sockets only check an in-memory revocation set                          | Missed revocations and natural expiry can remain authorized      |
| R01 | P1       | Readiness          | Listener and `/health` can stay up after module initialization fails         | Deployment or monitoring can call a broken release healthy       |
| R02 | P1       | Lifecycle          | Node has no graceful shutdown or fatal-process handlers                      | Requests, streams, and writes can be cut off on restart          |
| R03 | P1       | Cross-store events | Delete/duplicate side effects are in-memory and non-durable                  | Orphaned canvases, blank duplicates, or premature deletion       |
| C01 | P1       | Client recovery    | An older successful save clears the newest local recovery copy               | Tab close/crash can lose unsent edits                            |
| I01 | P1       | AI cost            | Suggestions bypass AI limiters and run on every canvas-size change           | Unbounded provider spend and avoidable host/provider load        |
| I02 | P1       | AI correctness     | Models/tokens are not server-bounded; stream failures are mishandled         | Cost spikes, hung requests, false success, broken SSE            |
| I03 | P1       | Jenkos edits       | Multiple edit tools each start from the original canvas                      | Earlier tool edits vanish from the final result                  |
| P01 | P1       | Deployment         | Artifacts and dependencies mutate the active release in place                | Mixed releases, downtime, and no automatic rollback              |
| O01 | P1       | Metrics            | Latency math sums cumulative buckets and only one `_sum` series              | Dashboard latency is materially wrong                            |
| O02 | P1       | Cardinality        | Unmatched Node/Go paths and arbitrary model names become labels              | Memory growth and unusable telemetry under random input          |
| O03 | P2       | Traceability       | No Node request context, release ID, redaction policy, or source maps        | Production traceback cannot be joined across services/builds     |
| O04 | P2       | Host visibility    | Repo has no enforced memory/disk/CPU-credit alarms                           | t3.small saturation and disk exhaustion arrive silently          |
| R04 | P2       | Redis recovery     | Node stops reconnecting after five tries and retains the dead singleton      | Transient outage can require a process restart                   |
| R05 | P2       | Database limits    | Four Node pools allow 40 connections; Go allows 10, without query timeouts   | Small-host/RDS overload and indefinite query occupancy           |
| R06 | P2       | API errors         | Unknown production GETs fall through to the SPA                              | API typos return HTML/200 instead of a diagnosable JSON 404      |
| T01 | P2       | Test gaps          | Green CI misses real Go HTTP, recovery, paging, races, and restore drills    | Regressions pass despite core flows being broken                 |
| H01 | P2       | Documentation      | Marketing/runbooks promise redaction, atomic deploys, and obsolete backups   | Operators make decisions from behavior the code does not provide |

`P0` means block normal feature work and deployment. `P1` belongs in the next
reliability iterations. `P2` is important hardening after the data path is safe.

## Detailed findings and repair contracts

### D01 — incomplete DynamoDB batches are acknowledged as successful

[`dynamo.ts`](../server/services/canvas/db/dynamo.ts) lines 165–179 sends each
25-item batch once and discards the response. DynamoDB documents that a batch is
not atomic and may return failed writes in `UnprocessedItems` while the request
itself succeeds. The current route then returns success and
[`use-canvas.ts`](../client/src/hooks/use-canvas.ts) lines 41–43 deletes the local
recovery copy.

Repair:

- Loop only over returned unprocessed requests, with capped exponential backoff
  and jitter.
- Bound attempts and elapsed time. If anything remains, throw a typed
  `CANVAS_PARTIAL_WRITE` error and retain local recovery data.
- Record requested, processed, retried, exhausted, and throttled item counts.
- Include a save operation ID in logs; never log canvas bodies.
- Test partial success, repeated throttling, eventual success, exhausted retries,
  and a mixed put/delete batch.

Acceptance: a synthetic all-unprocessed response cannot resolve the mutation or
clear the recovery cache.

Reference: [AWS BatchWriteItem API](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchWriteItem.html).

### D02 — paginated canvases are truncated and can later be deleted

[`getNodes`](../server/services/canvas/db/dynamo.ts) lines 183–199 and
[`getEdges`](../server/services/canvas/db/dynamo.ts) lines 202–218 each issue one
query. DynamoDB Query pages are at most 1 MB and require the response's
`LastEvaluatedKey` to be supplied as the next request's `ExclusiveStartKey`.
The file already contains a correct paginator at lines 145–162, but these reads
do not use it.

The destructive chain is: load one page, let a user edit that partial result,
then call the full-snapshot diff at lines 221–255. The sync can delete stored
items omitted from the partial client snapshot.

Repair:

- Use one tested paginator for all partition/prefix reads.
- Add a maximum canvas size with a specific error rather than returning partial
  success; page internally, not in the public snapshot contract.
- Add a fixture whose nodes and edges span multiple pages and verify exact parity.
- Until this ships, reject snapshot deletion when the submitted base revision is
  absent or not current.

Acceptance: a multi-page read returns every item, and saving it produces zero
unexpected deletes.

Reference: [AWS DynamoDB query pagination](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.Pagination.html).

### D03 — nested navigation can autosave a sub-canvas as the root

[`Workspace.tsx`](../client/src/pages/Workspace.tsx) lines 607–646 moves the root
canvas into an in-memory `canvasStack` and replaces top-level `nodes`/`edges` with
the selected node's sub-canvas. The unconditional autosave at lines 861–895 and
manual save at lines 1115–1140 both send those displayed arrays to the root
workspace endpoint. Enter an empty expandable node, wait for the three-second
debounce, and the root snapshot can be replaced with an empty one.

Repair:

- Define one canonical root document. Navigation state must be a view into that
  document, not the value passed to root persistence.
- Fold every active stack level and current nested edits back into the canonical
  root before local or server persistence.
- Cancel/flush the correct generation during enter/exit transitions.
- Add browser tests for enter-wait-refresh, nested edit-save-refresh, multi-level
  jumps, manual save while nested, and closing during a transition.

Acceptance: root IDs and all nested edits survive every navigation/save sequence.

### D04 and C01 — snapshot races and unsafe recovery acknowledgements

[`syncCanvas`](../server/services/canvas/db/dynamo.ts) lines 221–255 is an
eventually consistent read-modify-write with no version check. Independent tabs
can both read revision N; the last save silently wins. Separately,
[`use-canvas.ts`](../client/src/hooks/use-canvas.ts) clears the one local cache on
any mutation success, even when a newer edit generation is already cached.

Repair:

- Store a workspace manifest item with monotonically increasing revision and
  checksum. Require `baseRevision` and conditionally advance it.
- Return `409 CANVAS_REVISION_CONFLICT` with the current revision. Initially offer
  explicit reload/export; do not pretend arbitrary graph snapshots can be merged.
- Serialize saves per workspace, coalesce pending edits, and acknowledge only the
  exact generation/revision that succeeded.
- Key local recovery by workspace plus generation; clear only acknowledged data.
- Add two-client race tests and out-of-order completion tests.

Longer term, use idempotent operations or an append/outbox log if real-time
multi-writer editing is a product requirement. A full snapshot endpoint alone
cannot provide safe collaborative merging.

### B01 — the backup utility does not represent the current system

[`backup-db.ts`](../scripts/backup-db.ts) uses only `DATABASE_URL`, assumes old
single-database tables including PostgreSQL `nodes`/`edges`, skips missing tables,
catches other per-table errors, and still prints `Complete`. It omits the auth,
workspace, team, Jenkos/AI, and metrics database boundaries, DynamoDB canvases,
PostgreSQL roles/globals, an off-host destination, encryption/retention policy,
restore automation, and verification.

Minimum cost-conscious recovery design:

1. Inventory where each database actually runs and who owns it. Record this in a
   machine-readable backup manifest, never in a secret-bearing document.
2. For each critical PostgreSQL database, use `pg_dump --format=custom` and fail
   the whole job on any dump/upload/checksum error. Back up cluster roles with
   `pg_dumpall --globals-only` where needed. Metrics history may use a shorter
   policy because it is reconstructable.
3. Upload encrypted artifacts to a separate, versioned S3 backup bucket with a
   dedicated least-privilege role, lifecycle retention, and deletion isolation.
   A directory on the same EC2 host is not a disaster-recovery backup.
4. Enable and verify DynamoDB PITR for the canvas table. Add scheduled on-demand
   backups only if longer retention is required. Restores create a new table, so
   the runbook must include validation and controlled cutover.
5. Protect the keys needed to interpret restored data, especially MFA and AI-key
   encryption keys. Losing those keys makes an otherwise successful database
   restore incomplete; exposing them with the dump defeats the backup boundary.
6. Run a monthly restore into isolated PostgreSQL databases and a temporary
   DynamoDB table. Check row/item counts, schemas, sampled canvases, auth login,
   team access, AI-memory reads, and application boot before destroying the target.

Initial service objectives for owner approval:

| Data                                  | Proposed RPO        | Proposed RTO | Mechanism                                                                      |
| ------------------------------------- | ------------------- | ------------ | ------------------------------------------------------------------------------ |
| DynamoDB canvas                       | 5 minutes           | 4 hours      | PITR plus restore/cutover runbook                                              |
| Auth/workspace/team/Jenkos PostgreSQL | 24 hours initially  | 4 hours      | Daily encrypted logical dump; use managed PITR/WAL if 24 hours is unacceptable |
| Metrics PostgreSQL                    | 24 hours or rebuild | 8 hours      | Short-retention dump or intentionally disposable                               |
| Release artifacts/config              | Every release       | 1 hour       | Immutable release package, checksums, previous release, secret inventory       |

These are proposals, not current guarantees. PostgreSQL states that `pg_dump`
produces a consistent snapshot of one database while normal use continues; it
does not make several independent databases and DynamoDB globally atomic. For a
cross-store recovery point, briefly stop writes or mark a maintenance epoch,
record each snapshot time/revision in one manifest, and reconcile durable outbox
events after restore.

References: [PostgreSQL pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html),
[DynamoDB backup and restore](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Backup-and-Restore.html).

### A01 — the verifier holds signing material

[`assertion.go`](../server/services/auth/internal/assertion/assertion.go) lines
114–118 calls `s.priv.Seed()` from a function named `PublicKeySeed`.
[`assertion.ts`](../server/auth/assertion.ts) lines 27–57 reconstructs a private
key from that seed and derives its public half. Therefore
`AUTH_ASSERTION_PUBLIC_KEY` is actually private signing material. An isolated
generated-key test confirmed the verifier accepted the private seed and rejected
the actual raw public key.

Repair:

- Export the raw Ed25519 public key from Go and make Node construct an SPKI public
  key directly from public bytes.
- Rename configuration to remove `Seed` ambiguity and validate key purpose, ID,
  and length at startup.
- Rotate the production pair because the old private seed crossed the intended
  service boundary. Keep only public previous keys in Node during the token TTL.
- Add a boundary test proving Node verifies with public bytes and has no signing
  method or private seed.

### A02 — enabled CAPTCHA and email verification paths are broken

[`captchaProtect`](../server/services/auth/internal/httpapi/middleware.go) lines
244–264 decodes the entire registration request into a struct containing only
`captchaToken`. `readJSON` disallows unknown fields and closes the body, so a real
registration payload is rejected when CAPTCHA is enabled and cannot be decoded
again by the handler.

[`handleVerifyEmail`](../server/services/auth/internal/httpapi/handlers_flows.go)
lines 137–146 copies `body.Token` before decoding, so JSON tokens fall through to
the query string. The client at
[`auth-client.ts`](../client/src/auth/auth-client.ts) lines 137–144 sends JSON and
does not attach the CSRF header required by the Go route.

Repair the body middleware by buffering/restoring a size-bounded body or, better,
validating CAPTCHA as part of the single handler decode. Decode before reading the
verification token and route all state-changing client calls through the shared
CSRF-aware fetch. Add table-driven real-Go HTTP tests for CAPTCHA on/off, valid and
unknown fields, JSON/query verification, missing/expired tokens, and CSRF retry.

### A03 — Redis boot failure contradicts fail-closed intent

[`main.go`](../server/services/auth/cmd/server/main.go) lines 89–104 leaves `rdb`
nil when the configured Redis ping fails. [`ratelimit.go`](../server/services/auth/internal/ratelimit/ratelimit.go)
lines 40–43 and 63–84 allow requests when the client is nil. The log says rate
limiting and MFA fail closed, but login/register limiters actually disappear.
Go `/healthz` and `/readyz` check only PostgreSQL.

Repair by distinguishing `not configured in development` from `configured but
unavailable`. Production should either fail startup or retain a reconnecting
client whose sensitive middleware returns 503 until Redis is ready. Expose Redis
readiness and rate-limiter mode, and test startup outage, runtime outage, and
recovery. MFA should return an explicit dependency error, never silently weaken.

### A04 — long-lived sockets outlive session authority

[`presence.ts`](../server/services/team/websocket/presence.ts) lines 368–378 checks
only the in-memory revocation set. If pub/sub was disconnected when revocation was
published, or a session simply expires, the socket can stay authorized while it
continues responding to pings.

Store the assertion/session deadline with the socket, close at expiry, and do a
bounded authoritative revalidation at a jittered interval. Revalidate workspace
membership on join and after membership-change events. Track revalidation errors,
revocation lag, connection age, and close reason without user email in labels.

### R01 — readiness and liveness do not describe the running application

[`index.ts`](../server/index.ts) listens before initialization at lines 293–310.
If registration/migration fails, lines 372–384 deliberately keep serving and add
the static frontend. `/health` checks only workspace PostgreSQL and optional Node
Redis (lines 203–239); `/ready` is a permanent boolean after initial boot (lines
241–249 and 370). It does not turn false when DynamoDB, auth, another domain DB,
or a required Redis role becomes unavailable. Metrics database initialization is
also on the critical boot path, so an observability-store failure can prevent all
business routes while the early health endpoint still responds.

Define three signals:

- `/live`: event loop is responsive; no downstream calls.
- `/ready`: routes initialized and every dependency required to accept new work is
  currently usable within a strict deadline.
- `/health/details`: authenticated/internal component state for operators.

On initialization failure, emit one structured fatal event, stop accepting
traffic, close resources, and exit nonzero so PM2 can restart. Treat metrics
storage as noncritical and degrade it independently. Deployments must gate on
`/ready`, auth `/readyz`, a public HTTPS route, and an authenticated canary—not the
current shallow `/health` alone.

### R02 — Node has no bounded shutdown path

The Go service uses signal-aware shutdown, but no Node handler was found for
`SIGTERM`, `SIGINT`, `uncaughtException`, or `unhandledRejection`.
[`disconnectRedis`](../server/lib/redis.ts) exists but is not wired into process
lifecycle, and the metrics collector exposes no stop handle.

Implement one idempotent shutdown coordinator:

1. Set readiness false and stop accepting new HTTP/WebSocket work.
2. Allow a short bounded drain; terminate remaining SSE/provider requests.
3. Flush only already-acknowledged save bookkeeping; do not claim pending writes
   succeeded.
4. Close WebSockets, collector timers, Redis clients, and all PostgreSQL pools.
5. Exit nonzero on fatal exceptions, with request/release context already logged.

Configure PM2's kill timeout above the application drain deadline and test
`SIGTERM` during HTTP, SSE, WebSocket, and canvas save operations.

### R03 — cross-store side effects are not durable

[`workspaceRoutes.ts`](../server/services/workspace/routes/workspaceRoutes.ts)
emits `workspace.deleted` before the PostgreSQL delete at lines 244–247. The
canvas listener catches DynamoDB failures and only logs them at
[`canvas/index.ts`](../server/services/canvas/index.ts) lines 15–47. Duplicate
canvas copying also happens after the new PostgreSQL workspace is returned by a
non-durable in-memory event.

This permits both directions of inconsistency: canvas deleted while the workspace
delete later fails, or workspace committed while its canvas delete/copy is lost
on an error or process crash.

Use a PostgreSQL transactional outbox written in the same transaction as the
workspace mutation. A retrying worker performs idempotent DynamoDB operations,
records attempts/dead letters, and marks completion. Deletion should use a
recoverable tombstone/grace period. Duplicate should not become visible as ready
until its copy completes, or should expose a visible `copying/failed` state.

### I01–I03 — AI has correctness, failure, and spend leaks

- [`aiRoutes.ts`](../server/services/ai/routes/aiRoutes.ts) lines 513–518 mounts
  `/suggestions` without `aiChatLimiter` or `aiFreeTierLimiter`; the client effect
  in [`WorkspaceLeftSidebar.tsx`](../client/src/features/workspace/components/WorkspaceLeftSidebar.tsx)
  lines 74–98 calls it whenever node/edge count changes. It invokes a model with
  up to 1,000 output tokens even though four six-word strings are requested.
- The free resolver accepts arbitrary simple model names at
  [`resolver.ts`](../server/services/ai/resolver/resolver.ts) lines 93–104, and
  route-supplied `maxTokens` reaches providers without a server cap. This affects
  cost and creates unbounded `model` metric labels.
- Provider fetches generally have no overall/connect/idle deadline and do not
  abort when the browser disconnects.
- Anthropic non-2xx responses can be reserialized as HTTP 200. After SSE headers
  are sent, the catch block at `aiRoutes.ts` lines 485–508 tries to send JSON,
  which can cause `ERR_HTTP_HEADERS_SENT` instead of an SSE error and clean end.
- [`anthropic.ts`](../server/services/ai/providers/anthropic.ts) lines 51–74 splits
  each network chunk independently and discards incomplete JSON lines. A valid
  event split over two reads produced empty output in the isolated probe.
- [`jenkosAgent.ts`](../client/src/features/workspace/agent/jenkosAgent.ts) lines
  312–332 executes every edit tool against the same original nodes/edges; a
  two-tool probe retained only the second edit.

Repair contract:

- Use a server allowlist mapping plan/provider to model and maximum input/output
  tokens. Ignore or reject larger client values.
- Put suggestions behind per-user and global daily budgets, cache by a bounded
  canvas fingerprint, and request them only on explicit/open-idle behavior. A
  deterministic local default is cheaper and more reliable for routine hints.
- Validate request shape and canvas size before prompt construction.
- Attach one `AbortController` to client disconnect and provider deadline. Check
  every upstream status before forwarding; map errors to stable codes.
- Once SSE starts, send an `error` event with a safe code/request ID and end the
  stream. Never call `res.status().json()` after headers are sent.
- Use a real incremental SSE parser with a carry buffer and decoder flush.
- Feed each Jenkos edit result into the next tool call and test mixed add/update/
  delete sequences.
- Meter requests, tokens, estimated cost, provider latency, cancellation, and
  error class. Labels must use bounded model aliases, never raw requested names.

### P01 — production deployment is not an atomic release

[`deploy-production.yml`](../.github/workflows/deploy-production.yml) lines 57–66
copies artifacts into the active directory. [`deploy-remote.sh`](../scripts/deploy-remote.sh)
then runs `npm ci` against active `node_modules`, copies NGINX configuration before
validation, and restarts Node before the workflow separately replaces/restarts Go.
There is no release manifest/checksum, current symlink, automatic rollback, or
single health gate for the Node/Go pair. Public smoke tests are explicitly
`continue-on-error`.

Deploy immutable directories such as `releases/<git-sha>`:

1. Build/test one release artifact in CI and include a manifest, checksums,
   production dependency tree, Node/Go versions, migrations, and release SHA.
2. Upload to a staging path, verify checksum/free space/config, install nothing in
   the active directory, and validate a temporary NGINX file before copying it.
3. Run backward-compatible migrations under a deployment lock.
4. Start/probe the complete Node+Go release, atomically switch `current`, then
   reload NGINX/PM2.
5. On failed readiness or smoke, switch back and verify the previous release.
6. Keep the last 2–3 releases and prune only after success. Make smoke failure
   fail deployment.

This also lowers t3.small deployment pressure: `npm ci` and builds no longer
compete with the live process or destroy its dependency tree.

### O01 and O02 — current metrics can mislead or exhaust memory

[`collector.ts`](../server/services/metrics/collector/collector.ts) lines 34–49
sums every cumulative histogram bucket as if it were an independent count, while
overwriting rather than summing `_sum` across label series. The computed average
latency is therefore wrong. `requestRate` at lines 30–32 is a count per collector
interval, not a per-second rate, and its baseline advances before the database
insert succeeds. Overlapping timer calls are possible if a snapshot exceeds the
interval.

[`metricsMiddleware.ts`](../server/middleware/metricsMiddleware.ts) lines 21–34
uses raw `req.path` when no route matched. Go's `routeTemplate` similarly returns
most raw paths. AI metrics accept client-influenced model strings. Random URLs or
model names create unbounded time series.

Repair:

- Read structured metric objects or compute `_sum / _count` across series; never
  sum cumulative buckets. Prefer querying Prometheus rates/quantiles at read time.
- Rename interval counts accurately or divide by measured elapsed seconds.
- Make snapshots single-flight, deadline-bound, and update baselines only after a
  committed insert. Record collector age/failures.
- Use route templates or a bounded `unmatched` label; normalize all model names to
  an allowlisted alias. Count aborted connections using the `close` event.
- Do not convert failed internal-count calls to zero without a `stale/degraded`
  marker. The default auth metrics URL/key also need explicit configuration:
  Node uses `INTERNAL_API_KEY`/port 5000 while auth introspection uses
  `AUTH_INTERNAL_KEY`/port 8081.

### O03 — make production failures traceable without leaking data

The Node Pino logger at [`logger.ts`](../server/lib/logger.ts) has JSON output but
no request context or redaction configuration. This directly contradicts the
recursive-redaction claim in the public Dev/Landing copy. The server build is
minified with no source map at [`build.ts`](../scripts/build.ts) lines 39–51, Vite
also has no production source-map workflow, and frontend error boundaries only
write to the browser console. Their chunk-error reload has no once-only guard, so
a persistent asset mismatch can loop.

Use one error contract:

```json
{
  "error": {
    "code": "CANVAS_PARTIAL_WRITE",
    "message": "Changes could not be saved yet",
    "requestId": "01...",
    "retryable": true
  }
}
```

Implementation rules:

- Accept a valid inbound request ID or generate a UUID/ULID at NGINX; propagate it
  through Node, Go introspection, WebSocket handshake, provider calls where safe,
  and the client response header.
- Create request-scoped child loggers with `requestId`, `service`, `releaseSha`,
  normalized route, method, status, duration, error code, and dependency. Do not
  use email/user ID as metric labels.
- Configure recursive Pino redaction for authorization/cookie headers and known
  password, token, secret, API-key, and connection-string paths. Add tests. Remove
  the product claim until the implementation exists.
- Keep full `Error`/`cause` stacks in restricted server logs. Send only stable code,
  safe message, retryability, and request ID to clients. Never log canvas content,
  prompts, provider bodies, session tokens, or encryption material by default.
- Produce private server and browser source maps keyed by release SHA. Do not serve
  them publicly; upload them to the selected error service or protected artifact
  store, then delete public copies.
- Add browser `error`/`unhandledrejection` capture and error-boundary reporting with
  route, release, request ID, and a scrubbed stack. Guard chunk reload with a
  session flag and show a recovery UI after one attempt.
- Classify expected validation/auth/conflict/dependency errors separately from
  defects. Validation must be 400, revision conflict 409, throttling 429/503 with
  retry guidance, dependency timeout 504, and unexpected defects 500.

### O04 and t3.small observability design

A `t3.small` has two vCPUs and 2 GiB RAM and is credit-governed when bursting. Do
not run a full Prometheus/Grafana/Loki/trace stack on the same host. Keep the
existing in-process Prometheus exposition, send structured logs off-host with
bounded local retention, and use either an external scraper or a minimal
CloudWatch configuration.

Collect at 60-second intervals initially:

- EC2: `CPUUtilization`, `CPUCreditBalance`, surplus-credit charges,
  `StatusCheckFailed`, network, and EBS balance/latency.
- CloudWatch agent basic host metrics: memory used, disk used, inode availability,
  and swap. EC2 default metrics do not provide guest memory/disk utilization.
- Node/Go: RSS, heap, GC/event-loop lag, goroutines, process restarts, file
  descriptors, open sockets, DB pool wait/use, and dependency latency/errors.
- Product safety: canvas save attempts/success/conflict/partial-write/retry,
  recovery-cache age, outbox age/dead letters, auth limiter mode, WebSocket
  revalidation, provider tokens/cost, backup age, restore-drill age, and release SHA.

Initial alert candidates, to tune after two weeks of baseline data:

| Signal               | Initial trigger                        | Why                                   |
| -------------------- | -------------------------------------- | ------------------------------------- |
| Public readiness     | Fails for 2 minutes                    | Broken release or dependency          |
| Canvas partial write | Any exhausted item                     | Direct data-safety failure            |
| Save conflict        | Any sustained burst                    | Collaboration/race regression         |
| Backup age           | Older than 26 hours                    | RPO at risk                           |
| Restore drill        | Older than 35 days                     | Backup confidence expired             |
| Disk                 | Over 80% or forecast under 24 hours    | Prevent deploy/log/database failure   |
| Memory               | Over 85% for 10 minutes or swap growth | Prevent OOM on 2 GiB host             |
| CPU credits          | Low and declining under load           | Imminent throttling or surplus charge |
| HTTP 5xx             | Over 5% with a minimum request count   | User-visible failure                  |
| p95 latency          | Over 2 seconds for 10 minutes          | Saturation/dependency slowness        |
| Auth limiter mode    | Disabled/degraded in production        | Security control failure              |
| Outbox oldest item   | Over 5 minutes                         | Cross-store inconsistency             |

References: [EC2 burstable credit behavior](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-credits-baseline-concepts.html),
[CloudWatch agent metrics](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/metrics-collected-by-CloudWatch-agent.html),
[EC2 T3 specifications](https://aws.amazon.com/ec2/instance-types/t3/).

### R04–R06 — dependency and API hardening

- [`redis.ts`](../server/lib/redis.ts) lines 35–73 stops reconnecting after five
  attempts but keeps the singleton object. Use jittered persistent recovery for
  optional cache/pub-sub roles, explicit fail-closed behavior for security roles,
  status transition metrics, and a way to rebuild subscriptions after reconnect.
- [`db.ts`](../server/lib/db.ts) lines 29–34 gives each of four Node services a
  maximum of ten connections; Go adds ten and keeps two warm. Pools allocate
  lazily, but the 50-connection ceiling is not budgeted against the database or
  small host. Make pool sizes per service configurable, begin around 2–4 for
  request-serving domains and 1–2 for metrics, expose waiters, then load test.
  Set transaction, statement, and lock timeouts so one query cannot occupy a slot
  indefinitely.
- [`static.ts`](../server/static.ts) sends `index.html` for every unmatched GET.
  Add an explicit JSON `/api` 404/method handler before the SPA fallback and make
  client fetch validate content type before parsing.

## Failure-mode matrix

| Failure                              | Current behavior                | Desired behavior                    | Detection                            | Recovery                                             |
| ------------------------------------ | ------------------------------- | ----------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| DynamoDB throttles part of batch     | 200/saved, cache cleared        | Retry; typed failure if exhausted   | Partial-write counter + request ID   | Retain local generation; retry safely                |
| DynamoDB response is paginated       | First page only                 | Consume every page                  | Multi-page parity test + item counts | Reload full revision; no delete from incomplete base |
| Two clients save                     | Last writer wins                | Conditional revision conflict       | Conflict metric                      | User-directed reload/export; later merge ops         |
| User enters nested canvas            | Nested view autosaves as root   | Persist canonical root              | Browser regression                   | Restore local cache/PITR if already damaged          |
| Workspace delete/copy crashes midway | Cross-store inconsistency       | Durable idempotent outbox           | Outbox age/dead letter               | Replay/reconcile; tombstone restore                  |
| Workspace DB down at boot            | Early listener may look healthy | Not-ready and process restart       | Readiness + init-failure alert       | Backoff restart; repair DB                           |
| Metrics DB down                      | Can abort business route init   | Metrics degrade independently       | Collector stale metric               | Reconnect/drop history, keep app serving             |
| Auth Redis down at boot              | Limiters bypassed               | Production fail-closed/not-ready    | Limiter-mode alert                   | Reconnect, then become ready                         |
| Revocation pub/sub missed            | Socket remains active           | Expiry + authoritative revalidation | Revalidation/age metrics             | Close socket and require new handshake               |
| Provider stalls/client leaves        | Work can continue indefinitely  | Abort and deadline                  | Active/timeout/cancel counters       | End SSE; no retry after partial output               |
| SIGTERM during deploy                | Node requests/writes cut off    | Bounded drain                       | Shutdown duration/forced kill        | PM2 rollback/restart                                 |
| Upload/install partially succeeds    | Active release is mixed         | Immutable staged release            | Manifest/checksum/readiness          | Atomic switch to previous SHA                        |
| Disk fills                           | Deploy/log/DB may fail          | Alert and bounded retention         | Disk/inode forecast                  | Prune known releases/logs; expand EBS deliberately   |
| Backup misses a table                | Script can still print complete | Manifest fails closed               | Backup age/status/checksum           | Repair and rerun; alert until valid                  |
| Restore cannot decrypt data          | Partial functional restore      | Key custody tested with restore     | Drill result                         | Recover escrowed versioned key/rotate safely         |

## Cost and capacity improvements for one t3.small

Measure first; these changes avoid recurring waste without prematurely moving
platforms:

1. **Protect CPU credits.** Alert on credit balance/surplus charges. Benchmark
   login/register: each Argon2id operation is configured for 64 MiB and is CPU
   intensive. Add a small bounded hashing semaphore/queue sized from measurements
   so many IPs cannot exhaust the host despite per-IP rate limits.
2. **Reduce database fan-out.** Right-size the five pool ceilings, add timeouts,
   and avoid making the metrics database a boot dependency. Do not provision a
   separate compute service merely because code has database boundaries.
3. **Stop building/installing on production.** Ship one verified release package.
   This reduces CPU, disk churn, downtime, and failed-install residue.
4. **Stop automatic suggestion spend.** Use cached/deterministic suggestions by
   default, hard token/model budgets, daily global/provider caps, and a kill switch.
5. **Reduce metric write frequency.** A 30-second snapshot creates 2,880 rows/day
   before label-series effects. One-minute or five-minute durable summaries plus
   external Prometheus scrape is enough until product requirements prove otherwise.
6. **Bound storage.** Rotate/compress logs, keep 2–3 releases, enforce metrics and
   audit retention, lifecycle backups, and alert on both bytes and inodes.
7. **Keep concurrency explicit.** One Node process is the safe default on 2 GiB
   until measured RSS proves otherwise. Bound HTTP body sizes by endpoint (canvas
   may need more; auth and metadata need far less), WebSocket messages, provider
   concurrency, and DynamoDB retry work.
8. **Optimize queries after telemetry.** Add slow-query sampling and pool-wait
   metrics, then index observed queries. Avoid speculative caches that add another
   recovery dependency.

## Test and failure-injection plan

Add these as required checks, with deterministic fakes rather than live paid APIs:

| Suite              | Required scenarios                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Canvas persistence | Multi-page query; partial batch retry/exhaustion; stale revision; idempotent replay; item/size limit                  |
| Client persistence | Nested enter/save/refresh; multi-level edit; older save finishes last; offline/reload; tab close during debounce      |
| Cross-store        | Delete DB failure; Dynamo failure; crash after outbox commit; replay; duplicate copy failure                          |
| Real Go HTTP       | CAPTCHA on/off; registration/login/MFA; email verify/resend; password recovery; OAuth callback/link; CSRF; Redis loss |
| Auth boundary      | Actual public-key verification; rotation; expired/missing assertion refresh; stale admin/email claims                 |
| WebSocket          | Session expiry; missed pub/sub; membership removal; Redis reconnect; slow consumer; oversize/malformed message        |
| AI adapters        | Every upstream non-2xx; timeout; disconnect; SSE split at every byte boundary; partial stream error; token cap        |
| Lifecycle          | Dependency unavailable at boot/runtime; `/live` vs `/ready`; SIGTERM during each long operation; fatal rejection      |
| Deployment         | Corrupt artifact; insufficient disk; migration failure; Node healthy/Go bad and inverse; automatic rollback           |
| Recovery           | Restore every PostgreSQL DB plus roles; restore DynamoDB to new table; key availability; app smoke and reconciliation |
| Telemetry          | Cardinality budget; redaction fixtures; request ID propagation; histogram math; collector overlap/staleness           |

Tests should assert durable state and error semantics, not just status codes. The
current integration auth tests predominantly exercise the Node bridge/mocks; green
results do not prove the Go HTTP flows.

## Implementation sequence

### Phase 0 — freeze unsafe behavior (0–2 days)

- D01: retry/fail incomplete batches and retain local recovery.
- D02: paginate all reads and add multi-page parity tests.
- D03: stop root autosave while nested until canonical serialization is fixed.
- Disable or explicitly gate destructive snapshot deletion without a revision.
- Enable/verify DynamoDB PITR and take a pre-repair recovery point.
- Disable automatic AI suggestions or put them behind the existing limits.

### Phase 1 — make saves and recovery trustworthy (3–7 days)

- D04/C01: revision manifest, conditional writes, serialized generations, 409 UX.
- Canonical nested serialization and browser regression suite.
- Replace the backup utility, upload off-host, and complete the first restore drill.
- Add data-safety counters and alerts.

### Phase 2 — correct auth and failure semantics (3–6 days)

- A01 key-boundary migration and rotation.
- A02/A03 real-Go flow fixes/tests and Redis production state machine.
- A04 socket expiry/revalidation.
- R01/R02 readiness, startup failure, shutdown, and dependency classification.

### Phase 3 — durable operations and deploys (4–8 days)

- R03 transactional outbox/reconciliation.
- P01 immutable release directories, checksum/manifest, pair health, rollback.
- Run deployment failure matrix on staging; make smoke blocking.

### Phase 4 — trustworthy telemetry and right-sizing (3–6 days)

- O01/O02 metrics math/cardinality/staleness.
- O03 request context, redaction, private source maps, frontend error capture.
- O04 CloudWatch host metrics/alarms and release dashboards.
- Tune DB pools, Argon concurrency, log retention, snapshot intervals, and AI caps
  from two weeks of evidence.

## Definition of done

The audit can be closed only when:

- Every P0 repair has a regression test that failed on the audited version.
- No canvas success response can conceal unprocessed items or an incomplete read.
- A stale client cannot overwrite a newer revision without a visible conflict.
- The same release SHA appears in Node/Go logs, health details, artifact manifest,
  and error events.
- Public readiness fails for every required dependency/fault and liveness remains
  cheap and meaningful.
- Production Redis failure mode is explicit and tested; security controls do not
  silently downgrade.
- A deployment failure automatically returns to the prior verified Node+Go pair.
- Backup jobs fail closed, publish age/checksum status, and a documented restore
  drill meets the approved RPO/RTO.
- Metrics labels have a tested finite vocabulary and latency math matches known
  fixtures.
- Resource/AI budgets and alarms have named owners and a tested notification path.
