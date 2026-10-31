# Contract boundaries

Status: implemented locally for SB-03 / issue #52. Not deployed or verified
against live AWS. No infrastructure or schema migration is required.

## Entrypoints and enforcement

[Module capabilities](./MODULE_APIS.md) are declared in Workspace and Team
`public.ts` files. They expose explicit DTO/query outcomes, not repositories.
Service `index.ts` files are private bootstraps: they no longer re-export
database/route/provider barrels or expose a static storage singleton.

Run the same guard used by CI from the repository root:

```sh
npx tsx scripts/check-service-boundaries.ts
```

The [guard](../../scripts/lib/service-boundaries.ts) parses TypeScript/JavaScript
and resolves local imports using the project's TypeScript path mappings. It
checks server code, browser source, scripts, and root configuration modules.
It follows static imports, type imports, import types, re-exports, literal
dynamic imports, `require`, and `module.require`. Unresolved local imports and
computed module specifiers fail closed. Existing terminal assets such as CSS
are checked for existence rather than treated as JavaScript modules.

Foreign service internals are private even through a relative path or alias.
Public/shared contract dependency graphs cannot reach a private implementation,
SQL types, SDKs, Node runtime packages, or initializers. Contract DTO declarations
must not contain runtime `Date`/`Buffer`/collection objects or inferred ORM rows.
Public contract dependencies are Zod, other declared contracts, and the explicit
pure outcome helper. The browser bundle check independently proves that the
shared hub and public entries do not bundle database dependencies.

Composition exceptions are exact source-to-target edges in `COMPOSITION_EDGES`:
the server startup/migration wiring and trusted operator migration and outbox replay scripts. A file
merely named `routes.ts` or `index.ts` gets no exception. Adding private startup
wiring requires a deliberate policy edit. Tests can access private internals
to exercise adapters; they are not production entrypoints.

This is a static architectural guard, not a sandbox against deliberately
obfuscated executable code, generated code, or arbitrary evaluation. It must
run alongside type checking, tests, and code review. Go identity remains a
separate HTTP service; this checker covers Node/browser imports, not Go imports.

## JSON DTOs and existing HTTP behavior

The shared schema hub keeps its existing exported names, now backed by plain
[Team request contracts](../../server/shared/schema/team-contract.ts) and
[JSON DTO schemas](../../server/shared/contracts/dtos.ts). Team request
validators preserve the former generated schemas' optional fields, bounds,
unknown-key stripping, and validation messages. Wire timestamp types are
strings, not `Date | string`. Private Drizzle row types remain inside services.

The Team ownership mirror explicitly converts dates to ISO strings before
returning a DTO; this is identical to its previous Express JSON serialization.
Workspace/collection routes retain their existing response handling and field
sets. DTO schemas describe that JSON; they are not new stripping middleware on
public responses. The existing `/internal/v1` query adapters use the owner-shared
validators without adding version fields to HTTP responses.

## Events and commands

[Event contracts](../../server/shared/contracts/events.ts) define strict payloads,
actor context, delivery receipts, and a version-1 envelope containing:

- `version`, `type`, `payload`, stable `operationId`, and ISO `sentAt`.
- Optional `requestId` and a user/system actor; no credentials or auth claims.

`operationId` is the replay identity. `sentAt` is the transport publication time,
not the original business-event time; it may differ on retry. Unknown versions
fail with `CONTRACT_VERSION_UNSUPPORTED`; malformed envelopes fail with
`CONTRACT_INVALID`, without echoing payloads or secrets in those errors.

`EventBus.executeRequired` constructs and validates this envelope before the
required handler runs. `executeEnvelope` and `emitEnvelope` validate decoded
transport input; no external queue/HTTP consumer is deployed by this change.
Local legacy `emit`/`emitAsync` calls remain compatible but now validate their
payloads too. SQL transaction handles and unexpected secret fields are rejected,
including through variables TypeScript would otherwise structurally accept.
Receipt validation runs both on the bus and at the Workspace outbox boundary.

Existing persisted outbox payloads stay unchanged. The local transport adapts
them to v1 at delivery, retaining the same operation ID and receipt semantics.
Transaction types moved to a private persistence helper and are no longer part
of `AppEvents` or the event export surface. Identity deletion durability remains
a separate task (#57); a validated notification is not a durable workflow.

## Verification

Negative fixtures cover alias/relative/type/dynamic/CommonJS/root-barrel and
transitive imports; positive fixtures cover public APIs, exact composition
edges, own internals, safe cycles, and assets. Compile-time fixtures reject
row-like timestamps, transaction events, and removed bootstrap exports.
Serialization tests cover event versions, timestamps, actor context, receipt
validation, and the existing HTTP DTO shape. Real DynamoDB/system verification
remains pending as previously agreed; these checks do not claim deployment.
