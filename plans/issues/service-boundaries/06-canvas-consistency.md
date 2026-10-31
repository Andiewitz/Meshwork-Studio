**Audit ID:** SB-06 · **Priority:** P1 before Canvas extraction ·
**Related:** #48 (existing Canvas storage/performance implementation).

**Tracker:** [#49](https://github.com/Andiewitz/Meshwork-Studio/issues/49)

## Problem

At audited main `bbfec7f`, `syncCanvas()` takes a write lease and checks a
revision, but `duplicateCanvas()` and `deleteWorkspaces()` bypass that protocol.
Copy retries read a mutable source and overlay destination items without
removing remnants from partial attempts. Public GET reads nodes, edges, and
revision independently in parallel. A prior HTTP existence/access check also
cannot fence a delayed document write after workspace deletion.

These are code-derived concurrency risks, not a claim of reproduced production
corruption. The implementation branch referenced by #48 may already address
part of the document model; review it before making changes.

## Scope and coordination

Extend #48's persistence design and tests to define consistent snapshot reads,
replay-safe copies, and deletion/generation fencing across every mutation path.
Decide whether copies represent a fixed source revision and make the behavior
explicit. Keep the storage engine behind the Canvas public module API. This
issue adds operation correctness gates; it does not commission a competing
performance/storage rewrite or CRDT migration.

## Acceptance criteria

- [ ] A read returns nodes, edges, and revision from one committed document
      state, including during concurrent saves and injected storage failures.
- [ ] Copy interruption/retry cannot leave a mixture of old and new source data
      or unrelated destination remnants; source-revision semantics are defined.
- [ ] Replaying a completed copy cannot overwrite subsequent destination edits.
- [ ] Concurrent save/copy/delete paths use the same fencing/generation rules.
      A delayed operation cannot recreate a deleted document.
- [ ] Partial failure never exposes a falsely completed revision/copy.
- [ ] DynamoDB-backed fault/concurrency tests cover crash, lease expiry,
      source changes, duplicate execution, and delete-versus-save races.
- [ ] #48's conflict semantics, migration, cache invalidation, cost/performance
      goals, and rollback remain intact; shared test evidence is linked.

Coordinate operation IDs and completion with SB-05. SB-11 must wait for these
gates before distributing document writers.
