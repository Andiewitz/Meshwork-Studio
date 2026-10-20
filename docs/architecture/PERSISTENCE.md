# Canvas persistence (reference)

> Status: active · Updated: 2026-10-20 · Context: where your diagram goes
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
  -> DynamoDB diff write (off/read) or document CAS + S3 (on)
```

The browser cache key is `meshwork-canvas-cache-{workspaceId}`. It is cleared
only after the API confirms the durable write. On a failed sync, the cache is
kept for the next edit or reload.

## DynamoDB storage modes

`CANVAS_DOC_MODEL` selects the storage layout:

| Mode   | Reads                              | Writes                           |
| ------ | ---------------------------------- | -------------------------------- |
| `off`  | Legacy item-per-node query         | Legacy diff write                |
| `read` | Document when present, else legacy | Legacy diff write                |
| `on`   | Document when present, else legacy | Document write with revision CAS |

Legacy mode stores one item per node or edge in `CANVAS_DDB_TABLE` (default
`meshwork-canvas`):

| Attribute | Value                              |
| --------- | ---------------------------------- |
| `pk`      | `ws#{workspaceId}`                 |
| `sk`      | `node#{nodeId}` or `edge#{edgeId}` |
| `body`    | The remaining React Flow payload   |

`syncCanvas()` first queries the workspace partition, then deletes absent
items and writes only new or changed items. DynamoDB batch writes are limited
to 25 requests per request, retried when DynamoDB returns unprocessed items,
and never acknowledged if retries are exhausted. A per-workspace revision and
short write lease reject stale snapshots with a visible conflict instead of a
silent last-writer-wins overwrite.

Document mode stores one item plus an optional S3 object per workspace:

| Location | Value                                                                      |
| -------- | -------------------------------------------------------------------------- |
| DynamoDB | `pk = ws#{workspaceId}`, `sk = doc`                                        |
| Inline   | `body` (gzip JSON), used at or below 350 KB compressed                     |
| Overflow | `s3Key`, `etag`, `bytes`; object is `canvases/<ws>/<rev>-<writer>.json.gz` |

Reads are one consistent `GetItem`, plus one S3 `GetObject` for a large
document. Writes replace the document and commit with
`ConditionExpression: revision = :base`; a stale writer gets a 409 and never
acquires a lock. S3 objects are immutable per write, so old revisions can be
retained by bucket versioning/lifecycle policy. Enable S3 versioning and
lifecycle before turning document mode on; `db:backup` only archives the
DynamoDB table, not S3 objects. The backfill script is
`npm run canvas:migrate-docs` (add `-- --dry-run` to list only). To roll back
after `on`, quiesce writes, run `npm run canvas:migrate-docs -- --to-legacy`
to rewrite the item model from the document, then set `CANVAS_DOC_MODEL=off`.

## Read cache and ETag

`GET /canvas` returns `ETag: "<revision>"`. The service keeps
`canvas:<workspaceId>:rev` and `canvas:<workspaceId>:<revision>` in Redis for
10 minutes, so an unchanged reload with `If-None-Match` returns 304 without a
DynamoDB or S3 call. Writes update the cache after the durable save; a Lua
script prevents an older writer from moving the cached revision backwards.
Cache errors fall through to storage. Duplicate and workspace deletion
invalidate the destination revision pointer.

`POST /canvas` also accepts a delta:
`{ changes: { upsertNodes, upsertEdges, deleteNodeIds, deleteEdgeIds }, baseRevision }`.
The server merges it into the current document, cascades node deletes to
attached edges, revalidates the full graph, and commits with the same revision
CAS. Document mode reads the document once; legacy mode merges inside the
existing lock. The client falls back to a full snapshot on reorder or large
edits, and import/duplicate remain full-snapshot writes.

## Operational configuration

| Variable                      | Purpose                                       |
| ----------------------------- | --------------------------------------------- |
| `CANVAS_DDB_TABLE`            | Canvas table name                             |
| `CANVAS_DOC_MODEL`            | `off`, `read`, or `on` (default `off`)        |
| `CANVAS_S3_BUCKET`            | Bucket for documents above the inline limit   |
| `CANVAS_S3_PREFIX`            | Object key prefix (default `canvases`)        |
| `CANVAS_DOC_INLINE_MAX_BYTES` | Inline threshold for tests/ops (default 350K) |
| `AWS_REGION`                  | AWS region for DynamoDB and S3                |
| `DYNAMODB_ENDPOINT`           | Local DynamoDB endpoint for development only  |
| `S3_ENDPOINT`                 | Optional S3-compatible endpoint for dev       |

The service can create a missing table with on-demand billing. In production,
provision it through deployment automation and restrict the application IAM
role to that one table. Table creation at application boot is convenient for
local development but should not be a production permission. Document mode
needs `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` on the configured
bucket/prefix.

## Key implementation files

| File                                            | Responsibility                                             |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `client/src/lib/canvas-cache.ts`                | Local recovery cache                                       |
| `client/src/pages/Workspace.tsx`                | Debounced autosave and save status                         |
| `client/src/hooks/use-canvas.ts`                | Canvas API mutation                                        |
| `client/src/lib/canvas-delta.ts`                | Client-side delta planner and full-save fallback           |
| `server/services/canvas/routes/canvasRoutes.ts` | Authentication, access, ETag, and role checks              |
| `server/services/canvas/cache.ts`               | Redis snapshot cache and revision-keyed ETag helpers       |
| `server/services/canvas/db/dynamo.ts`           | Storage modes, doc CAS, S3 overflow, duplication, deletion |

## Verification

Run the canvas-focused unit and integration suites after changing this flow:

```bash
npx vitest run tests/unit/canvas tests/integration/canvas
npm run test:system
```

For production, alarm on DynamoDB throttling/errors, enable point-in-time
recovery, and periodically restore a sample canvas from backup. The archive
and restore requirements are in
[`RECOVERY.md`](../operations/RECOVERY.md).
