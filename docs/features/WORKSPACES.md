# Workspace and canvas access (reference)

> Status: active · Updated: 2026-10-12 · Context: who can see and change
> what. Canvas data shapes: [`../architecture/CANVAS_SCHEMA.md`](../architecture/CANVAS_SCHEMA.md);
> how canvases are saved: [`../architecture/PERSISTENCE.md`](../architecture/PERSISTENCE.md).

Workspaces hold canvas metadata in PostgreSQL and canvas documents in DynamoDB.
Collections are private folders owned by one user. Workspace owners grant direct
view or edit access to verified collaborators. Team membership grants no access.

This page describes runtime HTTP behaviour. The typed workspace contract is
[`server/shared/routes.ts`](../../server/shared/routes.ts); route handlers are
the authority when a contract and runtime response differ.

## Authentication and error conventions

All endpoints require an authenticated session. Mutating endpoints also require
the CSRF token supplied by the application.

| Status | Meaning                                                                                     |
| ------ | ------------------------------------------------------------------------------------------- |
| `401`  | Missing or invalid session.                                                                 |
| `403`  | Authenticated caller does not have the required access.                                     |
| `404`  | Workspace or collection does not exist.                                                     |
| `400`  | Request body fails validation.                                                              |
| `409`  | Canvas revision conflict, copy still running, or an ineligible copy retry.                  |
| `503`  | Workspace listing/dependency unavailable, canvas copy failed, or durable write unavailable. |

## Workspace permissions

Workspace owns access decisions. The owner has full access; a collaborator with
`edit` can read and update the workspace and canvas, while `view` can only read
and use presence. Only the owner may manage collaborators, duplicate, delete,
or retry a canvas copy. A missing grant denies access.

## Workspace API

All paths are rooted at `/api/v1`.

| Method and path                          | Required access  | Notes                                                                                            |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| `GET /workspaces?collectionId=`          | Session          | Lists the caller's owned workspaces, optionally in one collection.                               |
| `POST /workspaces`                       | Session + CSRF   | Creates a workspace owned by the caller. Title is 1–16 allowed characters.                       |
| `GET /workspaces/:id`                    | Viewer or owner  | Returns metadata.                                                                                |
| `PUT /workspaces/:id`                    | Editor or higher | Updates validated metadata.                                                                      |
| `DELETE /workspaces/:id`                 | Owner            | Atomically removes metadata and queues durable canvas cleanup.                                   |
| `POST /workspaces/:id/duplicate`         | Owner            | Creates a destination workspace in `copying` state and queues canvas copy.                       |
| `POST /workspaces/:id/retry-canvas-copy` | Owner            | Requeues only a workspace in `failed` copy state.                                                |
| `GET /workspaces/:id/role`               | Session          | Returns the Workspace collaborator role or `none`. |
| `GET /workspaces/:id/members`            | Viewer or owner  | Returns the first sharing team and its members, or an empty list.                                |

`DELETE` returning `204` means the cleanup event was committed. It does not
mean DynamoDB deletion completed synchronously.

Required delivery, claim fencing, and dead-letter recovery are documented in
[Workspace outbox operations](../operations/WORKSPACE_OUTBOX.md).

Listing includes directly shared workspaces at the root. Workspace storage
failures return `503 WORKSPACE_LIST_UNAVAILABLE` with a request ID.

## Canvas API and copy lifecycle

| Method and path                         | Required access                                      | Response / failure behaviour                                                                                  |
| --------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /workspaces/:id/canvas`            | Viewer or owner                                      | Returns `{ nodes, edges, revision }`. A copying workspace returns `409`; a failed copy returns `503`.         |
| `POST /workspaces/:id/canvas`           | Editor or higher + CSRF                              | Saves `{ nodes, edges, baseRevision }` or `{ changes, baseRevision }`; responds with `{ success, revision }`. |
| `POST /workspaces/:id/duplicate-canvas` | Editor on source, direct owner of destination + CSRF | Internal-style copy endpoint for a specified destination.                                                     |

Canvas writes are optimistic. A stale `baseRevision` returns `409` with the
current revision; reload before retrying. Incomplete DynamoDB writes return
`503`; preserve the browser cache and retry later. Snapshot publication and
copy replay use the generation fencing described in
[Canvas persistence](../architecture/PERSISTENCE.md).

`changes` supports `upsertNodes`, `upsertEdges`, `deleteNodeIds`, and
`deleteEdgeIds`. The server merges the delta into the stored canvas, removes
edges attached to deleted nodes, and validates the resulting graph; an invalid
result returns `400 INVALID_CANVAS`. A full snapshot remains supported and is
used by import/duplicate and by the editor when a delta is not smaller.

A duplicate begins as `copying`, becomes `ready` when the outbox worker
finishes, and becomes `failed` if that job cannot complete. The retry endpoint
moves only `failed` copies back to `copying`.

## Collections API

Collections are never team-shared. They are strictly scoped to `collection.userId`.

| Method and path              | Notes                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /collections?parentId=` | Lists the caller's root or child collections.                                               |
| `POST /collections`          | Creates a collection; accepts optional `parentId`.                                          |
| `GET /collections/:id`       | Returns the collection only to its owner.                                                   |
| `PUT /collections/:id`       | Updates the owned collection.                                                               |
| `DELETE /collections/:id`    | Removes the collection but intentionally leaves its workspaces in place with no collection. |

## Collaborator management

The owner can list and manage direct collaborators at
`/workspaces/:id/collaborators`. Adding a collaborator requires an existing,
verified account email and `view` or `edit` permission. Team workspace sharing
is disabled and Team membership does not grant access.

## Implementation map

| File                                                                              | Responsibility                                      |
| --------------------------------------------------------------------------------- | --------------------------------------------------- |
| [`workspaceRoutes.ts`](../../server/services/workspace/routes/workspaceRoutes.ts) | Workspace and collection HTTP handlers.             |
| [`canvasRoutes.ts`](../../server/services/canvas/routes/canvasRoutes.ts)          | Canvas reads, writes, revisions, and copy failures. |
| [`teamRoutes.ts`](../../server/services/team/routes/teamRoutes.ts)                | Team membership endpoints.              |
| [`permissions.ts`](../../server/shared/permissions.ts)                            | Role rank and capability rules.                     |
| [`PERSISTENCE.md`](../architecture/PERSISTENCE.md)                                | DynamoDB and browser-cache persistence details.     |
