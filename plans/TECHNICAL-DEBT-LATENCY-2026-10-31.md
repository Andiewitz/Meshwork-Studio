# Technical debt and latency review — 2026-10-31

## Scope and confidence

This review inspected the current working tree, recent service-boundary changes,
existing performance/security audits, and Git history around March 2026 (about
seven months before this review). It is a code review, not a new production load
measurement or proof that all older issues remain open. Dates below identify
what Git or an existing report supports; they do not establish who introduced a
problem or prove that an earlier design had the same runtime behavior.

## Prioritized findings

### 1. Realtime fan-out amplification (optimized locally; real-backend verification pending)

- The prior implementation checked recipients one at a time and could reorder
  async messages. The current code batches Workspace authorization in one SQL
  query per 500 recipients and uses bounded per-socket and per-room queues.
  It does not cache permissions. Overload closes sockets for reconnection, but
  missed canvas events are not automatically reconciled after reconnect.
- A local synthetic before/after comparison is in `tests/load/README.md`. It
  does not measure real PostgreSQL, Redis, network conditions, or production p95.
  Tests cover ordered delivery, access removal, and fail-closed batch errors.
- Next: test the query against real PostgreSQL, benchmark representative rooms
  and cross-instance Redis traffic, and verify revocation under concurrency.
  Independent server instances do not have a global total-order guarantee.

### 2. The recorded latency average was mathematically unreliable (fixed locally)

- Evidence: `server/services/metrics/collector/collector.ts` sums cumulative
  histogram buckets as if they were independent counts, and overwrites the
  duration sum for each label series. This was already identified in
  `docs/archive/plans/CODEBASE-RELIABILITY-AUDIT.md`; Git attributes these lines
  to August 2026, not seven months ago. The result can mislead performance work.
- Status: the collector now calculates per-series interval deltas from `_sum`
  and `_count`, with reset and failed-write tests. Hourly views weight intervals
  by request counts. Older stored snapshots remain incorrect; use histogram
  buckets or a load generator for p95/p99.

### 3. Collaborator profile lookup performs sequential database queries

- Evidence: `server/services/auth/internal/httpapi/collaborator_identity.go`
  loops over up to 100 IDs and awaits a user lookup for each. The Share dialog
  batches requests in groups of 100, but each group still fans into serial SQL.
  This is new collaborator work. It mainly affects opening large sharing lists.
- Next: use one bounded `WHERE id = ANY(...)` query, preserve active/verified
  filters and the current minimal response shape, and test missing/duplicate IDs
  and database outages. Measure query count and list latency before and after.

### 4. Canvas saves intentionally wait for inactivity

- Evidence: `client/src/pages/Workspace.tsx` debounces server persistence for
  three seconds, with an immediate browser cache write. This is a durability and
  perceived-save-latency tradeoff rather than proof of a server bottleneck.
  Git attributes the current debounce behavior to July 2026; nearby older lines
  trace to April, which alone does not prove the delay existed in April.
- Next: measure edit-to-save confirmation and failure recovery on representative
  canvases. Consider flushing on explicit save, navigation, and suitable page
  lifecycle events; preserve revision conflict handling and offline recovery.

### 5. March credential exposure needs verification, not assumptions

- Evidence: the archived March 25 security audit reports that `.env` and backup
  copies had been tracked and called for credential rotation. The report is
  historical evidence, not proof the keys are still valid, rotated, or exposed
  in the current tree. No credentials were printed or re-tested in this review.
- Next: check the credential-response records and provider-side rotation status;
  if any historical credential remains active, rotate it and follow
  `docs/operations/CREDENTIAL-RESPONSE.md`. Do not infer safety from `.gitignore`.

### 6. Lifecycle and storage need real-backend verification

- Evidence: this branch adds migration advisory locking, optional startup,
  Canvas readiness, and draining. Tests use mocks and a local HTTP server; real
  concurrent PostgreSQL migrations, real DynamoDB/S3, and deployment SIGTERM are
  not yet verified. The user asked to leave DynamoDB verification pending when
  Docker was unavailable. Old migration runners do not take the new lock.
- Next: run two real migration processes against a disposable PostgreSQL
  database; test real DynamoDB/S3 permissions and Canvas readiness; exercise an
  actual SIGTERM with active HTTP, socket, and outbox work before deployment.

### 7. Public landing page contains placeholder content

- Evidence: `client/src/pages/Landing.tsx` renders `TODO(date)` and `TODO(copy)`
  in the update section. Git attributes these placeholders to October 2026,
  not March. They are a visible product issue, not a latency measurement.
- Next: replace the placeholders with verified release details or hide the
  section until real content exists.

## Measurement baseline and sequence

`plans/PERF-AUDIT.md` records a historical 20 ms p95 for one specific short
workload and explicitly notes its limits. It is not a current production
baseline and does not cover the new permission path. Before optimization, run the
existing `tests/load` scenarios against a representative deployment; record
hardware, data size, concurrency, cache state, p50/p95/p99, errors, database
pool waits, DynamoDB throttling, and WebSocket delivery lag. The metrics
calculation is fixed locally. Benchmark realtime fan-out and profile lookup on
real infrastructure, then consider
changes to save timing. Compare the same workload before and after each change.
