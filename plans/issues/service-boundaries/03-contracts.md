**Audit ID:** SB-03 · **Priority:** P2 · **Depends on:** SB-02 (public module APIs).

**Tracker:** [#49](https://github.com/Andiewitz/Meshwork-Studio/issues/49)

**Dependency links:** [#51](https://github.com/Andiewitz/Meshwork-Studio/issues/51).

## Problem

`server/shared/schema/index.ts` claims to be contracts-only but re-exports Team
schemas generated from Drizzle tables. Service roots broadly export `db`
barrels. `AppEvents` permits database transaction objects. Boundary tests check
selected literal alias paths and exempt `*-client` imports; they do not enforce
all relative, dynamic, transitive, or service-root persistence imports.

Evidence: the shared schema hub, service `index.ts`/`db/index.ts`,
`server/lib/events.ts`, and `tests/unit/arch/boundaries.test.ts` at `bbfec7f`.

## Proposed solution

Publish framework-independent contracts with JSON DTOs, Zod validators, stable
error codes, actor context, and versioned event/command envelopes. Define wire
timestamps as strings. Keep SQL/ORM schemas, transactions, Express, provider
SDKs, and AWS request types private to adapters. Avoid creating a shared domain
repository under the name of a contracts package.

Restrict public entrypoints and check resolved imports using an AST/import
graph. Allow composition to wire private implementations explicitly; move
consumer adapters out of another domain's private `db` directory.

## Acceptance criteria

- [ ] Browser-safe/public contract imports do not pull ORM/database/runtime
      initialization code through re-exports.
- [ ] No cross-module event or public DTO contains a SQL transaction, database
      connection, provider SDK object, or secret.
- [ ] Negative fixtures prove forbidden alias, relative, dynamic, root-barrel,
      and transitive imports fail the boundary check.
- [ ] Positive fixtures permit declared public contracts and composition-root
      wiring without a broad filename exception.
- [ ] Serialization and runtime validation cover HTTP/event adapters, including
      version incompatibility and timestamp shapes.
- [ ] CI runs the enforcement; existing consumers typecheck and focused tests
      pass with the new entrypoints.
