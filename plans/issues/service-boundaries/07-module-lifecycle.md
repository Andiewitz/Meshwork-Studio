**Audit ID:** SB-07 · **Priority:** P2 · **Depends on:** SB-02.

**Tracker:** [#49](https://github.com/Andiewitz/Meshwork-Studio/issues/49)

**Dependency links:** [#51](https://github.com/Andiewitz/Meshwork-Studio/issues/51).

## Problem

Root composition migrates every SQL domain before mounting routes, so a Metrics
migration failure aborts the entire application; Metrics initializes its
migrations again. The migration runner has no cross-process lock. Readiness
checks Workspace SQL and Redis while Canvas startup is fire-and-forget and its
readiness helper is unused. Shutdown closes only the Workspace pool plus shared
Redis and lacks complete timer/socket/in-flight-worker draining.

Evidence: `server/routes.ts`, `server/index.ts`, `server/lib/migrate.ts`, Canvas
and Metrics entrypoints, and module connections at audited main `bbfec7f`.

## Proposed solution

Give modules explicit start/health/stop-drain contracts and declare required
versus optional capabilities. Preserve fail-closed core schema boot. Optional
AI/Metrics failures should expose capability unavailability while the core
document app remains usable. Serialize migration execution and make extracted
runtimes load only their own configuration, secrets, and pools.

Clarify the canonical AI store: Jenkos prefers `JENKOS_DATABASE_URL` and falls
back to `AI_DATABASE_URL`, while Compose provisions both. Inventory data and
backup/deployment configuration before removing either compatibility path.

## Acceptance criteria

- [ ] Core document readiness includes usable Workspace and Canvas; optional
      capabilities report their own health/degradation without false green.
- [ ] Optional module boot failures do not prevent the core document routes
      starting; required migrations still abort on failure.
- [ ] Concurrent process starts cannot execute the same migration unsafely;
      migration locking and single ownership are covered by database tests.
- [ ] Shutdown stops new work and drains/closes module timers, sockets, pools,
      clients, outbox work, and telemetry within a bounded deadline.
- [ ] Tests exercise partial boot failure and SIGTERM during requests/jobs.
- [ ] A single logical Jenkos store/configuration contract is documented; no
      existing database or backups are dropped as an automatic cleanup step.
- [ ] Deployment, recovery, and rollback guidance reflect the lifecycle contract.
