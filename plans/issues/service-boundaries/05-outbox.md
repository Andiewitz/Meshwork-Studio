**Audit ID:** SB-05 · **Priority:** P1 · **Dependencies:** none for the immediate
delivery fix; use SB-02/SB-03 contracts before externalizing the transport.

**Tracker:** [#49](https://github.com/Andiewitz/Meshwork-Studio/issues/49)

## Problem and reproduction

Workspace persists mutation/outbox rows transactionally, then acknowledges an
event after `EventBus.emitAsync()`. The real bus resolves successfully with zero
listeners. A memory-only diagnostic feeding one real cleanup event to an empty
bus produced `acknowledged: 1, failed: 0`. Current composition installs Canvas
first; extraction or miswiring can silently discard required work.

The dispatcher also claims 25 events for 60 seconds and processes them serially.
Claims have no owner token/renewal, and completion/failure updates do not fence
stale owners. Running a second dispatcher can overlap slow work. Copy status
currently becomes `ready` immediately after local delivery returns.

Evidence: `server/services/workspace/outbox.ts`, `outbox-service.ts`,
`server/lib/events.ts`, and `server/routes.ts` at `bbfec7f`.

## Proposed solution

Require an explicit confirmed durable handler/transport for required work.
Record lease ownership and fence all settlement, with renewal or bounded
claiming. Distinguish outbox publication from domain-operation completion.
Workspace owns copy metadata; a future remote Canvas completion must carry an
operation ID and be applied idempotently before marking a workspace ready.

## Acceptance criteria

- [ ] Zero required consumers cannot acknowledge/delete a cleanup or copy job;
      the failure remains retryable and observable.
- [ ] A failing consumer does not settle required work as completed.
- [ ] Tests with two dispatchers, expired leases, delayed settlement, and restart
      prove stale workers cannot overwrite a newer claim/result.
- [ ] Delivery can repeat after a crash; operation IDs and handler contracts make
      replay safe, coordinated with Canvas consistency work SB-06.
- [ ] Publication and completion are separate states; publish success alone
      never changes a workspace to `ready`.
- [ ] Exhaustion, dead-letter replay, queue/operation age, and shutdown/drain
      behavior have tests and an operator procedure.
- [ ] SQL mutation plus outbox insertion remains one transaction; failed or
      rolled-back mutations never emit committed commands.
