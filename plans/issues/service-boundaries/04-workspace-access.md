**Audit ID:** SB-04 · **Priority:** P1 · **Depends on:** SB-02 and SB-03.

**Tracker:** [#49](https://github.com/Andiewitz/Meshwork-Studio/issues/49)

**Dependency links:** [#51](https://github.com/Andiewitz/Meshwork-Studio/issues/51), [#52](https://github.com/Andiewitz/Meshwork-Studio/issues/52).

## Problem

Workspace already stores collaborator grants and implements
`getWorkspaceAccess()`, while live Workspace/Canvas HTTP routes and WebSockets
still depend on Team roles. HTTP explicitly accepts authoritative owners;
WebSocket joins use Team's ownership mirror. That mirror hydrates only missing
IDs and never refreshes known rows. Socket mutation roles have a 60-second
cache without a grant-change invalidation contract.

Evidence: Workspace schema/storage/routes, Canvas routes, Team storage, and
`server/services/team/websocket/presence.ts` at audited main `bbfec7f`.

## Proposed solution

Continue `plans/COLLABORATORS-REPLACEMENT-PLAN.md`: Workspace owns resource
existence, owner, and explicit `view`/`edit` grants. Expose one access port for
HTTP and realtime. Go owns account eligibility/profile lookup. Move WebSocket
transport to a Collaboration module and remove Team-specific color/role logic.

The existing plan's persistence is already partially implemented. Inventory
remaining steps before coding. Preserve its explicit cutover: do not silently
convert Team grants or drop `team_db` on startup. Record affected users/grants,
archive data, and document rollback before retirement.

## Acceptance criteria

- [ ] Owner/edit/view/stranger matrices cover Workspace and Canvas
      read/write/import/duplicate/delete plus WebSocket join and mutations.
- [ ] Viewers can join/cursor/read but cannot publish document mutations.
- [ ] Removed/downgraded collaborators lose the corresponding HTTP and socket
      access; cached grants and already joined readers are invalidated/evicted.
- [ ] Owner access does not require the Team mirror or successful profile lookup.
- [ ] Identity lookup has a key-protected internal contract and does not expose
      a public account-enumeration API.
- [ ] Realtime imports no Team repository; transport/session-revocation behavior
      and protocol compatibility remain covered by tests.
- [ ] Team API/UI/config/metrics/backup references are retired only with the
      documented grant cutover, recovery window, and rollback evidence.
- [ ] Two-session browser and socket tests verify live sharing and removal.

This establishes one resource-access authority; it does not introduce a new
standalone authorization service or ownership-transfer feature.
