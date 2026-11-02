# Realtime recovery: implementation requirements

The editor currently protects a local draft and asks the user to export or
reload after a realtime gap. It does not replay missed events or merge drafts.
A snapshot fetch alone is insufficient: other editors can have unpersisted
changes, live events can arrive while the fetch runs, and the snapshot does not
identify which live events it contains.

## Required design

1. Give every accepted canvas event a durable, ordered room cursor. A single
   room's live delivery and replay must use the same ordering source. Define a
   bounded retention window and treat overflow, storage loss, restart, or an
   unavailable stream as a recovery gap, not a successful replay. The existing
   Redis on the EC2 host is a candidate, but its persistence and failure modes
   must be verified; this does not require provisioning managed Redis.
2. Bind resume cursors to the user, workspace, and their authorization epoch.
   Increment that epoch transactionally on grant, removal, role change, and
   ownership change. Verify current access and the epoch before replay. This
   prevents a removed and later re-added collaborator from reading events from
   the period in which they lacked access. A cursor must not be forgeable.
3. Define a join/replay barrier: buffer new events while the server validates
   the cursor, then deliver the missing range and the buffered live range in
   order without duplicates. Cross-instance publishers, reconnecting to another
   process, and cursor gaps need explicit tests. Redis pub/sub alone is not a
   durable log or a global ordering guarantee.
4. Resume automatically only when replay is complete and can be applied safely.
   Local edits made during the gap need an explicit merge or preserved-draft
   path; never silently replace them. Preserve the existing revision conflict
   checks and bound memory, event size, and retained history.
5. Keep current REST response shapes unchanged. Version the internal WebSocket
   protocol and provide a conservative manual-recovery fallback for old clients,
   unavailable dependencies, expired cursors, and access-epoch changes.

## Verification before enabling

- Exercise missed events, duplicate delivery, concurrent publishers, reconnects
  during snapshot/save, interrupted replay, retention expiry, process restart,
  Redis loss, and queue saturation using actual WebSocket clients.
- Verify revoke, re-grant, role change, ownership change, and delayed permission
  checks cannot disclose historical events or let a stale client write.
- Test offline local edits, nested canvases, browser storage failures, multiple
  tabs, and revision conflicts without losing either the server or local draft.
- Measure room latency and memory under representative load against PostgreSQL
  and the chosen Redis persistence configuration. Do not infer production p95
  from mocks or a local synthetic benchmark.
