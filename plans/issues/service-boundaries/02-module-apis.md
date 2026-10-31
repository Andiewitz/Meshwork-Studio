**Audit ID:** SB-02 · **Priority:** P1 · **Dependencies:** none.

**Tracker:** [#49](https://github.com/Andiewitz/Meshwork-Studio/issues/49)

## Problem

`server/routes.ts` registers whole Workspace, Team, and Canvas storage objects.
`AppRegistry` is a string-to-`any` map; callers choose `get<T>()` without a
checked association between key and type. Canvas and Team receive methods they
do not need, including foreign mutations and bulk deletion. Type-only imports
from another domain's persistence directory still couple consumers to its
repository interface.

Evidence: `server/lib/registry.ts`, `server/routes.ts`, Workspace/Canvas/Team
routes, and `server/services/canvas/index.ts` at audited main `bbfec7f`.

## Proposed solution

Introduce explicit typed module dependency objects and application use cases.
Examples are `WorkspaceAccess`, `WorkspaceSummaryReader`, `IdentityProfiles`,
and `CanvasDocuments`. Define ports outside `db/`, return DTOs and stable
outcomes, and inject only the capabilities each consumer needs. The composition
root may wire private implementations; domain consumers must not receive raw
repositories, pools, ORM row types, or transaction handles.

Use local adapters while modules share one process. Keep Express concerns at
the route edge and business rules in callable use cases, so later service
extraction can wrap existing behavior without rebuilding it.

## Acceptance criteria

- [ ] Foreign repository lookups are replaced by explicit typed dependency
      objects/public ports with a single declared contract per capability.
- [ ] Type checking rejects missing/wrong adapters; a consumer cannot select an
      arbitrary type through a string registry lookup.
- [ ] Authorization, resource existence, conflict, and dependency-unavailable
      outcomes are explicit and do not collapse into boolean/empty success.
- [ ] Use cases can be tested without creating an Express server or connecting
      another domain's database.
- [ ] Consumer tests provide only allowed methods, demonstrating that the full
      foreign repository is unnecessary.
- [ ] Public API/authorization compatibility and the focused suite are preserved.
      Module wiring and ownership documentation are updated.

Coordinate public exports and enforcement with SB-03; this issue establishes
the APIs that its import policy will protect.
