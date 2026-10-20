# Post-mortem — canvas capacity ceiling found at 400 VUs

Date: 2026-10-20
Status: complete (investigation), fixes proposed
Severity: high — capacity/cost ceiling, no data loss
Related: [`issue.md`](issue.md) · [`solution.md`](solution.md) · GitHub
[#48](https://github.com/Andiewitz/Meshwork-Studio/issues/48)

## Summary

The first clean capacity run on the `big` profile verified **400 concurrent
active VUs** (81.7 RPS, p95 228 ms, 0 failures). The 600-VU stage failed p95
(3,966 ms; p99 10,623 ms), but **all 72 failed requests were login 429s** —
`checks` failures were zero. The app itself never failed; the auth service ran
out of hash slots (197% of its 2-core cap, ~6 logins/s vs 6.7/s demand).

The follow-up audit found the next wall and the real cost driver: the canvas
stores one DynamoDB item per node/edge, reads the whole partition on every GET,
and performs a 5+ round-trip read-modify-write behind a lock on every save.
That model is fine at the seeded 90 items and unaffordable at the 15,000-item
schema cap. Node.js was investigated and **ruled out** as the cause: at 400 VUs
the backend averaged 0.48 of one core and peaked at 1.1.

Impact is a growth ceiling and a cost projection, not an outage. No user data
was lost or corrupted.

## Impact

- Verified ceiling today: ~400 concurrent active users / ~82 RPS.
- 600 VUs cannot complete login within 90 s; retries produce 10 s p99
  (`AUTH_HASH_WAIT_MS=10000`).
- Real-DynamoDB cost projection for the current canvas model: ~3.3k RCU/s at
  400 VUs ≈ 8.6 B RCU/month ≈ **$2,100/month in canvas reads alone**; ~$50k/mo
  at 10k concurrent. DynamoDB Local hid this because it is free and in-memory.
- Engineering time lost to harness/environment issues before the clean run
  (shared-user login bug, results-dir ownership, Docker group, root-owned
  `~/.docker` and `~/.config/k6` files).

## Timeline (2026-10-20)

1. **Harness fixes.** Every k6 VU logged in as the same seeded user, producing
   fake 429s. Fixed in `94e971b` (`pickUser` maps VU → unique user; guard when
   `STAGE_TARGET > USERS`). Report verdict fixed in `962d234` (a passing final
   stage is a lower bound, not full pass).
2. **Environment unblocking.** Results directory ownership, `docker` group,
   buildx lock, and k6 config permissions fixed on the host.
3. **Clean run.** 800 seeded accounts (253 s), 27 teams. Stages 400 (210 s) and
   600 (180 s), 90 s login stagger.
4. **Results.** 400 PASS (81.7 RPS, p95 228 ms, 0 fail). 600 FAIL-p95
   (84.2 RPS, p95 3,966 ms, p99 10,623 ms, 0.407% fail) — 72/72 failures were
   `login failed status=429`; auth max 197% of 2 cores.
5. **Audit.** Full request/WS/data-path review; canvas O(n) model and
   single-process assumptions identified as the next ceilings.
6. **Docs and issue.** `plans/SCALE-AUDIT-1M.md`, GitHub #48, this folder.

## Root causes

### Immediate (why 600 failed)

Auth login throughput was not part of the capacity model. Capacity is
~3 Argon2id logins/s/vCPU; 2 cores ≈ 6/s. The test demanded
600 ÷ 90 s = **6.7 logins/s**. The queue absorbed requests for up to 10 s and
then returned 429, which is exactly the observed p99 and failure count.

### Systemic (why the ceiling is low and expensive)

1. **Canvas storage is O(nodes + edges) per request.** GET is one consistent
   Query over the whole partition; save is lock → revision read → full
   partition re-read → batch writes → revision write → unlock. At 90 items it
   is invisible; at 5,000/10,000 it is 15,000-item reads and multi-chunk
   writes per save (`server/services/canvas/db/dynamo.ts:208-240, 392-459`).
2. **No cache or ETag.** Every open and reload re-reads DynamoDB
   (`canvasRoutes.ts:40-72`).
3. **Per-request access amplification.** Workspace row + up to 3 team
   DB/HTTP hops per canvas request; workspace list calls the team service over
   loopback on every request (`team/db/storage.ts:365-470`,
   `workspace/db/storage.ts:154`).
4. **Single-process assumptions.** One Node process hosts HTTP + WS + AI;
   in-memory rate limits, WS rooms, caches, metrics counters; boot-time
   migrations with no advisory lock (`server/routes.ts:43-49`).
5. **Test data was not representative.** 90-item canvases; the schema allows
   15,000. Small canvases made the storage model look cheap and hid the cost
   curve.

### Contributing (measurement)

- The first harness mapped all VUs to one account, which made earlier failures
  look like auth capacity when they were an identity bug.
- The report initially treated "final stage passed" as "all stages passed".
- Local DynamoDB has no RCU bill and is in-memory, so the cost dimension was
  absent from every previous run.

## What went well

- Staged k6 verdicts and per-container sampling localized the failure to auth
  within one run.
- The unique-user fix and lower-bound verdict fix made the results trustworthy.
- The audit's per-layer math produced a concrete next-step ladder instead of a
  guess.
- Zero functional failures at the app layer at 600 VUs after login: the API and
  canvas paths were stable even while auth was saturated.

## What went poorly

- Too much time lost to host permissions and harness identity bugs before the
  first trustworthy number.
- The canvas cost model was not reviewed when the item-per-node design was
  chosen; it surfaced only under a 1M-lens audit.
- The conversation over-indexed on the Node.js runtime after the numbers
  already showed auth and canvas as the binding constraints.

## Where we got lucky

- DynamoDB Local masked a six-figure annual cost problem that would have
  appeared only after migrating to real DynamoDB.
- The test canvases were small enough that the run passed at 400; a realistic
  canvas size would have failed much earlier for reasons unrelated to auth.

## Lessons

1. **Burst capacity and steady capacity are different numbers.** Model logins/s
   separately from RPS.
2. **Measure per layer.** RPS alone cannot tell you whether CPU, a semaphore,
   a lock, or a queue is the wall.
3. **Test at production data sizes.** 90 items vs 15,000 is a different system.
4. **Managed-service emulators lie about cost.** Track RCU/WCU per request even
   in development.
5. **A pass is a lower bound.** Never extrapolate a capacity verdict from the
   last stage that happened to pass.
6. **Blame the data model before the runtime.** The measured evidence cleared
   Node in one table.

## Action items

| #   | Action                                                              | Priority | Where                       |
| --- | ------------------------------------------------------------------- | -------- | --------------------------- |
| 1   | Give auth 4 vCPU / replicate it; rerun 600@90 s and 800–1,000@240 s | P0       | `solution.md` Phase 0       |
| 2   | Cache workspace roles and shared-workspace IDs in Redis             | P1       | Phase 1                     |
| 3   | ETag/304 + revision-keyed canvas snapshot cache                     | P1       | Phase 2a                    |
| 4   | Canvas document model (DDB) + S3 overflow with revision CAS         | P0       | Phase 2b, GitHub #48        |
| 5   | Split WS process, backend replicas, migration advisory lock         | P2       | Phase 3                     |
| 6   | Add production-sized canvas (400/500) to the standard load profile  | P1       | `tests/load`                |
| 7   | Report RCU/WCU cost estimate with every capacity run                | P2       | `tests/load/report.mjs`     |
| 8   | Keep the 240 s login-spread scenario as the app-ceiling test        | P1       | `tests/load/k6-capacity.js` |

## References

- `tests/load/results/capacity-report.md` — 400/600 run
- `plans/LOAD-TEST-T3-SMALL.md` — 240-VU baseline
- `plans/SCALE-AUDIT-1M.md` — blockers and target architecture
- `plans/AWS-MICROSERVICES-WISH.md` — instance sizing
- Commits `94e971b`, `962d234` — harness and verdict fixes
