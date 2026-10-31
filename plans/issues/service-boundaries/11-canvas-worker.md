**Audit ID:** SB-11 · **Priority:** P3; extraction after foundations ·
**Depends on:** SB-02, SB-03, SB-05, SB-06, SB-07, SB-09 · **Related:** #48.

**Tracker:** [#49](https://github.com/Andiewitz/Meshwork-Studio/issues/49)

**Dependency links:** [#51](https://github.com/Andiewitz/Meshwork-Studio/issues/51), [#52](https://github.com/Andiewitz/Meshwork-Studio/issues/52), [#54](https://github.com/Andiewitz/Meshwork-Studio/issues/54), [#55](https://github.com/Andiewitz/Meshwork-Studio/issues/55), [#56](https://github.com/Andiewitz/Meshwork-Studio/issues/56), [#58](https://github.com/Andiewitz/Meshwork-Studio/issues/58).

## Motivation

Workspace already records document cleanup/copy work in a SQL outbox, but its
consumer runs in the same Node process. A bounded Canvas worker is a useful AWS
extraction once safe document operations and delivery settlement are established.

Coordinate the actual #48 implementation branch and locally implemented AWS
foundation before coding. This issue does not claim either is already deployed.

## Proposed flow

Workspace SQL mutation + outbox transaction -> EC2 relay -> dedicated SQS
command queue -> Canvas Lambda -> durable result -> completion queue ->
Workspace consumer/inbox -> idempotent workspace operation update.

Lambda owns only its permitted Canvas data/operation state. PostgreSQL outbox
and workspace metadata remain on EC2; do not give Lambda a connection to the
EC2-local database. Keep Cognito's encrypted email jobs on their existing,
separate queue and schema.

## Acceptance criteria

- [ ] Commands/results use versioned, runtime-validated envelopes with stable
      operation/event IDs and correlation context, never SQL transactions or
      full document bodies in queue messages.
- [ ] Relay publish success marks publication only. A workspace becomes ready
      only after the matching durable Canvas completion is applied.
- [ ] Crash after document mutation but before completion publication recovers
      through durable result/outbox state; no lost completion or unsafe recopy.
- [ ] Duplicate/out-of-order completion and stale commands cannot overwrite new
      destination edits, resurrect deleted documents, or reset terminal results.
- [ ] Queue visibility, retries, partial failures, concurrency bounds, DLQs,
      idempotent consumers, and replay operations are tested and documented.
- [ ] Maximum document/job size and duration are measured. Oversized/long work
      is checkpointed or remains in a bounded EC2 worker.
- [ ] Terraform IAM scopes each worker/queue/store, reuses existing infrastructure,
      and adds queue/operation alarms with a reviewed small-usage cost estimate.
- [ ] Local fault tests, Terraform validation, and controlled AWS end-to-end
      acceptance distinguish implemented/configured/verified status clearly.

Publish/apply and live AWS acceptance require real account configuration; issue
completion must record their actual evidence rather than equating mocks with it.
