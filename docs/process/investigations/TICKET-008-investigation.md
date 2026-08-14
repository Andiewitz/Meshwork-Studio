# Investigation: TICKET-008 (Canvas Save Optimization)

## Findings

During an analysis of the `client/src/hooks/use-canvas.ts` and `server/modules/canvas/storage.ts` logic, I discovered a very severe performance bottleneck:

1. **Frontend Behavior**: `syncCanvas` executes via `useMutation` on the React Flow instance. Every time a node stops dragging, it bundles _every single node and edge_ on the diagram and sends it to the server.
2. **Backend Behavior**: The Postgres `syncCanvas` database logic is completely unoptimized. Upon receiving the payload, it explicitly runs:
   ```sql
   DELETE FROM edges WHERE workspace_id = X;
   DELETE FROM nodes WHERE workspace_id = X;
   INSERT INTO nodes (...) VALUES (...);
   INSERT INTO edges (...) VALUES (...);
   ```

## Root Cause Analysis

Because React Flow doesn't inherently diff individual node states internally in a way that matches Drizzle, the previous developer opted to bypass diffing entirely by nuking the database arrays and reinserting the entire diagram. This functions fine with 50 nodes, but heavily penalizes anything over 1,000 nodes due to brutal index drops, foreign key cascading, and WAL logging within PostgreSQL.

## Proposed Strategy

We will implement an **UPSERT (ON CONFLICT DO UPDATE)** strategy using Drizzle.
By diffing the IDs manually:

1.  We collect IDs for nodes missing from the payload and `DELETE` only those.
2.  We `INSERT` the payload and explicitly use `.onConflictDoUpdate({ target: id, set: {...} })` to perform standard row updates on existing nodes.

This transforms a 10,000-row Drop/Insert operation into a targeted 10-row Update operation when dragging a single node.
