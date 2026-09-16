# Meshwork Studio Documentation

Developer documentation, organized by domain.

---

## Security & Identity

- [**Auth Architecture**](./AUTH_ARCHITECTURE.md) — The Go identity service:
  sessions, MFA, OAuth, threat model, ownership map, cutover/rollback.
- [**Security Architecture**](./SECURITY.md) — Every layer from browser to
  database: CSRF, IDOR protection, brute-force defence, BYOK encryption,
  logging/PII policy.

## Architecture

- [**Canvas Schema**](./architecture/CANVAS_SCHEMA.md) — ReactFlow node/edge structures and canvas data model.
- [**The Engine**](./architecture/ENGINE.md) — Internal drawing engine and canvas state management.
- [**Persistence**](./architecture/PERSISTENCE.md) — Browser recovery and DynamoDB canvas persistence.
- [**Service Boundaries**](./architecture/SERVICE_BOUNDARIES.md) — Domain ownership, internal calls, API contracts, and migrations.

## Features

- [**Jenkos AI**](./features/JENKOS_AI.md) — Embedded AI co-pilot and Bring Your Own Key (BYOK) mechanics.
- [**Workspaces**](./features/WORKSPACES.md) — Workspace and real-time collaboration module.
- [**Settings**](./features/SETTINGS.md) — User preferences, security settings and account architecture.
- [**Theming**](./features/THEMING.md) — TailwindCSS configuration, CSS variables, and the dynamic theme system.

## Infrastructure

- [**Infrastructure**](./infrastructure/INFRASTRUCTURE.md) — Current single-EC2 topology and growth path.
- [**Deployment Runbook**](./operations/DEPLOYMENT.md) — Deploy paths, verification, rollback.
- [**CI/CD Operations**](./operations/CI_CD.md) — Required checks, deployment promotion, releases, and failure triage.
- [**EC2 Operations**](./operations/EC2_OPERATIONS.md) — Day-to-day instance and service operations.
- [**Secrets Inventory**](./operations/SECRETS.md) — Every secret: generation, consumers, rotation.
- [**Historical Credential Response**](./operations/HISTORICAL-CREDENTIAL-RESPONSE.md) — Private rotation and verification procedure for historical exposure.

## Development

- [**Testing**](./development/TESTING.md) — Test pyramid, commands, conventions.

## Archive

Historical material kept for context only — **not** current guidance:

- [`process/`](./archive/process/) — Q2 tickets, plans, investigations, post-mortems.
- [`security-audit-2026-03.md`](./archive/security-audit-2026-03.md) — Original audit (superseded by the 2026-08 auth overhaul).
- [`aws-migration-and-deployment.md`](./archive/aws-migration-and-deployment.md) — Earlier migration plan (references the removed JWT/csurf stack).
- [`incidents/`](./archive/incidents/) — Historical incident reports.
