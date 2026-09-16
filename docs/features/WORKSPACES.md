# Workspaces, Teams, and Canvas Access

Workspaces hold canvas metadata in PostgreSQL and canvas documents in DynamoDB.
Collections are private folders owned by one user. Teams can share a workspace
with members according to their team role.

This page describes runtime HTTP behaviour. The typed workspace contract is
[`server/shared/routes.ts`](../../server/shared/routes.ts); route handlers are
the authority when a contract and runtime response differ.

## Authentication and error conventions

All endpoints require an authenticated session. Mutating endpoints also require
the CSRF token supplied by the application.

| Status | Meaning                                                                    |
| ------ | -------------------------------------------------------------------------- |
| `401`  | Missing or invalid session.                                                |
| `403`  | Authenticated caller does not have the required access.                    |
| `404`  | Workspace or collection does not exist.                                    |
| `400`  | Request body fails validation.                                             |
| `409`  | Canvas revision conflict, copy still running, or an ineligible copy retry. |
| `503`  | Canvas copy failed or the durable write is temporarily unavailable.        |

## Workspace permissions

The workspace row's `userId` is authoritative for its direct owner. Team roles
add shared access without replacing that relationship. This direct-owner check
deliberately lets an owner continue to work if the team ownership mirror is
unavailable.

| Effective role         | View | Edit canvas / metadata | Duplicate, delete, retry copy |                                Manage team membership |
| ---------------------- | ---: | ---------------------: | ----------------------------: | ----------------------------------------------------: |
| `workspace-owner`      |  Yes |                    Yes |                           Yes | Owns the workspace; team actions still use team role. |
| team `owner` / `admin` |  Yes |                    Yes |                           Yes |                           Yes, subject to team rules. |
| team `editor`          |  Yes |                    Yes |                            No |                                                    No |
| team `viewer`          |  Yes |                     No |                            No |                                                    No |
| `none`                 |   No |                     No |                            No |                                                    No |

Do not use a failed lookup as permission to write. The direct owner check is
only valid when `workspace.userId === req.user.id`; all other access is decided
by the team service.

## Workspace API

All paths are rooted at `/api/v1`.

| Method and path                          | Required access  | Notes                                                                                            |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| `GET /workspaces?collectionId=`          | Session          | Lists the caller's owned workspaces, optionally in one collection.                               |
| `POST /workspaces`                       | Session + CSRF   | Creates a workspace owned by the caller. Title is 1–16 allowed characters.                       |
| `GET /workspaces/:id`                    | Viewer or owner  | Returns metadata.                                                                                |
| `PUT /workspaces/:id`                    | Editor or higher | Updates validated metadata.                                                                      |
| `DELETE /workspaces/:id`                 | Admin or owner   | Atomically removes metadata and queues durable canvas cleanup.                                   |
| `POST /workspaces/:id/duplicate`         | Admin or owner   | Creates a destination workspace in `copying` state and queues canvas copy.                       |
| `POST /workspaces/:id/retry-canvas-copy` | Admin or owner   | Requeues only a workspace in `failed` copy state.                                                |
| `GET /workspaces/:id/role`               | Session          | Returns the team resolver's role or `none`; route guards remain authoritative for direct owners. |
| `GET /workspaces/:id/members`            | Viewer or owner  | Returns the first sharing team and its members, or an empty list.                                |

`DELETE` returning `204` means the cleanup event was committed. It does not
mean DynamoDB deletion completed synchronously.

## Canvas API and copy lifecycle

| Method and path                         | Required access                                      | Response / failure behaviour                                                                          |
| --------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /workspaces/:id/canvas`            | Viewer or owner                                      | Returns `{ nodes, edges, revision }`. A copying workspace returns `409`; a failed copy returns `503`. |
| `POST /workspaces/:id/canvas`           | Editor or higher + CSRF                              | Saves `{ nodes, edges, baseRevision }`; responds with `{ success, revision }`.                        |
| `POST /workspaces/:id/duplicate-canvas` | Editor on source, direct owner of destination + CSRF | Internal-style copy endpoint for a specified destination.                                             |

Canvas writes are optimistic. A stale `baseRevision` returns `409` with the
current revision; reload before retrying. Concurrent-write leases and incomplete
DynamoDB writes return `503`; preserve the browser cache and retry later.

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

## Team sharing API

| Method and path                                        | Notes                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| `POST /teams`, `GET /teams`, `GET /teams/:id`          | Create, list, or inspect a team and members.                        |
| `POST /teams/join`                                     | Join with an invite code.                                           |
| `DELETE /teams/:id/members/:userId`                    | A member may leave; an owner may remove others; owner cannot leave. |
| `POST /teams/:id/workspaces`                           | Only the direct workspace owner may share a workspace.              |
| `GET /teams/:id/workspaces`                            | Lists workspaces shared to a team.                                  |
| `DELETE /teams/:id/workspaces/:workspaceId`            | Workspace owner or team owner may unshare.                          |
| `PATCH /teams/:id/members/:userId/role`                | Team owner/admin changes roles; only owner may promote an admin.    |
| `POST /teams/:id/regenerate-code`, `DELETE /teams/:id` | Team-owner-only operations.                                         |

## Implementation map

| File                                                                              | Responsibility                                      |
| --------------------------------------------------------------------------------- | --------------------------------------------------- |
| [`workspaceRoutes.ts`](../../server/services/workspace/routes/workspaceRoutes.ts) | Workspace and collection HTTP handlers.             |
| [`canvasRoutes.ts`](../../server/services/canvas/routes/canvasRoutes.ts)          | Canvas reads, writes, revisions, and copy failures. |
| [`teamRoutes.ts`](../../server/services/team/routes/teamRoutes.ts)                | Team membership and sharing endpoints.              |
| [`permissions.ts`](../../server/shared/permissions.ts)                            | Role rank and capability rules.                     |
| [`PERSISTENCE.md`](../architecture/PERSISTENCE.md)                                | DynamoDB and browser-cache persistence details.     |
