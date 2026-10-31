# Load test — t3.small capacity (k6)

**Status:** Implemented — awaiting first full run (see §7; smoke then stages)
**Tooling:** `docker-compose.loadtest.yml`, `scripts/loadtest.sh`, `tests/load/*` (k6 + seeder + report). Runbook: `tests/load/README.md`.
**Scope:** Find max concurrent users for the full Meshwork stack on a ~2 vCPU / 2 GiB envelope, locally, with k6; identify which service saturates first.
**Tool:** k6 (host), docker compose (stack under test).

---

## 1. The question we're answering

On a t3.small (2 vCPU, 2 GiB, burstable), how many concurrent Meshwork users can the full stack serve before latency or error budget breaks — and which component saturates first (Node event loop, Go auth CPU, Postgres, DynamoDB-local, memory)?

**Capacity definition (default, tunable via env):** the highest stage where ALL of these hold:

| Check                           | Threshold               |
| ------------------------------- | ----------------------- |
| p95 latency (`/api/v1/*`)       | ≤ 500 ms                |
| p99 latency                     | ≤ 2 s                   |
| HTTP failure rate (non-2xx/3xx) | < 1%                    |
| Event-loop lag (Node)           | < 250 ms sustained      |
| Container stability             | no OOM kills / restarts |

409s on canvas sync are recorded as data, not failures (they're legitimate optimistic-revision responses).

"Users" below means **k6 virtual users (VUs)**: one VU ≈ one _active_ user running a realistic action loop. Less-active concurrent connections can be several times higher; we report the active-user number plus the WS-connection ceiling separately.

## 2. Test rig — approximating the t3.small

Everything already ships containerized (docker-compose.yml), so we cap the **same stack in place** with hard limits instead of replicating EC2's pm2/nginx-host shape:

| Container                 | mem limit    | cpu limit   | rationale                                                     |
| ------------------------- | ------------ | ----------- | ------------------------------------------------------------- |
| meshwork-frontend (nginx) | 64 MB        | 0.15        | thin proxy; EC2 host nginx ≈ tens of MB                       |
| meshwork-backend (node)   | 600 MB       | 1.00        | dominant budget; single node process                          |
| meshwork-auth (go)        | 352 MB       | 0.35        | Go is lean, but Argon2id logins spike CPU                     |
| meshwork-postgres         | 400 MB       | 0.25        | default shared_buffers fits                                   |
| meshwork-redis            | 128 MB       | 0.10        | appendonly + pub/sub, small                                   |
| meshwork-dynamodb-local   | 352 MB       | 0.15        | JVM needs `-Xmx256m` in override                              |
| **Σ**                     | **~1.9 GiB** | **2.0 CPU** | ⇒ t3 envelope; sort of leaves OS headroom, deliberately tight |

Rules of the rig:

- **k6 runs on the host, outside the envelope** (internet traffic stand-in). Never containerized alongside.
- `memory-swap` = memory limit (no swap — t3 has none; an exceed is a hard OOM, matching EC2).
- Sum of `cpus` = exactly 2.0 so aggregate scheduling matches a 2-vCPU box (host has 4 cores, so it won't just fall back to host speed).
- **Isolation from dev data:** override remaps the data volumes to `pgdata_loadtest` / `redis_loadtest` (same mount targets ⇒ compose merge replaces the dev volumes; dev data is untouched). DynamoDB Local runs `-inMemory` instead: the `amazon/dynamodb-local` image ships no `/home/dynamodblocal/data` directory, so a fresh named volume mounts root-owned and UID 1000 can't open the SQLite DB file (DDB loops on `unable to open database file` and every storage-touching request hangs — this broke the first bring-up run with canvas 504s). Loadtest DDB state is re-seeded every run anyway. Dev compose stack is stopped first anyway (hardcoded `container_name`s would collide).
- **The backend image always executes production branches:** `scripts/build.ts` esbuild-bundles the server with `define: {"process.env.NODE_ENV": '"production"'}`, so runtime `NODE_ENV` cannot reach any gate compiled from a member read (verified during bring-up: the CSRF origin allowlist and all express limiters use inlined constants). Two rig accommodations follow: `APP_URL`/`FRONTEND_URL` point at `http://localhost:5000` in the override (the allowlist otherwise only holds the stale EC2 APP_URL and every mutation 403s — nginx forwards `Host` as `$host`, port-stripped, so the same-origin shortcut can't match either), and the monolith's per-IP api limiter is raised via `API_RATE_LIMIT_MAX` (new runtime knob mirroring the Go service's `LOGIN_RATE_LIMIT_PER_IP`; necessary because all VUs share one source IP _and_ `trust proxy=1` pins `req.ip` to nginx's appended address, so client-supplied `X-Forwarded-For` cannot diversify buckets). Static SPA is served by the nginx container exactly like on EC2.
- Primary runs assume **full burst (2.0 vCPU)**; a t3.small only sustains 20%/vCPU baseline before CPU-credit exhaustion, so an optional follow-up run caps aggregate `cpus` at 0.4 to model sustained throttling. Primary numbers = "peak behavior"; the burst run is the caveat footnote.

## 3. Workload model

**Seeded state (setup phase, not measured):** N accounts; each with 2 workspaces; workspace #2 holds a canvas of ~40 nodes / ~50 edges (typical system diagram) in DynamoDB. Seeding exercises register/login/create-workspace via the real HTTP API. During seeding only: raise the Go register limiter via its config env (config.go:264-267) and absorb the synchronous HaveIBeenPwned call; k6 never measures registration.

**Scenario (closed model — each VU drives its own loop):**

1. **Login once per VU** at loop start (Argon2id is part of real behavior; logins per minute stay low because login happens once, ramped). Go login limiter raised via env for the run; a separate optional "login storm" probe keeps defaults on to stress it honestly.
2. Then repeat the action loop, reusing the session + assertion cookies:
   - **55% browsing:** `GET /api/v1/workspaces` → `GET /api/v1/teams` → view a canvas `GET /api/v1/workspaces/:id/canvas` (DynamoDB read), 2–5 s think time.
   - **35% editing:** canvas sync `POST /api/v1/workspaces/:id/canvas` with the revision from a fresh GET (DynamoDB write), 3–8 s think time; hand-rolled light retry on 409.
   - **10% auxiliary:** GET `/api/v1/auth/csrf-token`, session, workspace role.
   - Every **editing/aux VU** also holds a **`/ws` presence connection**: `join {workspaceId}`, cursor tick every 1–2 s, heartbeat-driven.
3. Small standalone arrival-rate scenario for unauthenticated traffic: `GET /` + hashed static asset + `GET /api/v1/auth/csrf-token` (the "someone's on the landing page" baseline, ~10 req/s constant).

**Explicitly excluded:** `/chat` + `/suggestions` (synchronous third-party AI calls — external latency, not EC2 capacity), metrics admin endpoints, WebSocket canvas-sync heavy paths in the first pass (covered by a separate WS ceiling run).

**Stage plan (main survey):**

| Stage | VUs | hold  | goal                              |
| ----- | --- | ----- | --------------------------------- |
| 0     | 0   | —     | warm + baseliner                  |
| 1     | 10  | 3 min | plausibility floor                |
| 2     | 25  | 3 min | small team                        |
| 3     | 50  | 3 min |                                   |
| 4     | 100 | 4 min | likely first ceiling for auth/DDB |
| 5     | 200 | 4 min |                                   |
| 6     | 400 | 4 min | event-loop / DDB ceiling          |
| 7     | 600 | 3 min | confirm the wall                  |

Abort mid-stage if failure budget trips (k6 `thresholds` + `abortOnFail` on the error-rate check). Full run ≈ 35–40 min. Stage sizes/thresholds configurable by env (`LOAD_STAGES`, `LOAD_P95_MS`, ...).

## 4. Instrumentation

| Source              | What                                                                                                       | How                                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| k6                  | RPS, p50/p95/p99, error %, per-group breakdown (login/browse/edit/ws)                                      | native + `handleSummary` → JSON on the host `/tmp/opencode` … → `tests/load/results/`                                                                              |
| Sampler (every 5 s) | per-container CPU % + mem (3 samples, median)                                                              | `docker stats --no-stream` loop                                                                                                                                    |
| Node prom           | `meshwork_eventloop_lag_seconds`, `meshwork_process_resident_memory_bytes`, `meshwork_http_requests_total` | loopback `:9090` inside the backend container, reached via `docker exec ... curl 127.0.0.1:9090/metrics` (published as `127.0.0.1:19090:9090` in the override too) |
| Go prom             | auth request/limiter gauges                                                                                | same trick, `127.0.0.1:19091`                                                                                                                                      |
| WS gauges           | `meshwork_websocket_connections_active`, rooms                                                             | same Node scrape                                                                                                                                                   |

Sampler writes one CSV the report script joins against the k6 JSON to generate the final per-stage table (VUs → RPS → p95/p99 → err% → cpu% per container → mem → event-loop lag) into `results/capacity-report.md`. **Verdict:** max stage passing all checks = reported capacity, plus first-saturated-component table.

## 5. Distortion ledger (what we neutralize and why)

| Distortion                                            | Base behavior                                                                                                                                                                                                                  | Neutralizer                                                                                                          | Residual risk                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| All VUs share one source IP                           | `apiLimiter` 100 req/min/IP would clamp everything far below the real bottleneck (and the value is esbuild-inlined, so `NODE_ENV=test` skip() never fires in images)                                                           | backend `API_RATE_LIMIT_MAX=1000000` runtime knob in the override (rateLimit.ts) — nothing else changes structurally | underproduction of 429 pressure; a small dedicated limiter-behavior probe can be run separately if wanted |
| Go login/register Redis limits (20 & 15 per 15min/IP) | blocks seeding + per-VU login                                                                                                                                                                                                  | raise the two Go limiter env vars (config.go:264-267) inside the override only                                       | none for traffic shape; login storms are an optional probe with defaults ON                               |
| Backend compose env suggests "development"            | Vite middleware would pollute backend numbers if it were live — it is not: the esbuild bundle takes the production path (static middleware + no Vite), so the backend serves built files like EC2, and nginx fronts everything | no extra change needed beyond the override notes above                                                               | nginx container adds a hair of latency — that's present on EC2 as host nginx too                          |
| Register's synchronous HaveIBeenPwned call            | external latency inside requests                                                                                                                                                                                               | seeding only, outside the measured window                                                                            | none                                                                                                      |
| `express-rate-limit` counts only in Node's own bucket | —                                                                                                                                                                                                                              | unchanged; when the test harness bypasses it, that's documented                                                      | —                                                                                                         |
| Local page cache ≠ EC2 cold disk                      | DynamoDB-local writes mostly RAM on this machine                                                                                                                                                                               | accepted; noted in report as "RAM-optimistic"                                                                        | read-heavy flows probably flatter vs. real EBS                                                            |
| OpenAI-in-request flows                               | external latency                                                                                                                                                                                                               | excluded                                                                                                             | reported ceiling doesn't cover `/chat` load                                                               |
| t3 burst credits                                      | sustained load throttles to ~20%/vCPU                                                                                                                                                                                          | primary = full burst; optional follow-up run at Σcpus=0.4 models sustained mode                                      | both numbers reported                                                                                     |

## 6. Deliverables

| File                               | Role                                                                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.loadtest.yml`      | override: caps, `-Xmx256m` for DDB, rig `APP_URL`/`FRONTEND_URL`, `API_RATE_LIMIT_MAX`, Go limiter env raise, published loopback ports, loadtest volumes                                              |
| `tests/load/seed.mjs`              | HTTP-API seeding (accounts → workspaces → canvas), writes `results/state.json` credential list                                                                                                        |
| `tests/load/k6-smoke.js`           | 5 VUs × 1 min harness sanity: every stage flow 2xx, WS join OK                                                                                                                                        |
| `tests/load/k6-capacity.js`        | main survey, stages + thresholds + per-group metrics + `handleSummary`                                                                                                                                |
| `tests/load/k6-lib.js`             | shared k6 helpers — per-VU auth on the native per-VU cookie jar, WS cookie handoff                                                                                                                    |
| `tests/load/k6-ws.js`              | phase 2: WS connection ceiling (separate small report)                                                                                                                                                |
| `scripts/loadtest.sh`              | orchestrator: dependency checks → stop dev stack (with warning) → up override stack → wait health → seed → smoke → run sampler + capacity k6 → join + print report → teardown prompt + volume cleanup |
| `tests/load/README.md`             | how to run, env options, how to read the report                                                                                                                                                       |
| `tests/load/results/` (gitignored) | state.json, CSV, k6 JSON, capacity-report.md                                                                                                                                                          |

## 7. Process to land it

1. Build the compose override + smoke script; run smoke through the user's host terminal (opencode's shell is a Flatpak sandbox — no docker binary visible from here, so the orchestrator is written to be run by the user; I can generate everything).
2. Seed 600 accounts (~5 min; HIBP latency dominates, fine).
3. Smoke run (5 VUs) — fix whatever surfaces (cookies, csrf headers, origin header, DDB table init).
4. Stage run (~40 min, backgrounded; sampler recording).
5. Report + walkthrough: capacity number, first saturator, per-stage table, recommendations list.
6. Optional phase 2 runs: WS ceiling; unauth-landing ceiling; CPU-credit-exhaustion run at Σcpus=0.4.

## 8. Acceptance checks

- [ ] Smoke: all flows 2xx; WS join + cursor OK; zero seed errors.
- [ ] One full stage run: per-stage table produced with k6 + prom + docker-stats numbers joined.
- [ ] Capacity verdict written in terms of §1's definition, plus first-component-saturated list.
- [ ] Teardown leaves no loadtest containers/volumes; dev volumes and dev stack untouched.
- [ ] Two consecutive smoke runs yield p95 within ±25% (harness sanity).

## 9. Open items

- Exact env names for Go limiter raising (config.go:264-267) — verify at build time.
- Canvas payload realism — 40 nodes / 50 edges is an assumption; adjustable via a seeding env knob.
- If host page-cache or 4 cores makes ceilings unobservable up to 600 VUs, extend stage table.
