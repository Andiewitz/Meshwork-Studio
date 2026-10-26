# Internal query contracts

Status: implemented locally for issue #50; production activation and a real
PostgreSQL migration check remain operator actions.

## Routing and credentials

Node domain queries use `INTERNAL_API_KEY`. Go identity stats/audit queries use
the dedicated client in `server/auth/internal-client.ts`, `AUTH_INTERNAL_KEY`,
and `AUTH_SERVICE_URL` (default `http://127.0.0.1:8081`). The two keys may and
should differ. Identity introspection retains its existing session-specific
client and fail-closed behavior.

| Owner       | Internal endpoint                                      | Response                                                     |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| Workspace   | `GET /internal/v1/workspace/stats`                     | `{ totalWorkspaces: number }`                                |
| Workspace   | `GET /internal/v1/workspace/lookup?ids=a,b`            | `{ workspaces: [{ id, ownerId, title }] }`                   |
| Team        | `GET /internal/v1/team/stats`                          | `{ totalTeams: number }`                                     |
| Team        | `GET /internal/v1/team/users/:id/shared-workspace-ids` | `{ workspaceIds: string[] }`                                 |
| Go identity | `GET /internal/stats/users`                            | `{ totalUsers, newUsersToday, activeUsers24h, loginsToday }` |
| Go identity | `GET /internal/audit-search?request_id=ab-cd`          | `{ hits: [...] }`                                            |

The ambiguous Node `/internal/stats` route is removed. Old unversioned Node
lookup/shared-ID paths are replaced in the same release as their callers. All
Node modules currently deploy as one artifact; future independent adapters must
coordinate/version this transition rather than assume old paths remain aliases.

`WORKSPACE_SERVICE_URL` and `TEAM_SERVICE_URL` override their respective query
targets; otherwise the Node client uses `127.0.0.1:${PORT || 5000}`. NGINX
explicitly rejects `/internal/` in both host and Compose configurations, before
the SPA fallback. Private listener/network restrictions and the internal key
remain required; these are not browser endpoints.

## Failure and validation behavior

Clients validate JSON at runtime, reject redirects, forward `X-Request-Id` when
provided, and use a three-second deadline covering headers and response bodies.
Missing credentials, transport errors, timeouts, upstream rejection, and
malformed responses throw a sanitized `InternalCallError` with service/reason
and optional upstream status. Upstream bodies and credentials are never included
in that error. A successful empty result is distinct from unavailability.

- Workspace listing returns `503 WORKSPACE_LIST_UNAVAILABLE` plus `requestId`
  if the owned/shared result cannot be completed. The UI shows Retry and a
  support reference; cached items are explicitly marked out of date.
- Missing ownership lookup is a successful response omitting an unknown ID;
  unavailable ownership lookup throws and cannot be interpreted as an empty
  ownership mirror or permission to write.
- Admin audit lookup returns `200` with `hits: []` only after a valid identity
  response. Dependency failure returns `503 AUDIT_UNAVAILABLE` plus `requestId`.

## Metrics gaps and migration

Each metrics collection uses one request ID across all three dependencies and
logs sanitized service/reason/status on failure. Healthy sources still produce
samples. The six domain counts are `number | null`: zero is a real count and
null is an unavailable source. History charts leave a gap and the admin cards
display **Unavailable**. A failed history request explicitly marks previous
charts as potentially stale. Summary adds `capturedAt` for its latest sample.

Migration `0002_nullable_domain_counts` drops NOT NULL and defaults on those six
columns in `metrics_db`. Startup applies it before collection through the
existing Metrics migration registry. No historical rows are rewritten: zeros
collected by earlier releases cannot be retrospectively distinguished from
dependency failures.

Back up before deploying and verify the migration on an isolated database.
The schema remains compatible with the previous writer, which supplies all six
values, but the older dashboard interprets null as zero. Roll back code without
reinstating NOT NULL while null samples exist; do not silently replace unknown
counts with zeros. New paths and their callers must roll back together.

## Verification

Focused tests cover actual colocated router registration in both orders,
credential separation and request-ID propagation, runtime validation, transport
and body deadlines, partial metrics collection/persistence, audit error/empty
semantics, shared-list failure behavior, and UI null/stale/error presentation.
Go tests exercise real stats/audit handlers with a database connection hook that
blocks all network access, proving which credentials reach the query boundary.
Docker/PostgreSQL, deployed NGINX routing, and production data are separate
acceptance checks; unit tests do not claim to verify those environments.
