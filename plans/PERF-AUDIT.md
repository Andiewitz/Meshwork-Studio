# Meshwork Studio — Performance & Resilience Audit

Source: realistic 10 req/s × 15 min run on the 8 GB big-box profile (2026-10-19
15:17–15:32). Artifacts: `tests/load/results/realistic.log`,
`realistic-summary.json`, `sampler.csv`.

## Headline result

The app passed with room to spare — **8,130 requests, p95 20 ms, median 5 ms,
0.00% failures, 0 dropped arrivals, 939 WebSocket joins, 1,817 canvas saves**.
Backend event-loop lag averaged **1.42 ms** (max 4 ms) and RSS stayed flat at
**141–142 MB** for the whole run. The stack was bored at 10 req/s.

The run's real story is a **hidden auth-service OOM-kill** that produced zero
user-visible errors — and the fact that the monolith was never near its limits.

## Evidence summary

| Component                 | CPU avg/max | Mem avg/max       | Notes                                                                                            |
| ------------------------- | ----------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| meshwork-backend-api      | 5.4 / 13 %  | 92 / 93 MB        | lag mean 1.42 ms, p95 3 ms, max 4 ms                                                             |
| meshwork-auth             | 2.6 / 100 % | 260 / **1023 MB** | hit the 1 GiB cap in ~12 s, held ~954 MB, **OOM-killed ~2.5 min in, auto-restarted (RSS→12 MB)** |
| meshwork-dynamodb-local   | 4.1 / 19 %  | 207 / 210 MB      | 0 read/write conflicts observed                                                                  |
| meshwork-postgres         | 0.7 / 4 %   | 75 / 82 MB        | pool max 10 (`server/lib/db.ts:31`)                                                              |
| meshwork-redis            | 0.7 / 4 %   | 9 MB              | idle                                                                                             |
| meshwork-frontend (nginx) | 0.3 / 1 %   | 6 MB              | idle                                                                                             |

Why zero failures despite the restart:

- all 30 cold logins finished in the first ~30 s; after the kill there was no
  cold-login traffic left to fail;
- sessions live in Postgres/Redis, so they survive the restart;
- the auth introspection cache decoupled canvas traffic from auth downtime;
- the run's single 11.1 s outlier (1 of 8,130) is consistent with a login
  queued behind the initial Argon2 burst on the 1-cpu auth container.

## Root cause of the OOM

- Argon2id: `m = 64 MiB, t = 3, p = 2` — one hash allocates ~64 MiB scratch
  (`server/services/auth/internal/password/password.go:23-27`).
- **No concurrency bound** on password hashing: every concurrent login
  allocates another 64 MiB. 16 concurrent logins ≈ 1 GiB → cgroup kill.
- Go does not return freed RSS eagerly (glibc/scavenger retention): after the
  burst RSS stuck at ~954 MB, leaving no headroom for the next wave — the
  container was a memory bomb with a 3-minute fuse.
- The same mechanism explains the earlier stage-4 survey abort (100 VUs = 100
  near-simultaneous logins at a 352 MB cap).

## Priority 0 — fixes that remove the wall

> **Implemented 2026-10-19** (items 1–2 + healthchecks; items 3–4 turned out to
> already exist in the auth service — see notes below). Auth unit tests, build,
> vet and gofmt are green; YAML validated. Not yet exercised end-to-end on the
> live stack — the next run should include the login-storm probe below.

1. **Bound concurrent Argon2 ops** — DONE. The `password` package now owns a
   semaphore (`internal/password/pool.go`): `AUTH_HASH_CONCURRENCY` slots
   (default 4), `AUTH_HASH_WAIT_MS` bounded wait (default 2000), then
   `ErrBusy` → HTTP 429 + `Retry-After` via the `hashBusy` helper. Peak RSS is
   `base + N × 64 MiB` by construction. All hash/verify call sites in
   `handlers_auth.go`, `handlers_flows.go`, `handlers_mfa.go`,
   `handlers_oauth.go` use the ctx variants; blocking `Hash`/`Verify` remain
   for non-HTTP callers.
2. **GOMEMLIMIT + GC + RSS release** — DONE. Base compose sets
   `GOMEMLIMIT=768MiB`, `GOGC=50` for auth; an idle reclaimer calls
   `debug.FreeOSMemory()` once per busy period after one minute of no hashing,
   so the ~950 MB retained RSS drains instead of sitting at the limit. Big
   profile: auth cap 1 G → 1.5 G with `AUTH_HASH_CONCURRENCY=6`; t3 profile:
   `AUTH_HASH_CONCURRENCY=3`, `GOMEMLIMIT=256MiB` (fits the 352 M envelope).
   New metrics: `identity_hash_ops_in_flight`,
   `identity_hash_ops_rejected_total`.
3. **Healthchecks** — auth ALREADY had one (Dockerfile
   `HEALTHCHECK CMD ["/app/identity", "-healthcheck"]` + `/healthz`/`/readyz`,
   `server.go:131-132`). Corrected: the silent OOM-restart was a visibility
   gap (no restart alerting), not a missing healthcheck. Backend + frontend
   compose healthchecks ADDED (`docker-compose.yml`) so `docker compose ps`
   and `depends_on` can use real states.
4. **Login admission control** — ALREADY PRESENT. The auth service has a
   Redis-backed sliding-window limiter on login/register/forgot/reset
   (`server.go:141-152`, default 20/15 min/IP via `LOGIN_RATE_LIMIT_PER_IP`),
   per-account lockout after failed attempts (`internal/lockout`), and fails
   closed if Redis is down. Load tests deliberately raise the IP limit
   (`docker-compose.loadtest.yml` → 100000). No change needed; the remaining
   gap is visibility into restarts (see P1).

## Priority 1 — resilience & observability

5. **nginx upstream keepalive + retry** (`docker/nginx.conf:38`): add an
   `upstream` block (`keepalive 32`) and
   `proxy_next_upstream error timeout http_502 http_503` with 2 tries to
   convert a ~3 s single-instance restart window into a delayed success
   instead of 502s.
6. **Auth metrics** — mostly ALREADY PRESENT (`identity_http_duration_seconds`,
   session cache counters) but the hash pool now adds
   `identity_hash_ops_in_flight` / `identity_hash_ops_rejected_total`.
   Remaining gap: nothing scrapes auth's loopback `/metrics` in the compose
   runs (same as backend), and container restart counts are unsurfaced.
7. **Expose backend `/metrics` beyond container loopback**
   (`server/lib/metricsServer.ts` binds `127.0.0.1:9090`), or standardize a
   scrape sidecar; the load rig works around it with `docker exec`.
8. **Keep and tune the introspection cache** — it is what absorbed the auth
   restart with zero user impact. Document its TTL and consider serving stale
   on auth-unavailable to fully decouple canvas traffic from auth.

## Priority 2 — application-level wins

9. **Canvas boot race**: `server/services/canvas/index.ts:14` calls
   `void ensureCanvasTable();` fire-and-forget at module load. Await it during
   startup with retry/backoff — removes the need for the seed-side
   `ensureCanvasTable()` workaround and the first-requests race.
10. **Make the Postgres pool env-driven** (`server/lib/db.ts:31`, `max: 10`)
    for future higher-concurrency runs.
11. **Rebalance big-profile caps from real numbers**: backend 2 GB → 1 GB
    (uses 142 MB), auth 1 GB → 1.5 GB (until P0 lands). Total unchanged.
12. **Single-process monolith is justified** at current load (1.42 ms lag at
    4.5 rps inner loop). Document the trigger to revisit clustering/workers:
    e.g. lag p95 > 50 ms or > 250 rps.
13. **WebSocket hardening** before scale: max-connections guard, per-IP caps,
    ping/pong keepalive. Presence fan-out is untested above 9 concurrent.
14. **DDB concurrent-save stress**: the write-lock + 409 replay design showed
    zero conflicts here; explicitly stress the same-canvas hot path (many
    writers to one canvas) to validate the lock behavior under real contention.

## Suggested next runs

- **Login-storm probe (validates the pool)**: all sessions cold, or a
  dedicated burst of 20–30 logins/s for 60 s. Expected with the pool in
  place: auth RSS tops out near `base + N×64 MiB` (~300 MB for N=4 in the t3
  envelope), excess requests get 429 `HASH_BUSY` with `Retry-After` instead of
  OOM-restarting, and RSS drains back down within ~a minute of idle
  (`identity_hash_ops_in_flight` returns to 0, no sampler cliff).
- **RPS ladder**: 25 → 50 → 100 req/s with the same realistic mix to locate
  the _actual_ ceiling (backend showed no strain at 10).

## Housekeeping

- Sampler memory-unit bug fixed in `scripts/loadtest.sh` (docker prints
  `88.95MiB / 2GiB`; the old awk matched the limit suffix and multiplied by
  1024). This run's `sampler.csv` values for backend/auth/postgres/dynamodb
  are corrected by /1024 in analysis.
- `tests/load/results/failed-*.log` are stale (from 06:51); safe to delete.
- Survey report can be regenerated with `sudo node tests/load/report.mjs`.
