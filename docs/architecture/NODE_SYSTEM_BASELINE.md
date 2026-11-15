# Canvas node system baseline

This is the compatibility baseline for expanding the canvas node system. It
describes the code as inspected on 2026-11-15, not a performance guarantee.

## Existing contracts

- `client/src/features/workspace/utils/nodeRegistry.ts` defines persisted node
  sizes, aliases, container types, and the generic fallback for unknown types.
- `client/src/features/workspace/utils/nodeTypes.ts` separately defines the
  React Flow renderer mapping, palette, and expandable node types.
- `client/src/types/canvas.ts` describes common node and edge data, including
  nested canvases. Unknown metadata is allowed.
- `server/shared/canvas.ts` validates graph references and parent cycles and
  accepts extensible node and edge properties. Snapshot requests allow up to
  5,000 nodes and 10,000 edges; snapshot storage separately limits uncompressed
  JSON to 6 MiB. Neither limit establishes an interactive performance target.
- Canvas persistence uses revisions and reports conflicts. The workspace has
  local draft recovery, undo/redo, and collaboration presence.
- JSON import/export and PNG/SVG export exist. Existing custom metadata, node
  IDs, parent relationships, dimensions, and positions must survive compatible
  JSON round trips.
- AI edits use `edit_canvas`; the legacy JSON response adapter can produce a
  full replacement. Automatic AI layout is based on infrastructure tiers.

## Compatibility requirements

Changes must preserve existing diagrams, including unknown node types and
metadata, nested canvases, manually resized nodes, edge endpoints, and user
positions. Migration must be versioned or backward compatible, and must not
silently discard unsupported data. New graph operations must respect workspace
editing permissions and the existing conflict/recovery flow.

Direct workspace collaborators are the relevant sharing model for new canvas
features. A separate team service also exists in the repository; this project
does not assume new canvas features require it.

## Existing regression coverage

Relevant tests include `node-registry.test.ts`, `canvas-schema.test.ts`,
`nested-canvas.test.ts`, `export-canvas.test.ts`, and
`jenkos-agent-canvas-flow.test.ts` under `tests/unit`. Add focused coverage for
new compatibility and failure paths as each feature is implemented.

No interactive performance baseline has been measured yet. Capture graph sizes,
hardware, browser, and timings before setting performance targets or claiming
improvements.
