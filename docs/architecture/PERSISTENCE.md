# Canvas Persistence

> How Meshwork Studio ensures your architecture diagrams are never lost — from the moment you move a node to the final database commit.

## Table of Contents

1. [Overview](#overview)
2. [The Hybrid Persistence Model](#the-hybrid-persistence-model)
3. [Local Cache Layer](#local-cache-layer)
4. [Database Sync Layer](#database-sync-layer)
5. [Save Status Indicators](#save-status-indicators)
6. [Edge Normalization Fix](#edge-normalization-fix)
7. [Database Schema Migrations](#database-schema-migrations)
8. [Testing](#testing)
9. [Key Files](#key-files)

---

## Overview

Canvas persistence uses a **two-layer hybrid model**: local browser storage as a fast, instant fail-safe, and PostgreSQL as the long-term source of truth. The two layers are carefully coordinated so data is never lost, even if the network drops or the user navigates away mid-edit.

```
User makes a change
        │
        ▼
localStorage updated immediately ◄── instant, zero network
        │
        ▼ (after 3 seconds of inactivity)
API sync: POST /api/workspaces/:id/sync-canvas
        │
   ┌────┴────┐
Success?     Fail?
   │             │
Cache cleared   Cache kept
(DB is now      (retry on next
 authoritative)  change)
```

---

## The Hybrid Persistence Model

### Why Two Layers?

| Scenario                              | Without Cache          | With Cache                           |
| ------------------------------------- | ---------------------- | ------------------------------------ |
| User refreshes before auto-save fires | ❌ Work lost           | ✅ Restored from localStorage        |
| Network drops mid-session             | ❌ Sync fails silently | ✅ Cache persists, syncs when online |
| Browser crashes                       | ❌ Work lost           | ✅ Restored on next open             |
| Server is temporarily down            | ❌ All changes lost    | ✅ Local work preserved              |

### Coordination Contract

- The local cache is written **on every change**, immediately.
- The cache is **only cleared** on a confirmed successful database sync.
- If the DB sync fails, the cache is preserved — it will retry on the next change cycle.
- On workspace load, if a local cache exists for that workspace, it is loaded instead of the stale database version.

---

## Local Cache Layer

### Implementation

**File:** `client/src/lib/canvas-cache.ts`

```typescript
export const CANVAS_CACHE_PREFIX = "meshwork-canvas-cache-";

export interface CanvasCache {
  nodes: any[];
  edges: any[];
  timestamp: number; // Unix ms — used to detect if cache is newer than DB
}

export function saveCanvasToLocalCache(
  workspaceId: number,
  nodes: any[],
  edges: any[],
);
export function getCanvasFromLocalCache(
  workspaceId: number,
): CanvasCache | null;
export function clearCanvasLocalCache(workspaceId: number): void;
```

### Storage Key Format

Each workspace gets its own isolated key:

```
meshwork-canvas-cache-{workspaceId}
```

For example, workspace `42` is stored at `meshwork-canvas-cache-42`. This means:

- Multiple workspaces can have independent caches simultaneously
- Clearing workspace 42's cache doesn't affect workspace 43's cache
- Cache entries are workspace-scoped, not user-scoped (the user is implicitly identified by the session)

### Error Handling

All three functions wrap their `localStorage` calls in `try/catch`. If `localStorage` is unavailable (e.g., private browsing mode with storage blocked, or quota exceeded), functions fail silently with a `console.warn`. The app continues to function — it just loses the local cache layer.

```typescript
export function saveCanvasToLocalCache(
  workspaceId: number,
  nodes: any[],
  edges: any[],
) {
  try {
    const cache: CanvasCache = { nodes, edges, timestamp: Date.now() };
    localStorage.setItem(
      `${CANVAS_CACHE_PREFIX}${workspaceId}`,
      JSON.stringify(cache),
    );
  } catch (e) {
    console.warn("Failed to save canvas to local cache", e);
  }
}
```

---

## Database Sync Layer

### Auto-Save Trigger

In `Workspace.tsx`, a `useEffect` watches the `nodes` and `edges` state. When they change:

1. The local cache is updated **immediately** (`saveCanvasToLocalCache`)
2. A **3-second debounce timer** is set
3. When the debounce fires, `sync({ nodes, edges })` is called — the TanStack Query mutation that POSTs to the API

```typescript
// On every nodes/edges change:
saveCanvasToLocalCache(workspaceId, nodes, edges); // instant
debouncedSync(nodes, edges); // fires after 3s of no further changes
```

### Sync Mutation (`use-canvas.ts`)

```typescript
const syncMutation = useMutation({
  mutationFn: async ({ nodes, edges }) => {
    // Normalize animated property for Postgres compatibility
    const normalizedEdges = edges.map((edge) => ({
      ...edge,
      animated: edge.animated ? 1 : 0, // boolean → integer
    }));
    const res = await apiRequest("POST", url, {
      nodes,
      edges: normalizedEdges,
    });
    return res.json();
  },
  onSuccess: () => {
    clearCanvasLocalCache(workspaceId); // Only cleared on success
    queryClient.invalidateQueries({ queryKey: [url] });
  },
});
```

---

## Save Status Indicators

The UI shows a live status indicator in the workspace toolbar:

| Status          | When                                | Display          |
| --------------- | ----------------------------------- | ---------------- |
| `saved`         | After a successful DB sync          | ✅ Saved         |
| `saving`        | While the API request is in flight  | 🔄 Saving...     |
| `offline_saved` | API failed — data is in local cache | 💾 Saved Locally |

The status resets to `offline_saved` if the user makes changes while offline (the debounce fires but the network request fails). This gives the user confidence their work is preserved even without a database connection.

---

## Edge Normalization Fix

### The Bug

PostgreSQL's `animated` column in the `edges` table is typed as `INTEGER` (0 or 1). React Flow sets `edge.animated` to a JavaScript boolean (`true` / `false`). When a boolean was sent directly to PostgreSQL, it threw:

```
invalid input syntax for type integer: "false"
```

### The Fix

Before syncing to the API, all edges are normalized in `use-canvas.ts`:

```typescript
const normalizedEdges = edges.map((edge) => ({
  ...edge,
  animated: edge.animated ? 1 : 0,
}));
```

This happens transparently before every sync — the React Flow state still uses booleans internally, only the API payload uses integers.

---

## Testing

**File:** `tests/unit/workspace/canvas-cache.test.ts`

These 5 tests verify all critical paths of the local cache:

| Test                                             | What It Proves                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| _Should save canvas data with a timestamp_       | `saveCanvasToLocalCache` writes correct JSON with a `timestamp` field                     |
| _Should retrieve correctly parsed canvas data_   | `getCanvasFromLocalCache` reads and parses stored data correctly                          |
| _Should return null if no cache exists_          | Returns `null` for unknown workspace IDs, not an exception                                |
| _Should clear only the specific workspace cache_ | `clearCanvasLocalCache(42)` removes workspace 42's cache but leaves workspace 43's intact |
| _Should handle corrupt JSON gracefully_          | Returns `null` and fires `console.warn` instead of crashing the app                       |

### Testing `localStorage` in Node

Vitest runs in a Node environment where `localStorage` doesn't exist. The tests mock it with a plain object:

```typescript
let mockStorage: Record<string, string> = {};

beforeEach(() => {
  mockStorage = {};
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key) => mockStorage[key] || null),
    setItem: vi.fn((key, value) => {
      mockStorage[key] = value;
    }),
    removeItem: vi.fn((key) => {
      delete mockStorage[key];
    }),
    clear: vi.fn(() => {
      mockStorage = {};
    }),
  });
  vi.clearAllMocks();
});
```

This pattern should be reused in any future test that interacts with browser storage APIs.

---

## Key Files

| File                                        | Purpose                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `client/src/lib/canvas-cache.ts`            | Core localStorage utilities (save, get, clear)                   |
| `client/src/hooks/use-canvas.ts`            | TanStack Query sync mutation + cache clearing on success         |
| `client/src/pages/Workspace.tsx`            | Auto-save debounce effect + save status state                    |
| `tests/unit/workspace/canvas-cache.test.ts` | 5-test unit suite for the cache layer                            |
| `shared/schema.ts`                          | Drizzle schema — `edges.animated` defined as `INTEGER DEFAULT 0` |
