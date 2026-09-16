# Documentation Maintenance

Documentation is part of the release surface. It must describe deployed
behaviour, not a historical design or intended feature.

## Source-of-truth map

| Subject                       | Authoritative source                                       | Documentation to update                                  |
| ----------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| Go identity API               | `server/services/auth/api/openapi.yaml`                    | Auth, settings, security, and integration guidance.      |
| Workspace and canvas API      | `server/shared/routes.ts` and route handlers               | Workspace and canvas guides.                             |
| Node types and default frames | `client/src/features/workspace/utils/nodeRegistry.ts`      | Canvas schema, engine guide, and in-app developer copy.  |
| Service ownership/migrations  | Service schemas, migrations, and `server/routes.ts`        | Service boundaries guide.                                |
| Deployment and CI             | `.github/workflows`, deployment scripts, and NGINX config  | CI/CD, deployment, infrastructure, and secrets runbooks. |
| Backup/recovery               | Backup and restore scripts plus AWS configuration evidence | Recovery and observability runbooks.                     |

## Documentation change checklist

Update documentation in the same pull request when a change affects:

1. A public route, request/response shape, status code, or authorization rule.
2. A persisted schema, migration, node type, default size, or AI repair rule.
3. Environment variables, secrets, deployment order, CI gates, or rollback.
4. Health signals, metrics, log locations, backup schedule, or failure recovery.
5. A user-visible feature that is removed, incomplete, or intentionally queued.

Use precise status language: **implemented**, **configured and verified**,
**operator action required**, or **planned**. Never turn a script, a UI button,
or a local Docker volume into a claim that production recovery exists.

## Structure rules

- `README.md` is the entry point and links only to current guidance.
- `docs/operations/` contains runnable operator guidance.
- `docs/architecture/` explains executable design and ownership.
- `docs/features/` documents current product/API behaviour and calls out gaps.
- `plans/` and `docs/archive/` are history, not operational instructions.

## Review rules

Review relative Markdown links after a documentation change. Keep file paths
repository-relative, never machine-local `file:///` links. When an old document
is retained for context, label it archived and remove instructions that could be
mistaken for current operational guidance.
