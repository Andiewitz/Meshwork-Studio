**Audit ID:** SB-10 · **Priority:** P3; extraction after foundations ·
**Depends on:** SB-02, SB-03, SB-07, SB-09.

**Tracker:** [#49](https://github.com/Andiewitz/Meshwork-Studio/issues/49)

**Dependency links:** [#51](https://github.com/Andiewitz/Meshwork-Studio/issues/51), [#52](https://github.com/Andiewitz/Meshwork-Studio/issues/52), [#56](https://github.com/Andiewitz/Meshwork-Studio/issues/56), [#58](https://github.com/Andiewitz/Meshwork-Studio/issues/58).

## Motivation

AI/Jenkos already owns its schemas, BYOK encryption, conversations/memories,
provider adapters, and SSE endpoints. Its long provider requests, external
failures, and distinct secrets make it the strongest next interactive service
to extract after module contracts and lifecycle are enforced.

Currently `server/routes.ts` initializes AI in the root Node process and
`scripts/build.ts` produces one server bundle. Existing rate limiters use the
default process-local store, so replication would multiply their effective
allowance. Evidence baseline: audited main `bbfec7f`.

## Scope

Build an independent AI entrypoint/artifact/configuration on the same EC2 and
route existing `/api/v1/jenkos` and compatibility AI paths through NGINX. Reuse
the Go identity assertion/introspection contract, public module contracts, and
Jenkos data ownership. Keep provider-specific adapters inside AI.

## Acceptance criteria

- [ ] Stopping/restarting AI leaves Workspace/Canvas usable; AI routes return a
      defined unavailable state without requiring a full app restart.
- [ ] AI starts with only its own database/provider secrets and the required
      identity verification/client configuration; it imports no foreign store.
- [ ] SSE streaming, client disconnect cancellation, provider deadlines,
      authentication, CSRF, and compatibility paths retain tested behavior.
- [ ] Bounded concurrency and per-user usage/quotas work across all active AI
      processes; tests prove limits cannot reset or multiply on replication.
- [ ] NGINX routing/timeouts, process management, health, telemetry, staged
      artifact delivery, deployment order, and independent rollback are verified.
- [ ] Database backup targets and encryption-key recovery remain correct after
      canonical Jenkos configuration is chosen.
- [ ] A two-process smoke test proves authenticated AI streaming alongside core
      document editing, including an AI outage.

Keep the current EC2 host. This issue does not add an ALB, new managed runtime,
or server-side AI document mutation that bypasses Workspace/Canvas access APIs.
