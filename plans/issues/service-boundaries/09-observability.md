**Audit ID:** SB-09 · **Priority:** P2 · **Depends on:** SB-01 and SB-02.

**Tracker:** [#49](https://github.com/Andiewitz/Meshwork-Studio/issues/49)

**Dependency links:** [#50](https://github.com/Andiewitz/Meshwork-Studio/issues/50), [#51](https://github.com/Andiewitz/Meshwork-Studio/issues/51).

## Problem

Metrics history reads the current Node process's in-memory Prometheus registry.
Moving that collector into a separate service unchanged would measure its own
process instead of the app. Request IDs exist, but internal calls often omit
them, and background operations lack a consistent event/operation correlation
contract. Failed dependencies currently sometimes appear as zero counters.

Evidence: Metrics collector/storage/routes, `server/lib/metrics.ts`, internal
clients, and Workspace outbox at audited main `bbfec7f`.

## Proposed solution

Define shared logging/trace metadata for module/service identity, request ID,
correlation ID, event/operation ID, and dependency outcomes. Export telemetry
from each runtime. Keep operational CloudWatch signals separate from the admin
history feature while preserving its useful behavior. Observers do not receive
other domains' database credentials to collect counts.

Reuse the locally implemented CloudWatch/SNS foundation when landed; do not
create a parallel observability stack or copy every metric into paid custom
metrics.

## Acceptance criteria

- [ ] One request/operation can be followed through Node, Go, the outbox, and a
      future queue/worker using stable context without logging credentials,
      verification codes, API keys, or message contents.
- [ ] Each process exposes its own telemetry; aggregated history identifies
      source runtimes and treats counter resets/restarts correctly.
- [ ] Dependency errors/timeouts, outbox/queue age, dead letters, and terminal
      operation failures are observable with actionable correlation IDs.
- [ ] Missing or stale samples are distinguishable from true zero values.
- [ ] Metric dimensions are bounded; user/workspace/request IDs stay in logs
      rather than custom metric labels. Log retention and expected volume are
      reviewed against the existing small budget.
- [ ] Tests exercise propagation and aggregation across at least two runtimes
      or equivalent adapter boundaries; admin/API compatibility is documented.
