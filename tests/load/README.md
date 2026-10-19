# k6 capacity testing — t3.small envelope

## What this is

A local harness that answers: **how many concurrent Meshwork users fit on a
2 vCPU / 2 GB box, and what saturates first** — with k6 driving the full
running stack (nginx → Node monolith + Go auth + Postgres + DynamoDB-local +
Redis), each container capped to share exactly 2.0 CPU / ~1.9 GiB so the
envelope mimics a t3.small. k6 runs OUTSIDE the caged stack, like real
internet traffic.

Full design: `plans/LOAD-TEST-T3-SMALL.md`.
Nothing here modifies app source; `docker-compose.loadtest.yml` only adds
resource caps and neutralizes test-only distortions.

## Quick start

```bash
./scripts/loadtest.sh                 # full pipeline: seed → smoke → stages → report
./scripts/loadtest.sh --smoke         # just the 45 s harness sanity check
./scripts/loadtest.sh --skip-seed     # reuse results/state.json (seeded stack)
./scripts/loadtest.sh --ws            # WebSocket ceiling probe only
./scripts/loadtest.sh --yes           # no teardown prompt at the end
```

Run it from a host shell (opencode's shell is sandboxed and cannot reach
docker/k6). k6 required: `sudo snap install k6` or a release binary.

Default survey: stage table `10→240 VUs` (edit+browse split 1:1) with a
10 req/s landing-page baseline; ~25–30 min total. Override with:

```bash
STAGE_TABLE="10:120 50:180 100:240" ./scripts/loadtest.sh
USERS=800 TEAM_SIZE=40 ./scripts/loadtest.sh --skip-seed  # if re-seeded differently
```

## What "a user" means here

One VU ≈ one _active_ user driving a realistic request loop — not a browser
tab parked open. Every active user also holds one `/ws` presence connection.
Meaning: the reported ceiling is for users who are actively creating or
editing; with idle/away sessions mixed in (and multi-tab users), the
concurrent-account number sits higher. Run `--ws` for the pure
simultaneous-connections ceiling.

## Reading the report

`results/capacity-report.md` — one row per stage (k6 latency + error rate
joined with docker CPU/mem and the backend's own Prometheus). Pass criteria:
fail-rate < 1%, p95 ≤ 500 ms (both `LOAD_P95_MS`, `LOAD_LAG_MS` env), loop-lag
≤ 250 ms. First fully-passing stage = verdict.

Diagnostics hints live in the report itself (Node CPU pinned → cluster
worker; p95 high + CPU low → storage-bound; 503s → DDB write locks).

## Distortions — what's neutralized and what stays

| Distortion                                             | Handling                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| all VUs behind ONE source IP                           | monolith image runs the esbuild-inlined production path (`NODE_ENV` is baked to `production` in `dist/index.cjs`), so its per-IP limiter is always armed — raised here via `API_RATE_LIMIT_MAX=1000000` (runtime knob); real traffic is IP-distributed |
| Go register/login window (20 per 15 min/IP by default) | raised inside the override only (`LOGIN_RATE_LIMIT_PER_IP`)                                                                                                                                                                                            |
| `/chat` (third-party AI calls)                         | excluded; capacity verdict does not cover the AI path                                                                                                                                                                                                  |
| nginx forwards `Host` without the port (`$host`)       | override points `APP_URL`/`FRONTEND_URL` at `http://localhost:5000` so the CSRF origin allowlist accepts the rig origin                                                                                                                                |
| t3.small burst credits                                 | primary runs at full 2.0 cpu; a follow-up at Σcpus=0.4 models sustained throttling (edit the override sums)                                                                                                                                            |
| No swap in the container cage                          | docker defaults memory-swap to 2×limit; note if a stage survives memory-limit pressure via swap, EC2 would OOM sooner                                                                                                                                  |
| local page cache ≠ EBS                                 | canvases live in RAM on this box; disk-heavy DDB behavior is optimistic                                                                                                                                                                                |

## Files

| File                          | Role                                                                       |
| ----------------------------- | -------------------------------------------------------------------------- |
| `docker-compose.loadtest.yml` | caps + distortion shims + loadtest-only volumes                            |
| `seed.mjs`                    | accounts, personal canvases, teams via the real API → `results/state.json` |
| `k6-smoke.js`                 | harness sanity (cookie plumbing, WS join, write path)                      |
| `k6-capacity.js`              | main survey, one stage per invocation                                      |
| `k6-ws.js`                    | phase 2: WS connection ceiling                                             |
| `report.mjs`                  | joins stage summaries + sampler CSV → report                               |
| `k6-lib.js`                   | shared per-VU cookie/session helpers                                       |

`results/` artifacts (state.json, stage-*.json, sampler.csv, logs,
capacity-report.md) — gitignored. `state.json` contains only
loadtest.example.com account credentials; NEVER seed real accounts here and
never run against a production deployment.
