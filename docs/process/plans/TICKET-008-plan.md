# Implementation Plan: TICKET-008 (Upsert Canvas Synchronization)

## Decision & Strategy

We will replace the aggressive `DELETE`/`INSERT` logic within `server/modules/canvas/storage.ts` with a much more efficient ID-diffing Upsert pattern mapping explicitly to Postgres `EXCLUDED`.

## Exact Changes Required

1.  **Modify Imports**: Add `inArray` and `sql` from `drizzle-orm` in `server/modules/canvas/storage.ts`.
2.  **Refactor `syncCanvas` Module**:
    - Query the existing `nodes` and `edges` for the targeted Workspace to collect their string IDs.
    - Compare the `incoming` state arrays against the `existing` db array IDs to extract an orphaned payload representing elements deleted from the canvas.
    - Only `tx.delete()` the orphaned elements utilizing `inArray()`.
    - Invoke `tx.insert(...).onConflictDoUpdate()` passing the `pgTable` explicit `excluded` state mappings to update geometries and metadata fields.

## Testing Strategy

1.  Run the TypeScript compiler (`npm run check`) to ensure strict compliance with `drizzle-orm` query builders.
2.  Run the full test suite (`npx vitest run`) to ensure this backend replacement doesn't break the existing routes locally.

## Risk / Tradeoffs

- **Trade-off**: Requires explicit column definitions mapping to `EXCLUDED.<column_name>`. If a new field is added to a node in the future, developers must remember to explicitly include it inside the `set: {}` block of the newly refactored `syncCanvas` function.
