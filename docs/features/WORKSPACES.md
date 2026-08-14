# Workspace & Collections API

> Complete reference for workspace and collection management — CRUD endpoints, ownership checking, and the duplicate canvas flow.

## Table of Contents

1. [Overview](#overview)
2. [Workspaces API](#workspaces-api)
3. [Collections API](#collections-api)
4. [Canvas Duplication](#canvas-duplication)
5. [IDOR Protection Pattern](#idor-protection-pattern)
6. [Client-Side Hooks](#client-side-hooks)
7. [Key Files](#key-files)

---

## Overview

Workspaces are the top-level containers for canvas diagrams. Collections are optional folder-like groupings for organizing workspaces. Both are fully user-scoped — every endpoint verifies ownership before executing.

```
User
 └─ Collections (optional folders)
     └─ Workspaces
         └─ Canvas (nodes + edges)
```

---

## Workspaces API

All workspace endpoints require an active session (`isAuthenticated` middleware). State-changing endpoints additionally require a valid CSRF token (`csrfProtection` middleware).

### List Workspaces

```http
GET /api/workspaces
Authorization: Session cookie

Query params:
  collectionId: number (optional) — filter by collection

Response 200:
[
  {
    "id": 1,
    "title": "My Architecture",
    "type": "system",
    "icon": "box",
    "userId": "user-uuid",
    "collectionId": null,
    "createdAt": "2026-04-01T00:00:00Z"
  }
]
```

### Get Single Workspace

```http
GET /api/workspaces/:id
Authorization: Session cookie

Response 200: Workspace object
Response 401: { "message": "Unauthorized" }  — not the owner
Response 404: { "message": "Workspace not found" }
```

### Create Workspace

```http
POST /api/workspaces
Authorization: Session cookie
X-CSRF-Token: <token>
Content-Type: application/json

{
  "title": "New System",       // Required. 1-16 chars, no emojis
  "type": "system",            // "system" | "architecture" | "app" | "presentation"
  "icon": "box",               // Icon identifier
  "collectionId": null         // Optional collection
}

Response 201: Created workspace object
Response 400: { "message": "Zod validation error" }
```

**Title validation rules (enforced by Zod + client-side):**

- Minimum 1 character, maximum **16 characters**
- No emojis
- Letters, numbers, spaces, hyphens, and underscores only

### Update Workspace

```http
PUT /api/workspaces/:id
Authorization: Session cookie
X-CSRF-Token: <token>
Content-Type: application/json

{
  "title": "Updated Title",
  "type": "architecture",
  "icon": "server"
}

Response 200: Updated workspace object
Response 400: Validation error
Response 401: Not the owner
Response 404: Workspace not found
```

### Delete Workspace

```http
DELETE /api/workspaces/:id
Authorization: Session cookie
X-CSRF-Token: <token>

Response 204: No content
Response 401: Not the owner
Response 404: Workspace not found
```

**Important:** Deletion is a two-step operation server-side. The canvas data (nodes and edges) is deleted first via `syncCanvas(id, [], [])`, then the workspace row is removed. This ensures no orphaned data remains in the `nodes` and `edges` tables.

### Duplicate Workspace

```http
POST /api/workspaces/:id/duplicate
Authorization: Session cookie
X-CSRF-Token: <token>
Content-Type: application/json

{
  "title": "Copy of My Architecture"  // Optional
}

Response 201: New (duplicate) workspace object
Response 401: Not the owner
Response 404: Source workspace not found
```

**How duplication works:**

1. A new workspace row is created with the provided (or auto-generated) title
2. All canvas data from the source workspace is copied to the new workspace
3. The response is the new workspace object — the original is untouched

---

## Collections API

Collections group workspaces into folders. They support nesting via `parentId`.

### List Collections

```http
GET /api/collections
Authorization: Session cookie

Query params:
  parentId: number (optional) — get child collections of a parent

Response 200: Collection[]
```

### Get Collection

```http
GET /api/collections/:id
Authorization: Session cookie

Response 200: Collection object
Response 401: Not the owner
Response 404: Not found
```

### Create Collection

```http
POST /api/collections
Authorization: Session cookie
X-CSRF-Token: <token>
Content-Type: application/json

{
  "title": "Frontend Systems",
  "parentId": null              // Optional — for nested collections
}

Response 201: Created collection
Response 400: Error message
```

### Update Collection

```http
PUT /api/collections/:id
Authorization: Session cookie
X-CSRF-Token: <token>
Content-Type: application/json

{ "title": "Updated Name" }

Response 200: Updated collection
Response 401: Not the owner
Response 404: Not found
```

### Delete Collection

```http
DELETE /api/collections/:id
Authorization: Session cookie
X-CSRF-Token: <token>

Response 204: No content
Response 401: Not the owner
Response 404: Not found
```

> [!WARNING]
> Deleting a collection does **not** cascade-delete its workspaces. Workspaces in a deleted collection become orphaned (no `collectionId`). This is intentional — prevents accidental mass deletion.

---

## Canvas Duplication

An internal endpoint used by the workspace duplicate flow to copy canvas data between workspaces.

```http
POST /api/workspaces/:id/duplicate-canvas
Authorization: Session cookie
X-CSRF-Token: <token>
Content-Type: application/json

{
  "toWorkspaceId": 99
}

Response 200: { "success": true }
Response 401: Not the owner of source workspace
Response 404: Source workspace not found
```

This endpoint copies all nodes and edges from workspace `:id` to `toWorkspaceId`. Node and edge IDs are preserved as-is in the new workspace.

---

## IDOR Protection Pattern

Every data-modification endpoint follows the same ownership check pattern:

```typescript
// 1. Fetch the resource
const workspace = await workspaceStorage.getWorkspace(id);

// 2. Check existence (404 before ownership — prevents ID enumeration)
if (!workspace) return res.status(404).json({ message: "Not found" });

// 3. Verify ownership
const userId = req.user!.id;
if (workspace.userId !== userId)
  return res.status(401).json({ message: "Unauthorized" });

// 4. Now safe to operate
await workspaceStorage.updateWorkspace(id, input);
```

This pattern is tested in `tests/integration/workspace/routes.test.ts`.

---

## Client-Side Hooks

All workspace operations are wrapped in TanStack Query hooks in `client/src/hooks/use-workspaces.ts`:

| Hook                      | Purpose                | Invalidates    |
| ------------------------- | ---------------------- | -------------- |
| `useWorkspaces()`         | List all workspaces    | —              |
| `useWorkspace(id)`        | Single workspace by ID | —              |
| `useCreateWorkspace()`    | Create mutation        | workspace list |
| `useUpdateWorkspace()`    | Update mutation        | workspace list |
| `useDeleteWorkspace()`    | Delete mutation        | workspace list |
| `useDuplicateWorkspace()` | Duplicate mutation     | workspace list |

All mutation hooks use `secureFetch` (not raw `fetch`) to automatically include the CSRF token. Read-only hooks use plain `fetch` with `credentials: "include"`.

---

## Key Files

| File                                         | Purpose                                            |
| -------------------------------------------- | -------------------------------------------------- |
| `server/modules/workspace/routes.ts`         | All workspace + collection route handlers          |
| `server/modules/workspace/storage.ts`        | Database operations for workspaces + collections   |
| `server/modules/canvas/storage.ts`           | Canvas duplication logic                           |
| `client/src/hooks/use-workspaces.ts`         | TanStack Query hooks for all workspace operations  |
| `shared/schema.ts`                           | Drizzle schema: `workspaces`, `collections` tables |
| `tests/integration/workspace/routes.test.ts` | IDOR + validation integration tests                |
