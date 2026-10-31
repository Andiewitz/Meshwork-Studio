**Audit ID:** SB-08 · **Priority:** P2; required before account deletion ships ·
**Depends on:** SB-03, SB-04, SB-05.

**Tracker:** [#49](https://github.com/Andiewitz/Meshwork-Studio/issues/49)

**Dependency links:** [#52](https://github.com/Andiewitz/Meshwork-Studio/issues/52), [#53](https://github.com/Andiewitz/Meshwork-Studio/issues/53), [#54](https://github.com/Andiewitz/Meshwork-Studio/issues/54).

## Problem

Workspace and Team listen for `user.deleted`, but the reviewed code has no
producer or cross-process identity deletion bridge. Listeners swallow failures;
AI has no cleanup consumer. Team cleanup now removes owned teams and memberships in other owners' teams,
and invalidates the affected access caches. This is only one part of the
unfinished lifecycle operation. Synthetic event-bus tests
do not establish that production identity deletion reaches every store.

Evidence: Workspace/Team entrypoints and storage, AI entrypoint/storage,
`server/lib/events.ts`, Go routes, and event-bus tests at `bbfec7f`.
This is an incomplete future feature: the deletion endpoint does not exist.
The formerly nonfunctional Settings control has been disabled until the workflow
is implemented.

## Proposed solution

Before exposing account deletion, define a durable lifecycle operation owned by
Go identity with explicit status for every participating data owner. Each
consumer deletes or retains its own records under documented policy, records
idempotent completion, and retries failures. Workspace coordinates deletion of
owned documents through its outbox. Preserve audit records according to an
explicit retention policy. Retired Team cleanup applies only while that data
remains in the supported lifecycle.

## Acceptance criteria

- [ ] Identity lifecycle commands originate durably and carry stable operation,
      subject, version, and correlation identifiers.
- [ ] The data/retention inventory covers sessions, Workspace grants/metadata,
      Canvas documents, AI keys/conversations/memories, and any supported Team
      memberships; each owner supplies its own replay-safe cleanup.
- [ ] Partial failures/restarts remain pending or failed with retry/replay paths;
      no swallowed error produces a global success status.
- [ ] Session revocation and handling of writes during deletion are specified
      and tested, preventing new user-owned data from escaping cleanup.
- [ ] Tests use actual lifecycle handlers and injected interruption/failure,
      including duplicate events and missing consumers.
- [ ] No public deletion endpoint is enabled until its authorization,
      completion/retention, recovery, and operational checks pass.

Keep ephemeral Redis pub/sub for low-latency invalidation; required cleanup must
have durable state and delivery evidence.
