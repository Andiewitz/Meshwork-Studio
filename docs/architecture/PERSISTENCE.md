# Canvas Persistence

Canvas documents use a two-layer persistence model: browser storage for
immediate recovery and DynamoDB for the durable source of truth. PostgreSQL
owns workspace metadata, teams, AI data, and metrics; it does not store canvas
nodes or edges.

## Write path

```text
Canvas change
  -> localStorage written immediately
  -> 3-second idle debounce
  -> POST /api/v1/workspaces/:id/sync-canvas
  -> ownership and editor-role check
  -> DynamoDB diff write
```

The browser cache key is `meshwork-canvas-cache-{workspaceId}`. It is cleared
only after the API confirms the durable write. On a failed sync, the cache is
kept for the next edit or reload.

## DynamoDB document model

The canvas service stores one item per node or edge in the `CANVAS_DDB_TABLE`
table (default `meshwork-canvas`):

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

| File                                            | Responsibility                                             |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `client/src/lib/canvas-cache.ts`                | Local recovery cache                                       |
| `client/src/pages/Workspace.tsx`                | Debounced autosave and save status                         |
| `client/src/hooks/use-canvas.ts`                | Canvas API mutation                                        |
| `server/services/canvas/routes/canvasRoutes.ts` | Authentication, access, and role checks                    |
| `server/services/canvas/db/dynamo.ts`           | DynamoDB schema, reads, diff writes, duplication, deletion |

## Verification

Run the canvas-focused unit and integration suites after changing this flow:

```bash
npm run test:run -- tests/unit/workspace/canvas-cache.test.ts
npm run test:system
```

For production, alarm on DynamoDB throttling/errors, enable point-in-time
recovery, and periodically restore a sample canvas from backup. The archive
and restore requirements are in
[`../../plans/Q5-BACKUP-AND-RECOVERY.md`](../../plans/Q5-BACKUP-AND-RECOVERY.md).
