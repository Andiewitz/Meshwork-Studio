# Workspace collaborators replacement plan

Status: planned — no application behavior has changed through this document.

## Goal

Replace the throwaway Teams subsystem with explicit, workspace-scoped collaborators while keeping authenticated real-time canvas collaboration.

Each workspace has exactly one owner: its `workspaces.user_id`. The owner may add, change, or remove collaborators. A collaborator has exactly one permission:

| Access | Can do                                                                                      |
| ------ | ------------------------------------------------------------------------------------------- |
| `view` | Open a workspace and canvas; join presence and send cursor position; no mutations.          |
| `edit` | Everything in `view`, plus workspace/canvas mutations and real-time canvas events.          |
| Owner  | All `edit` actions plus collaborator management. The owner is not stored as a collaborator. |

There are deliberately no team, admin, maintain, invite-code, or inherited roles. Ownership transfer and invitations for people without an account are not part of this migration.

## Product and security decisions

- The owner adds an **existing, verified Meshwork account by normalized email**. The request returns a generic failure if the account is unknown or ineligible; it must not disclose whether an arbitrary email has an account.
- There is no pending invitation or outbound email in this change. That avoids shipping a fake invite flow without delivery, expiry, acceptance, or recovery behavior. A future invitation system can be built on this model.
- `workspace_collaborators` lives in `workspace_db`, next to the resource it authorizes. It must have a unique `(workspace_id, user_id)` constraint, a foreign key to `workspaces` with cascade deletion, an enum/check for `view|edit`, `added_by`, `created_at`, and `updated_at`.
- Authorization is server-side for every HTTP route and WebSocket message. Client-side disabled controls are presentation only.
- Existing team-shared users are **not migrated automatically**. On cutover, direct owners retain access and old team grants are revoked. Before production removal, archive the team database and report the number of affected workspaces/users to the owner/operator.
- The identity service remains the sole source of user email/name/image. The Node service may call a key-protected, loopback-only auth lookup endpoint for collaborator resolution and display. Do not copy auth tables into `workspace_db`.

## Current coupling to remove

Teams presently own `team_db`, `/api/v1/teams/*`, role resolution, workspace sharing, WebSocket join authorization, presence colours, metrics, backups, deployment manifests, and a route/UI at `/team`. The WebSocket transport itself does **not** require teams: assertion authentication, Redis room fan-out, revocation handling, cursor events, and canvas events can remain intact after being moved out of `server/services/team/`.

## Commit-by-commit implementation

Every commit must pass formatting, lint, `npm run check`, and its focused test suite. Commits that alter executable behavior include their tests; no later “test cleanup” commit is allowed to be the first coverage of a security rule.

### 1. `feat(collaborators): add workspace collaborator persistence`

Add the `workspace_collaborators` schema, migration, Zod contracts, storage methods, and unit tests inside the workspace service. Storage must support listing collaborators, looking up a user's workspace access (`owner`, `edit`, `view`, or `none`), add/upsert, permission update, removal, and rejection of owner-as-collaborator attempts.

Do not modify existing Team authorization in this commit. The additive migration keeps the production deployment reversible.

Acceptance: migration is idempotent; workspace deletion cascades collaborator rows; duplicate grants cannot exist; role/ownership invariants are covered by unit tests.

### 2. `feat(auth): provide internal collaborator identity lookup`

Add a Go-auth internal, `AUTH_INTERNAL_KEY`-protected user lookup for normalized email and a batch public-profile lookup by user ID. Return only `id`, verified email, display name, and profile image. Keep it unreachable through NGINX and document it as an internal contract.

Add Go handler/store tests for authorization, normalization, unknown/inactive or unverified users, and response redaction. Add the typed Node internal client.

Acceptance: public auth routes cannot enumerate users; a caller without the internal key receives the existing opaque failure; auth data is not duplicated into `workspace_db`.

### 3. `feat(collaborators): authorize workspace and canvas access`

Introduce collaborator endpoints owned by the workspace service:

| Endpoint                                              | Rule                                              |
| ----------------------------------------------------- | ------------------------------------------------- |
| `GET /api/v1/workspaces/:id/collaborators`            | owner or collaborator                             |
| `POST /api/v1/workspaces/:id/collaborators`           | owner only; resolves an existing account by email |
| `PATCH /api/v1/workspaces/:id/collaborators/:userId`  | owner only; `view` or `edit` only                 |
| `DELETE /api/v1/workspaces/:id/collaborators/:userId` | owner only                                        |
| `GET /api/v1/workspaces/:id/access`                   | owner/collaborator access for the current user    |

Switch workspace and canvas authorization to the new workspace access helper. Delete the old team-backed `/role` and `/members` behavior only after the new routes and client are ready. The direct owner must continue to work even if identity lookup is temporarily unavailable; collaborator management may fail closed if the identity service cannot be reached.

Acceptance: owner/view/edit/stranger matrices cover every workspace and canvas read/write/duplicate/delete route. A viewer can read but receives `403` for all mutations. A removed collaborator immediately loses HTTP access.

### 4. `refactor(realtime): decouple presence from teams`

Move `server/services/team/websocket/presence.ts` to a neutral realtime module such as `server/services/collaboration/websocket/`. Preserve assertion authentication, session-revocation fan-out, Redis room relaying, rate limits, and event payload compatibility.

Authorize `join` and canvas mutation events using the workspace collaborator access helper. Viewers may join/publish cursors; only owners/editors may publish node, edge, or canvas mutations. Replace team-assigned colours with a stable, non-secret user-ID hash into the existing cursor palette. Invalidate access caches on collaborator update/removal, so removed users do not keep their 60-second cached grant.

Acceptance: WebSocket tests prove owner/editor/viewer/stranger behavior, revocation closure, cross-process Redis relay, and immediate removal invalidation. The old team storage must not be imported by realtime code.

### 5. `feat(collaborators): replace the workspace sharing interface`

Replace the Workspace header's team member/invite-code UI with a **Collaborators** panel. It lists the owner and collaborators, lets the owner add an email with `view`/`edit`, change an existing collaborator's permission, or remove them. Non-owners see the list and their own permission but no management actions.

Replace `useTeams`, `useWorkspaceRole`, `useWorkspaceMembers`, and `useUpdateMemberRole` with collaborator hooks/contracts. Remove the `/team` route, Team page, navigation/search entries, and invite-code interactions. Preserve the existing `usePresence`, cursor display, and workspace real-time event API.

Acceptance: browser coverage proves owner management, viewer read-only UI, editor mutation UI, a removed collaborator's next request being denied, and two authorized sessions receiving cursor/canvas updates.

### 6. `refactor(teams): remove the retired team subsystem`

Remove `server/services/team/`, Team module initialization, registry entries, team role helpers, shared team contracts, `TEAM_DATABASE_URL`, the team package manifest, team-only tests, and mocked team storage. Update metrics to stop fetching/storing `totalTeams`; preserve historical metric rows/columns for one retention window unless an operator-approved data migration removes them.

Remove team database targets from backup/restore code, Docker Compose, configuration diagnostics, CI service environments, deployment upload lists, and documentation. Rewrite architecture boundary tests to enforce the new workspace/realtime boundary.

Acceptance: a fresh configuration starts without `TEAM_DATABASE_URL`; no runtime import or route references `@services/team`; `npm run check`, tests, production build, and CI's system/E2E suites pass.

### 7. `docs(collaborators): record cutover and retirement`

Update the workspace, persistence, security, service-boundary, deployment, backup/recovery, observability, configuration, and open-source documentation. Document this operator cutover sequence:

1. Back up `team_db` and record affected sharing grants.
2. Deploy the collaborator release with the new migration.
3. Verify owner/editor/viewer HTTP and WebSocket access.
4. Remove the team database environment/backup target.
5. After the declared recovery window, retire the database through an explicit operator procedure—not application startup code.

Acceptance: no current-facing documentation presents Teams, invite codes, or team roles as active functionality; archived material remains explicitly historical.

## Rollout and rollback

Deploy commits 1–4 before the UI cutover. During that window, existing team grants remain active so the additive database migration can be verified without breaking users. Deploy commit 5 only after collaborator endpoints are verified. Commit 6 is the deliberate cutover: it revokes old team grants and removes the team database dependency.

Rollback is safe before commit 6 because the collaborator table is additive. After commit 6, restore the application release and archived `team_db` together if old shared access must be restored. Do not drop `team_db` merely because application code no longer references it.

## Explicit non-goals

- Email delivery, pending invitations, expiration, and acceptance flows.
- Ownership transfer and organization-owned workspaces.
- Public sharing links.
- Migrating old team memberships automatically.
- Changing the WebSocket protocol payload shape without a versioned client migration.
