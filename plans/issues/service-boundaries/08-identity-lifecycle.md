**Audit ID:** SB-08 · **Priority:** P2; required before account deletion ships ·
**Depends on:** SB-03, SB-04, SB-05.

**Tracker:** [#49](https://github.com/Andiewitz/Meshwork-Studio/issues/49)

**Dependency links:** [#52](https://github.com/Andiewitz/Meshwork-Studio/issues/52), [#53](https://github.com/Andiewitz/Meshwork-Studio/issues/53), [#54](https://github.com/Andiewitz/Meshwork-Studio/issues/54).

## Problem

The legacy `user.deleted` notification has no producer or cross-process bridge,
and its listeners swallow failures. Identity now records a durable fencing
operation and per-service steps; Workspace, Team, and AI expose required local
commands with explicit receipts. Workspace retries use a stable operation ID and
wait for Canvas completion. Team removes memberships in other owners' teams.
Disposable PostgreSQL tests cover the owner-specific storage operations.

A lease-fenced Identity worker and authenticated internal Node bridge now
coordinate the three required commands. A complete write/session fence and a
safe transition out of `fencing` are still missing, so no normal operation is
claimable and no public deletion endpoint is enabled. The formerly nonfunctional
Settings control remains disabled. PostgreSQL tests exercise retries and lease
fencing; the full DynamoDB-backed workflow remains unverified.

## Proposed solution

Before exposing account deletion, define a durable lifecycle operation owned by
Go identity with explicit status for every participating data owner. Each
consumer deletes or retains its own records under documented policy, records
idempotent completion, and retries failures. Workspace coordinates deletion of
owned documents through its outbox. Preserve audit records according to an
explicit retention policy. Retired Team cleanup applies only while that data
remains in the supported lifecycle.

## Acceptance criteria

- [ ] Identity lifecycle commands originate durably and carry stable operation,
      subject, version, and correlation identifiers.
- [ ] The data/retention inventory covers sessions, Workspace grants/metadata,
      Canvas documents, AI keys/conversations/memories, and any supported Team
      memberships; each owner supplies its own replay-safe cleanup.
- [ ] Partial failures/restarts remain pending or failed with retry/replay paths;
      no swallowed error produces a global success status.
- [ ] Session revocation and handling of writes during deletion are specified
      and tested, preventing new user-owned data from escaping cleanup.
- [ ] Tests use actual lifecycle handlers and injected interruption/failure,
      including duplicate events and missing consumers.
- [ ] No public deletion endpoint is enabled until its authorization,
      completion/retention, recovery, and operational checks pass.

Keep ephemeral Redis pub/sub for low-latency invalidation; required cleanup must
have durable state and delivery evidence.
