# Internal module APIs

Status: implemented locally for SB-02 / #51 and SB-03 / #52; not a deployment claim.

The Node services remain a modular monolith. The string-based `AppRegistry`
has been removed. [The composition root](../../server/routes.ts) constructs
owner-side adapters and passes a separate typed dependency object to each
module. It is allowed to import private implementations; consumers are not
given another service's repository, pool, transaction, or ORM row.

| Consumer              | Capability                                                     | Contract owner                                                         |
| --------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Canvas, Team          | `WorkspaceSummaryReader`: ID, owner ID, canvas-copy state only | [Workspace public API](../../server/services/workspace/public.ts)      |
| Workspace, Canvas     | `TeamWorkspaceAccess`: existing access and role queries only   | [Team public API](../../server/services/team/public.ts)                |
| Workspace listing     | `SharedWorkspaceReader`: shared IDs with request correlation   | Team public API                                                        |
| Team ownership mirror | `WorkspaceOwnershipReader`: ID, owner ID, title                | Workspace public API                                                   |
| Canvas copy use case  | `CanvasDocuments`: copy one document with an operation ID      | [Canvas copy use case](../../server/services/canvas/copy-workspace.ts) |

Summary and access adapters are local calls while these modules share one
process. Sharing-list and ownership-mirror queries retain their authenticated
internal HTTP transports, now behind injected contracts in each consumer's
`adapters/` directory. Neither HTTP client lives under a foreign `db/` path.
The storage constructors accept substitute readers, defaulting to those HTTP
adapters. Future extraction can replace the transport without changing callers.

## Outcomes and compatibility

[Internal outcomes](../../server/lib/module-outcomes.ts) distinguish
`found` / `missing` / `unavailable`, `allowed` / `denied` / `unavailable`, and
successful queries (including genuinely empty lists) from outages. These are
internal contracts, not new HTTP envelopes. Existing route-edge handling
continues to receive the original dependency errors. No new public status,
response field, or formatting convention is introduced.

Access and role checks deliberately remain separate. Direct owners still
short-circuit Team checks where the existing routes did so. SB-04 / #53 will
reconcile permissions and realtime ownership; this refactor does not change
those policies or repair the ownership mirror's existing freshness limitations.

The framework-free canvas-copy use case acknowledges missing/ready/failed
destinations as obsolete, waits for actual document persistence for active
copies, and propagates dependency/write conflicts for outbox retry. It never
treats an unavailable Workspace as a deleted destination. Existing Canvas
revision conflicts, copy conflicts, and persistence safeguards remain in place.

Authentication middleware is an explicit route dependency, not part of the
query contracts. Only modules using events receive event capabilities; AI
receives authentication alone and Metrics receives no dependency bag.

## Verification and remaining work

- Unit tests exercise summary projection, access/role outcomes, unavailable
  dependencies, and canvas-copy execution without Express or another domain's
  database.
- Route suites use typed dependency objects and small adapters, retaining
  owner/editor/viewer/stranger, import, and error behavior checks.
- [Compile-time assertions](../../tests/types/module-ports.ts), included in
  `npm run check`, reject missing/swapped adapters, boolean-only outcomes, and
  attempted foreign mutations.
- The [resolved-import guard](./CONTRACT_BOUNDARIES.md) checks aliases, relative
  imports, types, dynamic imports, root barrels, and transitive contract graphs.
  Service bootstraps no longer re-export persistence or expose `.storage`.
  The shared schema hub exports plain validators and JSON DTOs, not ORM types.
- DynamoDB-backed system tests remain pending until a real test backend is
  available; the socket system-test fixture is migrated but not claimed run.

No schema migration, new AWS service, infrastructure apply, or deployment is
required by this change. Related persistence guarantees are described in
[Persistence](./PERSISTENCE.md) and the
[workspace outbox runbook](../operations/WORKSPACE_OUTBOX.md).
