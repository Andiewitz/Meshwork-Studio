# Technical debt and latency review — 2026-10-31

## Scope and confidence

This review inspected the current working tree, recent service-boundary changes,
existing performance/security audits, and Git history around March 2026 (about
seven months before this review). It is a code review, not a new production load
measurement or proof that all older issues remain open. Dates below identify
what Git or an existing report supports; they do not establish who introduced a
problem or prove that an earlier design had the same runtime behavior.

## Prioritized findings

### 1. Realtime permission checks can amplify latency and reorder messages

- Evidence: `server/services/collaboration/websocket/presence.ts` checks access
  for each recipient sequentially during each room broadcast and starts each
  broadcast without waiting for previous broadcasts. `getWorkspaceAccess` in
  `server/services/workspace/db/storage.ts` issues an owner query and, for a
  non-owner, a second grant query. Cursor and canvas traffic can therefore cause
  multiple database round trips per recipient, and asynchronous broadcasts can
  complete out of order. This is **recent debt from the collaborator work**, not
  a claim about March. No current p95/p99 was measured.
- Next: load-test 2, 10, and 50 participants with cursor and node traffic;
  measure pool waits, query count, event-loop lag, and ordered-delivery behavior.
  Use an indexed single-query permission lookup and a bounded, ordered fan-out.
  If caching, pair it with cross-process invalidation and fail-closed handling;
  prove removals/downgrades stop delivery before relying on a cache.

### 2. The recorded latency average is mathematically unreliable

- Evidence: `server/services/metrics/collector/collector.ts` sums cumulative
  histogram buckets as if they were independent counts, and overwrites the
  duration sum for each label series. This was already identified in
  `docs/archive/plans/CODEBASE-RELIABILITY-AUDIT.md`; Git attributes these lines
  to August 2026, not seven months ago. The result can mislead performance work.
- Next: calculate interval deltas from the histogram `_sum` and `_count` series
  across labels, test with multiple routes and resets, and use histogram buckets
  or a load generator for p95/p99 rather than deriving percentiles from averages.

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
pool waits, DynamoDB throttling, and WebSocket delivery lag. First fix the metrics
calculation, then benchmark realtime fan-out and profile lookup, then consider
changes to save timing. Compare the same workload before and after each change.
