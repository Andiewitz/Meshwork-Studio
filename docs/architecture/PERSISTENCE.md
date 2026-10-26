# Canvas persistence (reference)

> Status: implemented locally, deployment verification pending · Updated: 2026-10-26 · Context: where your diagram goes
> when you draw it, and how it survives reloads. Data shapes:
> [`CANVAS_SCHEMA.md`](./CANVAS_SCHEMA.md); backups:
> [`../operations/RECOVERY.md`](../operations/RECOVERY.md).

Canvas documents use a two-layer persistence model: browser storage for
immediate recovery and DynamoDB for the durable source of truth. PostgreSQL
owns workspace metadata, teams, AI data, and metrics; it does not store canvas
nodes or edges.

## Write path

```text
Canvas change
  -> localStorage written immediately
  -> 3-second idle debounce
  -> POST /api/v1/workspaces/:id/canvas
  -> direct-owner or shared editor-role check
  -> conditional publication of a complete DynamoDB snapshot
```

The browser cache key is `meshwork-canvas-cache-{workspaceId}`. It is cleared
only after the API confirms the durable write. On a failed sync, the cache is
kept for the next edit or reload.

## DynamoDB document model

The canvas service uses the existing `CANVAS_DDB_TABLE` (default
`meshwork-canvas`). A `doc` item is the only authority for a committed document:

| Attribute  | Value                                                               |
| ---------- | ------------------------------------------------------------------- |
| `pk`       | `ws#{workspaceId}`                                                  |
| `sk`       | `doc`                                                               |
| `revision` | Public optimistic concurrency revision                              |
| `token`    | Unique publication generation; used for conditional writes          |
| `pointer`  | Compressed complete payload, or immutable overflow-chunk descriptor |

Nodes and edges are encoded together. Up to 280 KiB of compressed data lives
inside the document item. Larger payloads use immutable chunks under
`snapshot#{generation}#{index}` in the same workspace partition. Chunk staging
transactions condition-check the current document token; only a successful
head publication makes them visible. Length and SHA-256 checks reject incomplete
payloads. The head, its payload, and the public revision describe one snapshot.

`getCanvas()` returns `{ nodes, edges, revision }` from that snapshot. Small
document reads require one GetItem; larger ones page through the chosen immutable
generation. If a concurrent save retires chunks while a reader holds an old head,
the reader retries against the newer head. Writes still use the submitted
`baseRevision`; stale updates keep the existing conflict response. Publication
also checks a unique generation token, so a delayed writer cannot exploit an
expired lease. The old lease is no longer needed.

A copy freezes its source revision when its durable operation intent is first
written. Its payload is staged in the destination, independently of subsequent
source edits or deletion. Publishing the destination and recording completion
are one DynamoDB transaction. Replaying a completed operation does not overwrite
later destination edits. An interrupted copy is retried with the same outbox
operation ID; a user-requested new retry is a new operation and can choose a newer
source revision. Direct `duplicate-canvas` calls use a stable source/destination
operation ID. Every copy replaces the full document rather than overlaying items.

Deletion first writes a permanent `doc` tombstone, then removes payload chunks,
legacy rows, and operation records. All mutation transactions check the head;
delayed save/copy/chunk requests cannot recreate a tombstoned document. Cleanup
failure remains retryable while the tombstone keeps the document inaccessible.
Workspace UUIDs must not be reused. The asynchronous HTTP delete acknowledgement
still means cleanup was queued, not that the DynamoDB deletion already finished.

Normal saves retire previous overflow chunks. Staged chunks from abandoned
attempts, and previous overflow chunks replaced by a copy, may remain as invisible
garbage until workspace deletion. Do not remove chunks merely because they are
not the current head: a pending copy intent may own them. A future garbage
collector needs token fencing and intent awareness. This storage overhead and
copy receipts should be measured before production rollout.

Each save writes the full compressed snapshot; large saves rewrite all of its
chunks. Delta updates, S3 overflow, and performance/cost targets from #48 remain
future work, and no load or AWS billing verification is claimed here.

## Migration and rollback

Legacy `node#`/`edge#`/`meta` rows remain readable until the first successful new
publication; their revision is preserved and incremented normally. After that
publication, legacy rows are cleaned up. **Stop every old writer before rollout**:
old binaries do not understand the new head or deletion markers. Verify the EC2
role permits the transactional writes and condition checks on the canvas table.
No infrastructure or IAM changes are applied by this implementation.

After a document migrates, a raw rollback to the old binary is unsafe. Rollback
requires a maintenance-window export of committed snapshots back into the old
node/edge model, or restoration of the pre-rollout backup. Keep all writers
stopped during conversion. That conversion and a live restore drill have not
been performed here; take and verify a backup before deployment.

The implementation claims in #48 reference commits unavailable in this checkout
or through GitHub at audit time. They are unverified. This correctness change
uses the planned conditional document approach but does not claim #48's S3
overflow, Redis cache, ETag/304, delta-save, or load-test work is implemented.
No public response fields, status/error formatting, or browser cache policy are
changed by the new persistence model.

## Operational configuration

| Variable            | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `CANVAS_DDB_TABLE`  | Canvas table name                            |
| `AWS_REGION`        | AWS region for DynamoDB                      |
| `DYNAMODB_ENDPOINT` | Local DynamoDB endpoint for development only |

The service can create a missing table with on-demand billing. In production,
provision it through deployment automation and restrict the application IAM
role to that one table. Table creation at application boot is convenient for
local development but should not be a production permission.

## Key implementation files

| File                                            | Responsibility                                          |
| ----------------------------------------------- | ------------------------------------------------------- |
| `client/src/lib/canvas-cache.ts`                | Local recovery cache                                    |
| `client/src/pages/Workspace.tsx`                | Debounced autosave and save status                      |
| `client/src/hooks/use-canvas.ts`                | Canvas API mutation                                     |
| `server/services/canvas/routes/canvasRoutes.ts` | Authentication, access, and role checks                 |
| `server/services/canvas/db/dynamo.ts`           | DynamoDB client and table setup                         |
| `server/services/canvas/db/snapshots.ts`        | Atomic reads, writes, copy intents and deletion fencing |

## Verification

Run the canvas-focused unit and integration suites after changing this flow:

```bash
npm run test:run -- tests/unit/workspace/canvas-cache.test.ts
npm run test:run -- tests/unit/canvas tests/integration/canvas tests/integration/authz
npm run test:system
```

Unit tests use a deterministic command adapter to inject publication failures,
concurrent saves, interrupted copies, source edits, and delayed writes after
deletion. `tests/system/canvas/consistency.test.ts` exercises the same protocol
against DynamoDB Local, including large payloads and real transaction conditions.
That system suite is wired into existing CI, but was not run locally: Docker
was unavailable and the user chose to leave DynamoDB verification pending.
Do not treat the command adapter as proof of AWS transaction semantics.

For production, alarm on DynamoDB throttling/errors, enable point-in-time
recovery, and periodically restore a sample canvas from backup. The archive
and restore requirements are in
[`RECOVERY.md`](../operations/RECOVERY.md).
