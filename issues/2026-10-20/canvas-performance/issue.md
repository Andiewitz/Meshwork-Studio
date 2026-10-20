# perf(canvas): canvas reads/writes scale with every node and edge — the #1 scaling blocker

**Component:** Canvas Editor + Monolith API + DynamoDB
**Severity:** High (capacity wall + cost wall)
**Labels:** `performance`, `scalability`, `canvas`, `database`
**Found in:** load test 2026-10-20 (`tests/load/results/capacity-report.md`)
**GitHub:** [#48](https://github.com/Andiewitz/Meshwork-Studio/issues/48)
**Companions:** [`solution.md`](solution.md) · [`postmortem.md`](postmortem.md)
**Plan commit:** [`7b2d332`](https://github.com/Andiewitz/Meshwork-Studio/commit/7b2d332)
**Implementation commit:** [`ae65505`](https://github.com/Andiewitz/Meshwork-Studio/commit/ae65505)
**Status:** Phase 2a + 2b implemented; real-DynamoDB/S3 and load verification
pending.

## Summary

Opening a canvas reads **every node and edge as a separate DynamoDB item, with
consistent reads**. Saving a canvas reads the **entire partition again**, does
5+ sequential DynamoDB round trips behind a lock, and uploads the **full
canvas** from the client. Read and write cost therefore grows linearly with
canvas size (today 90 items; schema allows 15,000). This is the main reason the
stack stops at ~400 concurrent users and the main reason a real DynamoDB bill
would be enormous — the 90-item model is fine for demos and catastrophic for
growth.

No functional bug: canvases load and save correctly. The issue is the cost
model and the throughput ceiling.

## Impact

- `GET /canvas` = 1 `Query` returning **N+M items** (`ConsistentRead: true`),
  not 1 document read.
- `POST /canvas` = **5–7 sequential DDB operations**, including a second full
  partition read, plus a full-canvas JSON upload from the client every save.
- Throughput of the canvas endpoint is inversely proportional to canvas size.
  At 90 items it works; at 5,000 nodes + 10,000 edges (allowed by the schema)
  a single save re-reads 15,000 items before writing.
- On real DynamoDB, strongly consistent reads are billed per 4 KB item: the
  current 400-VU workload (~37 canvas reads/s × 90 items) already costs
  **~3.3k RCU/s ≈ 8.6 billion RCU/month ≈ $2,100/month** just for canvas reads.
  At 10k concurrent users that becomes ~$50k/month; at 1M it is structurally
  unaffordable. DynamoDB Local hides this because it is free and in-memory.
- Save path serializes per workspace on a TTL lock; under collaboration,
  concurrent saves get `503 CANVAS_WRITE_IN_PROGRESS` or `409
CANVAS_REVISION_CONFLICT` and the client replays the whole canvas.

## Environment

- Node monolith (`server/`), Go auth, DynamoDB Local in the Compose rig.
- Load rig: 4 vCPU / 8 GiB, `docker-compose.loadtest.big.yml`, k6.
- Data: 40 nodes + 50 edges per seeded canvas (`tests/load/seed.mjs:39-40`).
- Measured: 400 VUs = 81.7 RPS, p95 228 ms, 0 failures; 600 VUs = p95 3.9 s
  (login 429s dominate, but canvas work is the next ceiling).

## Steps to reproduce

### A. Manual (single workspace)

1. Start the stack and open a workspace canvas.
2. Create ~40 nodes and ~50 edges; wait for the 3 s save debounce
   (`client/src/pages/Workspace.tsx:900-941`).
3. In devtools → Network:
   - the `POST /api/v1/workspaces/:id/canvas` body contains **all** nodes and
     edges, not a delta;
   - the response is only `{ success, revision }`.
4. Reload: `GET .../canvas` returns all items again. In DynamoDB Local,
   inspect the table: each node/edge is its own item under
   `pk = ws#<workspaceId>` (`server/services/canvas/db/dynamo.ts:1-10`).
5. Scale the canvas (e.g. 400 nodes, 500 edges) and repeat: latency and DDB
   scan size grow roughly linearly. A 5,000-node canvas makes one save read
   5,000+ items before it writes anything.

### B. Load-test reproduction (quantitative)

```sh
rm -rf tests/load/results/*
docker volume rm meshwork-studio_pgdata_loadtest meshwork-studio_redis_loadtest

# Baseline: 90-item canvases
LOADTEST_BIG=1 USERS=800 CANVAS_NODES=40 CANVAS_EDGES=50 \
  STAGE_TABLE="400:210" LOGIN_STAGGER_SEC=90 \
  ./scripts/loadtest.sh --yes

# Heavy canvas: same 400 users, ~10x canvas size
LOADTEST_BIG=1 USERS=800 CANVAS_NODES=400 CANVAS_EDGES=500 \
  STAGE_TABLE="400:210" LOGIN_STAGGER_SEC=90 \
  ./scripts/loadtest.sh --yes
```

Compare p95 for the canvas endpoints and DDB CPU in
`tests/load/results/sampler.csv`. Also works with `CANVAS_CURVE=1` (90/130)
for a smaller size step.

## Root cause

### 1. GET reads the whole partition (one item per node/edge)

`server/services/canvas/db/dynamo.ts:208-240`, called by
`getCanvas()` at `:352-369` and routed at
`server/services/canvas/routes/canvasRoutes.ts:40-72`:

```ts
// dynamo.ts:224-234
const res = await doc.send(
  new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "pk" },
    ExpressionAttributeValues: { ":pk": partitionKey(workspaceId) },
    ExclusiveStartKey: lastKey,
    ConsistentRead: true, // billed per item, 2x eventually-consistent
  }),
);
```

There is no document blob, no cache, no ETag. A read of a 90-item canvas is
90 item reads; at the 15,000-item cap it is 15,000 item reads per request.

### 2. Save is a multi-round-trip, lock-guarded read-modify-write

`server/services/canvas/db/dynamo.ts:392-459`:

```ts
const lockOwner = await acquireCanvasLock(workspaceId); // 1. PutItem (conditional)
const currentRevision = await getCanvasRevision(workspaceId); // 2. GetItem
// ...
const existing = (await queryPartition(workspaceId)) // 3. full partition Query
  .filter(isCanvasItem);
// ... diff by JSON.stringify ...
if (requests.length > 0) await batchWrite(requests); // 4. BatchWrite (25/chunk)
await doc.send(new PutCommand({/* meta revision */})); // 5. PutItem (conditional)
// finally: releaseCanvasLock                                 // 6. DeleteItem
```

- The lock is one item per workspace with a 120 s TTL
  (`dynamo.ts:143-144, 264-290`). Two editors in one room serialize; the loser
  gets 503/409.
- The diff (`dynamo.ts:429-435`) runs `JSON.stringify` twice per item over the
  whole canvas on every save — CPU on the single Node event loop.
- There is no `TransactWriteItems`: if the batch succeeds and the revision put
  fails, the stored items are newer than `meta`, so the next read can be
  internally inconsistent.

### 3. Client uploads the full canvas on every save

`client/src/pages/Workspace.tsx:914-922`:

```ts
saveTimeoutRef.current = setTimeout(() => {
  setSaveStatus("saving");
  sync(
    {
      nodes: persistedCanvas.nodes, // entire canvas
      edges: persistedCanvas.edges, // entire canvas
      baseRevision: canvasRevisionRef.current,
      cacheGeneration,
    } /* ... */,
  );
}, 3000);
```

The 3 s debounce limits frequency, not size. Payload size is O(canvas), the
API body limit is 5 MB (`server/index.ts:241`), and Zod validates the whole
graph per save (`server/shared/canvas.ts:96-102`; caps 5,000 nodes / 10,000
edges).

### 4. Secondary costs on the same request

- Access check: `getWorkspace` + `teamStorage.canAccessWorkspace` (up to 3
  DB/HTTP hops) before the canvas is even read
  (`canvasRoutes.ts:42-68`; `team/db/storage.ts:365-395`).
- No `ETag`/304 and no server-side cache; every open/reload re-reads DDB.
- The WS path relays canvas ops without persisting them
  (`presence.ts:539-582`), so collaboration does not reduce HTTP saves — it
  adds a second, divergent path.

## Scale math (why this is the wall)

At 40,000 RPS (20% of 1M users active, measured cadence ~0.2 req/s):

| Operation                 | Per unit                        | Result                                                |
| ------------------------- | ------------------------------- | ----------------------------------------------------- |
| Canvas reads (45% mix)    | 90 items/read                   | **1.6M item reads/s**                                 |
| Saves (25% mix)           | 90-item re-read + 5 round trips | **10k saves/s, ~60k DDB ops/s, 900k re-read items/s** |
| At schema cap (15k items) | per read                        | **240M+ item reads/s**                                |

DynamoDB on-demand's default per-table ceiling is 40,000 RCU/s — the current
90-item read design saturates that at **~444 canvas reads/s**, i.e. well below
even 10k concurrent users. This design cannot be fixed by instance size.

## Proposed fix (ranked)

**Decision (2026-10-20):** DynamoDB is the live document store (CAS on
`revision`); S3 is the overflow/archive tier for canvases above ~350 KB and for
history. Redis + ETag sit in front. S3 is not the hot read/write path. Full
rationale and phase plan: [`solution.md`](solution.md).

1. **ETag + 304 + revision-keyed cache (S, days).** Return `ETag: <revision>`;
   serve Redis-cached snapshots keyed by `canvas:<id>:<revision>`; invalidate
   on sync. Cuts repeat opens/reloads to zero DDB reads.
2. **Document model v2 (M, ~1–3 days).** Store the live canvas as one DynamoDB
   item (`pk = ws#<id>`, `sk = doc`, body = compressed nodes/edges) with
   `ConditionExpression: revision = :base`. Read = 1 `GetItem`, save = 1
   conditional `PutItem`; no lock, no re-read, no diff. Above ~350 KB, store the
   blob in S3 and keep `{revision, s3Key, etag, bytes}` in DynamoDB — still 1
   CAS write, still O(1) storage operations. Keep the existing API shape so the
   client changes little.
3. **Delta saves (M).** Client sends changed nodes/edges since `baseRevision`;
   server applies per-key writes. Combined with (2), large canvases stop
   re-uploading everything.
4. **Real-time/collab model (L).** Per-workspace room ownership + CRDT
   (Yjs/Automerge) with periodic snapshots; removes the lock/409 replay model
   and is required for wide collaboration. See `plans/SCALE-AUDIT-1M.md` §B1.

## Acceptance criteria

- `GET /canvas` performs **O(1) storage operations** regardless of canvas size:
  exactly 1 DDB `GetItem` (≤350 KB) or 1 DDB `GetItem` + 1 S3 `GetObject`
  (larger); p95 < 250 ms at 400 VUs with a 5,000-node canvas.
- `POST /canvas` performs **O(1) storage writes**: exactly 1 conditional DDB
  write (≤350 KB) or 1 S3 `PutObject` + 1 conditional DDB write (larger); no
  full partition re-read; no lock-induced 503 under normal single-writer load.
- Reopening an unchanged canvas returns **304 / cache hit with 0 DDB reads**.
- The 400-VU stage still passes with `CANVAS_NODES=400 CANVAS_EDGES=500`, and
  real-DynamoDB RCU cost for the run drops by ≥10×.
- Existing conflict semantics preserved: stale `baseRevision` → 409 with the
  current revision; no silent last-write-wins.

## Notes

- Do not "fix" this by giving the DynamoDB container more CPU. The cost is
  round trips and items, not compute.
- `import-canvas` and `duplicate-canvas` use the same item-per-node storage
  (`canvasRoutes.ts:164+`, `dynamo.ts:463+`); they inherit the same ceiling.
- Related: `plans/SCALE-AUDIT-1M.md` (blockers B1/B2), `plans/OPTIMIZATION-AUDIT.md`
items #2/#6 (canvas round trips, ETag), `docs/architecture/PERSISTENCE.md`.
</content>
