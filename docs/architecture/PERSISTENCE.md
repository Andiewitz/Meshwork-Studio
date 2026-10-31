# Canvas persistence

Status: merge implementation under local verification; not deployed. This
integrates the atomic snapshot and replay guarantees from this branch with
the delta, ETag, and S3 work from `main`. DynamoDB-backed and live S3
verification are still pending.

The browser keeps a local recovery copy while an edit is unsaved. The Node
service stores the durable canvas in DynamoDB, with optional S3 overflow.
PostgreSQL owns workspace metadata and the outbox; it does not hold canvas
nodes and edges. [Internal module APIs](./MODULE_APIS.md) describe the service
boundaries.

## Read and write path

The client sends either a full snapshot or a delta to the existing canvas
endpoint. Deltas are applied to the current snapshot, including cascading
deleted-node edges, and the merged graph is validated before publication.
Every save uses the submitted base revision: a concurrent edit is rejected
rather than silently overwritten. The service returns the same public success
and error envelopes as `main`.

A DynamoDB item at `pk = ws#{workspaceId}, sk = doc` is the sole authority
for a committed canvas. It contains a revision, a unique publication token,
and a pointer to one complete compressed snapshot. A conditional head write
makes the new snapshot visible all at once. A failed or concurrent publication
cannot expose a partially written revision.

Small snapshots are stored in the head item. Larger snapshots use immutable
DynamoDB chunks or S3 objects, depending on configuration. Length and SHA-256
checks detect missing or incomplete payloads. The Redis cache stores snapshots
by revision; reads can return the existing ETag/304 response. Cache failures
fall through to durable storage, and saves, copies, and deletes update or
invalidate cached values.

The outbox sends required deletion and copy work with a stable operation ID.
Copy intents and receipts prevent replay from overwriting a later destination
edit. Deletions install a permanent tombstone before cleanup, fencing delayed
saves and copies. See [the outbox runbook](../operations/WORKSPACE_OUTBOX.md).

## Existing data and rollout

Existing item-per-node canvases remain readable. Their next atomic write
publishes a complete head before retiring the old items. An optional backfill
preserves the existing revision and leaves the old rows in place:

```bash
npx tsx scripts/migrate-canvas-docs.ts --dry-run
npx tsx scripts/migrate-canvas-docs.ts --workers-stopped
```

Stop all old canvas writers before backfill or deployment; old per-item
writers and atomic writers cannot safely run together. Back up the table and
verify a sample before changing production. The user confirmed that the
earlier S3/document implementation has not been deployed with real canvas
data. If an older document-format item is nevertheless encountered, the new
adapter fails closed with `CANVAS_DOC_CONFIG`; it does not overwrite or
interpret it as an empty canvas.

The `--to-legacy --workers-stopped` tool can restore an atomic snapshot to
per-node rows. It writes and verifies those rows before conditionally removing
the atomic head, and retains S3 objects for recovery. It also supports historical
document records. Rolling an atomic deployment back to an old binary requires
this planned export/restore and a maintenance window; a binary rollback alone
is unsafe.

## Configuration and S3

| Variable                           | Behavior                                     |
| ---------------------------------- | -------------------------------------------- |
| `CANVAS_DDB_TABLE`                 | Canvas table; default `meshwork-canvas`      |
| `CANVAS_DOC_MODEL=on`              | Use S3 for snapshots above the inline limit  |
| `CANVAS_DOC_MODEL=off` or `read`   | Use DynamoDB chunks for overflow             |
| `CANVAS_DOC_INLINE_MAX_BYTES`      | Optional inline threshold, capped at 280 KiB |
| `CANVAS_S3_BUCKET`                 | S3 bucket used for overflow                  |
| `CANVAS_S3_PREFIX`                 | Object prefix; default `canvases`            |
| `AWS_REGION`                       | DynamoDB and S3 region                       |
| `DYNAMODB_ENDPOINT`, `S3_ENDPOINT` | Optional local development endpoints         |

The atomic format is used in every mode. This intentionally changes the old
`off/read/on` rollout semantics: `off` and `read` no longer write individual
nodes, and `read` is not a shadow-read mode. `on` preserves S3 overflow.
The application role needs DynamoDB access and, when using S3, `s3:GetObject`,
`s3:PutObject`, `s3:DeleteObject`, and prefix-restricted `s3:ListBucket`.
Provision and verify the bucket and permissions before enabling S3 mode.

S3 objects are immutable and scoped by workspace. Failed publications can
leave unreferenced objects; previous objects are retained until workspace
deletion. Deletion lists and removes the workspace prefix and retries if S3
reports a failure. A delayed or ambiguous cross-service upload can still leave
an orphan after a deletion: use a suitable bucket lifecycle policy and monitor
storage until a durable garbage collector is implemented. Storage and S3
requests can incur usage charges.

## Verification

Focused unit tests cover legacy reads/backfill, atomic publication and copy
replay, delta validation, S3 overflow, failed writes, and deletion races using
in-memory or mocked adapters. Route tests cover delta and ETag behavior.
These tests do not prove real DynamoDB transactions or S3 permissions.

Run the system suite against DynamoDB Local before deployment:

```bash
npx vitest run tests/unit/canvas tests/integration/canvas
npm run test:system
```

Live S3, AWS IAM, production data migration, and rollback remain operator
verification steps. Backup and restore procedures are in
[Recovery](../operations/RECOVERY.md).
