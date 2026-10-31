**Audit ID:** SB-01 · **Priority:** P1 · **Dependencies:** none.

**Tracker:** [#49](https://github.com/Andiewitz/Meshwork-Studio/issues/49)

## Problem

Workspace and Team both mount `GET /internal/stats` on the same Express app.
Workspace mounts first and completes the response, so the Team handler never
answers. The metrics client records a zero team count from the wrong shape.

The separate metrics HTTP helper defaults auth to port 5000 and sends
`INTERNAL_API_KEY`; Go auth checks `AUTH_INTERNAL_KEY` on port 8081. A configured
auth URL does not resolve the distinct-key failure. Shared `internalGet()` also
uses the wrong key for Go audit search, and failed requests become empty results
or plausible zero counters.

Evidence: `server/routes.ts`, Workspace/Team `db/internal-routes.ts`,
`server/services/metrics/db/storage.ts`, `server/lib/internal.ts`, and Go
`internal/httpapi/handlers_stats.go`. Audited main: `bbfec7f`.

## Reproduction and expected behavior

Mount the actual internal routers in production order with memory substitutes
returning 11 workspaces and 7 teams. `/internal/stats` returns only
`{ totalWorkspaces: 11 }`; the actual metrics client records `total_teams: 0`.
With no auth URL override, the client calls
`http://127.0.0.1:5000/internal/stats/users`. These were reproduced locally.
Counters should retain their own values, and unavailable dependencies should be
distinguishable from zero users/teams or no audit hits.

## Scope

Use direct local ports for colocated counters or unique service-specific
internal routes. Consolidate Go calls behind an identity client that chooses
the correct URL and `AUTH_INTERNAL_KEY`, validates responses, propagates request
IDs, and exposes unavailable/error outcomes. Review shared-workspace listing's
unavailable-as-empty fallback as part of the same contract repair.

## Acceptance criteria

- [ ] A test mounting all actual internal routers proves distinct Workspace and
      Team counts survive, independent of accidental route shadowing.
- [ ] Go stats/audit calls use the auth URL/port and auth-specific credential.
      Tests use deliberately different auth and Node internal keys.
- [ ] Real Go handler tests accept only the correct configured key.
- [ ] Malformed responses, timeout, auth rejection, and upstream 5xx are visible
      as unavailable/stale states rather than fabricated zero/empty success.
- [ ] Admin metrics/audit UI and affected listing contracts handle these states;
      request IDs join the failed hop to logs.
- [ ] Focused route, client, Go, and authorization tests pass; API/runbook changes
      document any compatibility transition.
