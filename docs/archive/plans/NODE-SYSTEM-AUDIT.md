# Node system audit and repair plan

Audited on 2026-09-16 against `5177699` on local `main`.

Scope: node creation, AI tools, rendering, dimensions, VPC/region/namespace
containment, nested canvases, JSON import/export, and canvas persistence.
This is an audit; application behavior has not been changed.

## Conclusion

The reported inconsistencies have concrete causes in this checkout. There is
no single node contract: the library, AI converter, renderer, layout helpers,
and persistence path each make different assumptions. Some apparent save
failures are actually data being changed or lost before the save request.

The current canvas save API does **not** enforce a node-type enum. In
`server/shared/routes.ts:104`, nodes and edges are `z.array(z.any())`.
DynamoDB's `nodeItem` spreads the node object and removes only `id` and
`workspaceId` from its body. A custom `availability-zone` type passes the API
input schema. Production's deployed revision and actual failed requests were
not inspected, so an older deployed schema cannot be ruled out.

## Current flow

| Entry point          | What it does                                                              | Main inconsistency                                               |
| -------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Manual library/drop  | `Workspace.addNode` reads `nodeDimensions`                                | Different defaults from AI                                       |
| AI tool call         | `executeEditCanvas` reads `NODE_SIZES`; new unknown types become `server` | Dimensions and extra fields are discarded                        |
| AI markdown fallback | Passes raw JSON nodes into the flattened tool-input format                | `data.label`, styles, and custom data are not carried over       |
| Templates            | Hardcoded template geometry, sometimes followed by AI repair              | A third source of sizing decisions                               |
| JSON import          | Validates export-shaped JSON, then directly sets nodes                    | Requires `exportedAt`; no graph normalization                    |
| Rendering/resizing   | React Flow plus `SystemNode`                                              | Top-level dimensions override style dimensions                   |
| Saving               | Materializes nested root, caches locally, sends snapshot with revision    | Does not validate node/graph structure; errors can be misleading |
| Reload               | Reads stored nodes directly into the canvas                               | No version migration or parent-order normalization               |

## Findings

### N01 — P1: AI operations can overwrite or omit nodes before saving

`client/src/features/workspace/agent/jenkosAgent.ts:314` executes every tool
call against the same original `currentNodes/currentEdges`, replacing
`canvasResult` each time. Two independent add calls leave only the last add
in the final result. Reproducing that loop with an initial `root` and adds
`one`, then `two`, yields `[root, two]`.

`canvasToolExecutor.ts:240` also stores additions in a map keyed by ID.
An `add` that reuses an existing ID overwrites that node. Reproduced:
adding a database with the existing server's ID replaces the server.

The sidebar captures the canvas before awaiting the AI response and later
replaces the canvas with that result (`WorkspaceLeftSidebar.tsx:162–177`).
Edits made while the response is pending can therefore be overwritten.
This last scenario is established by source inspection, not a browser test.

Repair: accumulate tool calls sequentially, reject/remap ID collisions with
consistent edge/parent references, and apply operations to the current canvas
or require reconciliation if its generation changed. Treat one AI response
as one undoable transaction. Report actual applied changes.

### N02 — P1: Two competing dimension fields break resizing

`Workspace.tsx:551` applies React Flow dimension changes directly. In the
installed React Flow implementation, these changes write `width`, `height`,
and `measured`, leaving `style.width/height` unchanged.

The properties panel reads style dimensions first
(`PropertiesSidebar.tsx:284`), and `Workspace.updateNodeStyle` only updates
style dimensions (`Workspace.tsx:1041`). React Flow renders top-level
`width/height` ahead of style dimensions.

Reproduced using the installed `applyNodeChanges`:

- Start with a VPC at `style.width = 408`.
- Resize it to 800: `width = 800`, `measured.width = 800`, `style.width = 408`.
- Change its property width to 1000: the panel value becomes 1000, but React
  Flow's effective inline width remains 800.

Containment uses the stale style dimensions too. Saving preserves both
values, so reloading does not resolve the conflict.

Repair: choose one persisted size representation and use adapters for React
Flow. Synchronize resize and property edits, treat measurements as runtime
state, and migrate legacy conflicting fields without resetting user sizes.

### N03 — P1: Container math mixes local and absolute coordinates

`utils/containment.ts:18` treats a child's parent-relative position as a canvas
position. `Workspace.tsx:1508` repeats the same mistake when checking whether
the node should detach. Container selection uses the first matching array
entry, not the deepest eligible parent. It checks the child's center only.

Reproductions:

- A VPC at `(100,100)` with a child at local `(40,40)` is considered outside
  by the drag-stop bounds check, despite being inside visually.
- Region `(100,100)` → VPC local `(50,50)` → child local `(20,20)` should
  yield absolute `(170,170)`. `calculateGlobalPosition` returns `(70,70)`
  because it adds only one ancestor.
- Overlapping region/VPC candidates select the region when it is first.

`getSmartHandleIds` also compares local positions directly across different
parents (`ai-canvas-utils.ts:182`), so edge routing can choose the wrong side.

Repair: shared recursive absolute-position and bounds functions; deepest
eligible container selection; descendant/cycle exclusion; explicit padding
and header clearance; consistent attach/detach conversion. Use the actual
resolved size everywhere. Decide whether dropping requires full containment
or center containment, then fit/grow the container accordingly.

### N04 — P1: AI layout ignores container sizes and child coordinate spaces

`EditCanvasNodeInput` and the exposed tool schema have no size fields.
`canvasToolExecutor.ts:307` assigns defaults to new nodes; `replace_all`
reconstructs a payload without incoming styles or dimensions. The AI's
current-canvas context also omits dimensions (`jenkosAgent.ts:181`).

Reproduced at viewport center `(500,300)`:

- A requested `800 × 600` VPC becomes `408 × 312`.
- Its database child gets local position `(360,400)` and size `144 × 120`,
  outside the VPC's bounds, with `extent: "parent"` set.

The tier layout processes containers like regular service nodes and does not
lay out children within their parent or expand parents around contents.
Manual attachment and AI creation also differ in whether they set `extent`.

Repair: expose size and coordinate semantics in the AI contract; perform
layout per parent, bottom-up; derive minimum container bounds from children
and padding; preserve explicit user sizing unless it cannot contain content.
Use consistent attachment rules for manual, AI, imported, and template nodes.

### N05 — P2: Node registries disagree and unknown types lose their meaning

Manual defaults are in `utils/dimensions.ts`; AI defaults are separately
duplicated in `lib/ai-canvas-utils.ts`. **33 shared types have different
default dimensions.** Examples:

| Type     | Manual default | AI default |
| -------- | -------------- | ---------- |
| server   | 160 × 60       | 168 × 96   |
| database | 160 × 60       | 144 × 120  |
| gateway  | 160 × 60       | 192 × 72   |
| user     | 88 × 88        | 96 × 96    |

The manual table uses `lambda`, while the library uses `logic`, which falls
back to the generic manual size. AI validity is derived from size-table keys,
not the renderer registry. `k8s-replicaset`, `k8s-statefulset`,
`k8s-daemonset`, and `junction` have renderers but become `server` in AI
repair. `availability-zone` and `subnet` also become `server`; neither is a
registered container type, despite the sidebar suggesting a subnet prompt.

Repair: one shared registry for type identity, aliases, renderer kind,
default/minimum size, container capability, and AI support. Add explicit
zone/subnet definitions. Preserve an unknown component's identity and data
through a generic renderer instead of silently renaming it to `server`.
Use defaults only when creating or repairing missing dimensions.

### N06 — P1: Graph structure is not protected across destructive operations

`Workspace.deleteNodes` and the AI executor delete selected IDs and attached
edges, but do not handle their descendants. Reproduced: deleting a VPC leaves
its child pointing to the missing parent. `duplicateSelection` copies parent
references without remapping them to duplicated containers.

The save schema even accepts `[null]` as its nodes array. Persistence collapses
duplicate IDs into a map (`dynamo.ts:379`). Neither import nor save validates
parent existence, cycles, unique IDs, or valid edge endpoints. Loading returns
storage query order without ensuring parents precede children; the installed
React Flow code explicitly requires parents before children.

Repair: validate graph invariants before applying a mutation and before saving.
Define container deletion as either subtree deletion or child detachment with
absolute positions preserved. Duplicate complete subgraphs using an ID map.
Normalize parent order on load/import. Validate structure while preserving
extensible component metadata; a closed node-type enum is not the solution.

### N07 — P2: Different import formats and lossy conversion mimic save rejection

`exportCanvas.ts:17` accepts arbitrary type strings and extra node fields,
but requires export metadata `exportedAt`. A plain AI `{nodes, edges}` document
fails with `exportedAt: Required`.

The AI repair function reconstructs `data` from a whitelist, discarding
`subCanvas`, `collections`, Kubernetes `status`, and custom metadata. The
markdown fallback sends nested React Flow `data/style` into a flattened tool
format. Reproduced: a database labeled `Customer records`, width 600, becomes
a database labeled `database`, width 144, with its custom field gone.

Repair: separate adapters for exported documents, legacy React Flow JSON,
and AI operations, all targeting one versioned document model. Preserve
extension data and nested canvases. Surface repairs and rejected fields rather
than reporting unconditional success. Make export metadata optional on import.

### N08 — P2: Style controls and renderer read different locations

The properties panel stores `fontColor`, `icon`, and `theme` in `node.data`.
`SystemNode.tsx:488–495` instead reads these from an optional `style` prop.
The installed React Flow `NodeWrapper` applies `node.style` to the outer DOM
wrapper but does not forward it as a prop to `SystemNode`.

This leaves internal backgrounds, themes, borders, and text overrides partly
disconnected from their controls. The resizer uses 24 × 24 minima for all node
types; there is no application-level type-specific sizing policy. Property
edits always snap to 24 even though canvas snapping is separately configurable.
Container typography grows with width with no upper cap.

Repair: one renderer-facing data contract; explicit frame versus internal
visual settings; type-specific minima; consistent grid policy; capped
typography. Split container, service, annotation, and junction rendering as
needed instead of expanding the existing monolithic component.

### N09 — P2: Two different kinds of nesting look like one feature

Visible grouping uses `parentId` on nodes in the current canvas. Opening a
container reads `data.subCanvas`, an entirely separate document
(`Workspace.tsx:601–646`). A VPC can visibly contain services but open an empty
internal workspace. This is not necessarily lost persistence: the UI is
showing a different data structure. Existing root-materialization code does
preserve nested edits; it does not unify these two models.

Repair: explicitly distinguish visual groups from drill-down documents, or
design a migration to one containment model. Do not automatically move legacy
children between the two representations without preserving both.

### N10 — P2: Save feedback obscures the actual failure

Autosave labels every non-409 failure as an offline connection problem
(`Workspace.tsx:905`) and does not transition its `saving` status on error.
Malformed input, oversized requests, backend write failures, and network
errors are not distinguished there. Manual save does set an offline status.
Both success callbacks can mark `saved` while newer edits are pending; the
local-cache generation guard protects cache deletion, not this status label.

Repair: generation-aware save state; actionable typed errors; node/field paths
for validation failures; a request ID linking the failed save to server logs.
Log revision, counts, duration, and error code without canvas contents or AI
secrets. Keep retryable failures distinct from invalid documents and conflicts.

## Verification and limits

- Ran six existing suites: canvas generation, agent tools, Jenkos flow,
  containment, nested canvas, and JSON import/export. **49 tests passed.**
- Executed local diagnostic calls to the actual helpers, the API input schema,
  and installed React Flow `applyNodeChanges`; the reproductions above do not
  require AWS, a provider key, or paid AI calls.
- Existing containment tests mostly use containers at `(0,0)`; they miss the
  coordinate-space bug. The AI VPC test supplies `width/height` but never
  asserts that they were honored or that the children fit.
- Existing browser canvas tests check page rendering, not node resize/save
  round trips. No interactive browser, production logs, or live DynamoDB
  round-trip verification was performed in this audit.
- Developer/landing documentation still points to a missing
  `docs/canvas-schema.json` and claims import repair behavior not present in
  the current import path.

## Implementation batches

Each batch should be one reviewable change with targeted regression checks.

1. **Stop AI data loss:** accumulate tool results; detect collisions and stale
   canvas generations; make changes undoable; correct the legacy JSON adapter.
   Verify two tool calls survive, edits during AI work are preserved, and an
   add cannot silently replace an existing ID.
2. **Unify the node contract:** shared registry, extensible versioned document,
   generic unknown-node rendering, zone/subnet definitions, compatibility
   adapter. Preserve existing sizes and metadata during migration. Verify
   unknown types, Kubernetes types, nested data, and custom fields round-trip.
3. **Unify dimensions and visuals:** canonical size reads/writes, resizer and
   property synchronization, renderer data contract, sensible minima and grid
   behavior. Browser-check resize → property edit → save → reload for a
   service, VPC, region, and namespace.
4. **Repair hierarchy and layout:** absolute/local transforms, depth-aware
   containment, child fitting, parent ordering, safe subtree delete/duplicate,
   cycle checks, and hierarchy-aware edge routing. Exercise three nested
   levels, moved/resized containers, reparenting, and child-before-parent input.
5. **Harden import/save and feedback:** shared structural validation, helpful
   import errors, generation-aware save state, typed server errors and request
   correlation. Verify failed saves retain recoverable edits and retries do
   not erase newer local changes.
6. **Clarify nesting UX and remove drift:** separate group versus drill-down
   actions, update help/docs from the shared contract, remove superseded size
   tables and converters, and replace misleading tests with behavior checks.

For the t3.small deployment, these fixes should mostly be shared/client-side
logic, with linear-time graph validation on the server and bounded layout
work. They need no new always-on service or AWS IAM change. Persist durable
node data, not `selected`, `dragging`, or measurement-only changes, to reduce
unnecessary save traffic and DynamoDB writes. Profile large diagrams before
introducing a heavier layout engine or increasing instance size.
