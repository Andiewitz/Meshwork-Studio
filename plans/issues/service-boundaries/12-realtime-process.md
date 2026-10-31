**Audit ID:** SB-12 · **Priority:** P3; optional later extraction ·
**Depends on:** SB-02, SB-03, SB-04, SB-07, SB-09.

**Tracker:** [#49](https://github.com/Andiewitz/Meshwork-Studio/issues/49)

**Dependency links:** [#51](https://github.com/Andiewitz/Meshwork-Studio/issues/51), [#52](https://github.com/Andiewitz/Meshwork-Studio/issues/52), [#53](https://github.com/Andiewitz/Meshwork-Studio/issues/53), [#56](https://github.com/Andiewitz/Meshwork-Studio/issues/56), [#58](https://github.com/Andiewitz/Meshwork-Studio/issues/58).

## Motivation

WebSocket handling lives under Team while carrying independent collaboration
responsibilities: session verification, presence, cursors, document-event relay,
and Redis room fanout. After SB-04 gives it one Workspace access contract,
an independent process can allow socket lifecycle/scaling without restarting
the document API.

Evidence: `server/services/team/websocket/presence.ts`, `server/index.ts`, auth
revocation handling, and NGINX routing at audited main `bbfec7f`.

## Scope

Make the Collaboration module independently runnable on the same EC2 and route
`/ws` through the existing public origin. Keep Redis for ephemeral fanout and
the Workspace access port for resource authorization. Preserve current protocol
payloads unless a versioned client migration is part of the implementation.

## Acceptance criteria

- [ ] Realtime starts without Team storage or any foreign database credential.
- [ ] Two running processes relay cursors/document events and produce correct
      room membership/presence, including joins, leaves, reconnects, and failures.
- [ ] Session revocation/expiry and collaborator removal/downgrade affect all
      processes, including already joined readers and cached mutation grants.
- [ ] Tests cover missed invalidation, Redis disconnect/reconnect, cross-process
      fanout, sender echo suppression, and bounded role-cache staleness.
- [ ] Protocol limits, backpressure, connection cleanup, health, and graceful
      socket draining are implemented and verified.
- [ ] NGINX/process management, artifact deployment, telemetry, and independent
      rollback are documented; core HTTP document editing survives its outage.
- [ ] Live event relay is never presented as durable document persistence;
      document revisions/conflicts remain owned by the Canvas API.

Process separation is optional until workload or release needs justify it. It
shares the EC2 host/instance role and does not establish separate host-level IAM
identities or remove the host as a shared failure domain.
