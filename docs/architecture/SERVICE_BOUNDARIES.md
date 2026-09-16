# Service Boundaries and API Contracts

Meshwork Studio is deployed as a Node monolith plus a Go identity service. The
code is organised into domain services so that a future extraction does not
require shared database access.

## Ownership map

| Domain                                          | Runtime owner          | Durable store    | Public contract                                                         |
| ----------------------------------------------- | ---------------------- | ---------------- | ----------------------------------------------------------------------- |
| Identity, sessions, MFA, OAuth, audit           | Go auth service        | `auth_db`, Redis | [`api/openapi.yaml`](../../server/services/auth/api/openapi.yaml)       |
| Workspaces and collections                      | Node workspace service | `workspace_db`   | [`server/shared/routes.ts`](../../server/shared/routes.ts)              |
| Canvas nodes and edges                          | Node canvas service    | DynamoDB         | Canvas routes and [`CANVAS_SCHEMA.md`](./CANVAS_SCHEMA.md)              |
| Teams, members, sharing roles                   | Node team service      | `team_db`        | Team routes                                                             |
| AI conversations and encrypted BYOK credentials | Node AI service        | `ai_db`          | [`JENKOS_AI.md`](../features/JENKOS_AI.md)                              |
| Application metrics history                     | Node metrics service   | `metrics_db`     | Metrics routes and [operations runbook](../operations/OBSERVABILITY.md) |

The Node process has one connection pool per domain database. A service must
not import another service's schema or pool. The architecture-boundary test
enforces that rule.

## Request paths

```text
Browser
  -> NGINX
      -> Go auth service (:8081) for identity endpoints
      -> Node monolith (:5000) for /api/v1, canvas, teams, AI, and metrics
          -> PostgreSQL domain databases, Redis, and DynamoDB
```

The browser never receives database credentials or internal service keys.
Public browser endpoints use session authentication and CSRF protection for
state changes. Internal Node-to-Node HTTP calls use `INTERNAL_API_KEY`; Go
auth-to-Node internal calls use `AUTH_INTERNAL_KEY`.

## Workspace ownership mirror

Workspace ownership is written in `workspace_db`. The team service maintains a
read-through ownership mirror so shared-role checks can run without a
cross-database import. It refreshes unknown ownership through the internal
workspace lookup endpoint.

Route guards always accept a direct owner when `workspace.userId` equals the
authenticated user ID. They use the team resolver for everyone else. This
prevents an ownership-mirror outage from denying a creator access to their own
workspace, while never granting an unverified non-owner write access.

## Contract ownership

| Surface                             | Source of truth                                                      | Update when                                                   |
| ----------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| Go auth HTTP API                    | `server/services/auth/api/openapi.yaml`                              | A handler, request body, response, or auth rule changes.      |
| Node workspace/canvas shared routes | `server/shared/routes.ts` and route handlers                         | A typed workspace/canvas endpoint changes.                    |
| Team, AI, and metrics endpoints     | Their route handlers plus the corresponding feature/operations guide | An endpoint or access rule changes.                           |
| Canvas node shape                   | `server/shared/canvas.ts` and `nodeRegistry.ts`                      | A persisted node/edge field, alias, or default frame changes. |

Use `401` only for an absent or invalid session. Use `403` for an authenticated
user who lacks permission. Canvas clients must also handle `409` revision/copy
states and transient `503` durable-write failures.

## Schema and migration ownership

| Store                                  | Migration owner                          | Deployment rule                                                                                    |
| -------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `auth_db`                              | Embedded Go migrations                   | Auth service runs migrations before opening its listener; failure aborts boot.                     |
| Workspace, team, AI, metrics databases | Node service migration registry          | Node startup applies additive service migrations before registering routes.                        |
| DynamoDB canvas table                  | Canvas service / deployment provisioning | Local development may create the table. Production IAM should be limited to the provisioned table. |

Back up before a production schema change. Do not use a root-wide schema push
as a substitute for service-owned migrations. The deployment and recovery
procedures are in [`DEPLOYMENT.md`](../operations/DEPLOYMENT.md) and
[`RECOVERY.md`](../operations/RECOVERY.md).

## Change checklist

When changing a boundary, update all applicable items in the same pull request:

1. Route or schema implementation and its focused tests.
2. The owning API contract or feature guide.
3. Error and authorization behaviour, including client recovery where needed.
4. Migration and rollout notes if persisted data changes.
5. Observability or runbook guidance if a new failure mode is introduced.
