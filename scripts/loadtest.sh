#!/usr/bin/env bash
# ==============================================================================
# Meshwork k6 capacity survey — t3.small envelope
# ==============================================================================
# Runs the FULL pipeline locally:
#
#   1. dependency checks (docker, compose, k6, node, .env, free :5000)
#   2. stops the dev compose stack (dev volumes untouched), warns first
#   3. boots the stack under the load-test caps (docker-compose.loadtest.yml)
#   4. waits for health (backend /health = Postgres + Redis round-trip)
#   5. seeds accounts/workspaces/canvases through the real HTTP API
#   6. smoke run (k6) — aborts here if the harness itself is broken
#   7. capacity survey: one k6 stage per table entry, sampler recording
#   8. assembles results/capacity-report.md, prompts teardown
#
# Usage:
#   ./scripts/loadtest.sh                 # smoke + full stage survey + report
#   ./scripts/loadtest.sh --smoke         # stop after the smoke run
#   ./scripts/loadtest.sh --skip-seed     # reuse existing results/state.json
#   ./scripts/loadtest.sh --ws            # WS ceiling probe (needs state.json)
#   ./scripts/loadtest.sh --yes           # auto-confirm teardown at the end
#   ./scripts/loadtest.sh --keep          # leave the stack up after the run
#
# Tunables (env):
#   USERS=600 TEAM_SIZE=30 CANVAS_NODES=40 CANVAS_EDGES=50    (seed)
#   STAGE_TABLE="10:165 25:180 50:180 100:210 200:210 240:180" (VUs:seconds)
#   LANDING_RATE=10 LOGIN_STAGGER_SEC=0 LOAD_P95_MS=500 LOAD_LAG_MS=250
# ==============================================================================
set -euo pipefail

# k6 resets the per-VU cookie jar after every iteration by default; every
# script logs in once per VU and expects the session jar to survive. The
# scripts also set noCookiesReset in their options — this is belt and braces
# for any ad-hoc k6 run from this shell.
export K6_NO_COOKIES_RESET=true

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

RESULTS="$REPO/tests/load/results"
COMPOSE_ARGS=(-f docker-compose.yml -f docker-compose.loadtest.yml)
if [[ "${LOADTEST_BIG:-}" == "1" ]]; then
  COMPOSE_ARGS+=(-f docker-compose.loadtest.big.yml)
  PROFILE="big-box (~5.5 cpu / ~6.25 GiB caps)"
else
  PROFILE="t3.small (Σ 2.0 cpu / ~1.9 GiB caps)"
fi

SMOKE_ONLY=false; SKIP_SEED=false; RUN_WS=false; AUTO_YES=false; KEEP=false
REALISTIC=false
for arg in "$@"; do
  case "$arg" in
    --smoke) SMOKE_ONLY=true ;;
    --skip-seed) SKIP_SEED=true ;;
    --ws) RUN_WS=true ;;
    --realistic) REALISTIC=true ;;
    --yes) AUTO_YES=true ;;
    --keep) KEEP=true ;;
    *) echo "unknown flag $arg"; exit 1 ;;
  esac
done

log()  { printf '  %s\n' "$*"; }
warn() { printf '  [warn] %s\n' "$*"; }
die()  { printf '  [abort] %s\n' "$*"; exit 1; }

# dump_logs performs on-failure container log dumps (kept in results so
# the orchestrator output stays readable; every file is world-readable).
dump_logs() {
  local c
  for c in meshwork-postgres meshwork-redis meshwork-dynamodb-local \
           meshwork-backend-api meshwork-auth meshwork-frontend; do
    docker logs --tail 60 "$c" > "$RESULTS/failed-${c}.log" 2>&1 || true
  done
  warn "container logs dumped to $RESULTS/failed-*.log"
}

# ── 1. dependencies ──────────────────────────────────────────────────────────
log "── 1. dependency checks"
command -v docker >/dev/null || die "docker not found (running inside a sandbox? use a host shell)"
docker compose version >/dev/null || die "docker compose v2 required"
command -v k6    >/dev/null || die "k6 not installed — e.g. sudo snap install k6, or: https://github.com/grafana/k6/releases"
command -v node  >/dev/null || die "node not found"
[[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]] || die "node >= 22 required (seed script)"
[[ -f .env ]]                || die ".env missing — compose needs it (POSTGRES_SUPERUSER etc.)"

if command -v ss >/dev/null && ss -ltn 2>/dev/null | grep -q -E ':5000\s'; then
  die "something already listens on :5000 — stop your dev backend first (host processes survive 'docker compose down')"
fi

# ── 2. stop dev stack ────────────────────────────────────────────────────────
log "── 2. stopping dev compose stack (dev DATABASE VOLUMES are NOT deleted)"
docker compose -f docker-compose.yml down --remove-orphans 2>/dev/null || true

SAMPLER_PID=""
COMPOSE_DOWN() { docker compose "${COMPOSE_ARGS[@]}" down; }
stop_sampler() {
  if [[ -n "$SAMPLER_PID" ]]; then
    kill "$SAMPLER_PID" 2>/dev/null || true
    SAMPLER_PID=""
    echo "# stage,END,$(date +%s%3N)" >> "$RESULTS/sampler.csv"
  fi
}
on_int() {
  stop_sampler
  COMPOSE_DOWN --remove-orphans 2>/dev/null || true
  exit 130
}
trap on_int INT

# ── 3. boot load-test stack ──────────────────────────────────────────────────
log "── 3. building + starting load-test stack — $PROFILE"
mkdir -p "$RESULTS"
if ! docker compose "${COMPOSE_ARGS[@]}" up -d --build > "$RESULTS/compose-up.log" 2>&1; then
  tail -40 "$RESULTS/compose-up.log"
  dump_logs
  die "compose up failed — see $RESULTS/compose-up.log + failed-*.log"
fi

# ── 4. health wait ───────────────────────────────────────────────────────────
log "── 4. waiting for health (backend /health, auth /healthz, nginx :5000)"
backend_ok() {
  docker exec meshwork-backend-api node -e \
    "fetch('http://127.0.0.1:5000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    2>/dev/null
}
auth_ok() {
  docker exec meshwork-auth /app/identity -healthcheck 2>/dev/null
}
BACKEND_UP=false; AUTH_UP=false; NGINX_READY=false
for _ in $(seq 1 45); do
  backend_ok && BACKEND_UP=true
  auth_ok && AUTH_UP=true
  curl -sf -o /dev/null -m 3 http://localhost:5000/api/v1/auth/csrf-token 2>/dev/null && NGINX_READY=true
  [[ "$BACKEND_UP" == true && "$AUTH_UP" == true && "$NGINX_READY" == true ]] && break
  sleep 4
done
[[ "$BACKEND_UP" == true ]]    || { dump_logs; die "backend /health never went healthy — see $RESULTS/failed-*.log"; }
[[ "$AUTH_UP" == true ]]       || { dump_logs; die "auth /healthz never went healthy — see $RESULTS/failed-*.log"; }
[[ "$NGINX_READY" == true ]]   || { dump_logs; die "nginx :5000 never answered — see $RESULTS/failed-*.log"; }
log "  ✓ stack healthy"

# ── 4b. dynamodb canary ──────────────────────────────────────────────────────
# Signed requests exercise DDB's storage path; unsigned ones (the container
# healthcheck) return fast even when storage is broken. A bad dbPath (e.g. a
# fresh named volume mounted root-owned while the JVM runs as UID 1000) leaves
# DDB looping on "unable to open database file": every canvas save then hangs
# to the nginx 60 s timeout (504). Fail in seconds with a clear message.
ddb_probe() {
  curl -s -o /dev/null -m 5 -w '%{http_code}' -X POST http://127.0.0.1:8000/ \
    -H 'Content-Type: application/x-amz-json-1.0' \
    -H 'X-Amz-Target: DynamoDB_20120810.ListTables' \
    -H 'X-Amz-Date: 20260101T000000Z' \
    -H 'Authorization: AWS4-HMAC-SHA256 Credential=local/20260101/us-east-1/dynamodb/aws4_request, SignedHeaders=host;x-amz-date, Signature=0000000000000000000000000000000000000000000000000000000000000000' \
    -d '{}'
}
DDB_UP=false
for _ in $(seq 1 6); do
  if [[ "$(ddb_probe || true)" != "000" ]]; then DDB_UP=true; break; fi
  sleep 5
done
[[ "$DDB_UP" == true ]] || { dump_logs; die "DynamoDB Local never answered a signed request (storage path hung — check its dbPath/sqlite errors in $RESULTS/failed-*.log)"; }
log "  ✓ dynamodb responsive (signed probe)"

# ── 5. seed ──────────────────────────────────────────────────────────────────
if [[ "$RUN_WS" == true ]]; then
  [[ -f "$RESULTS/state.json" ]] || die "--ws needs tests/load/results/state.json (run a seeded survey once first)"
else
  if [[ "$SKIP_SEED" == false ]]; then
    if [[ -f "$RESULTS/state.json" ]]; then
      die "results/state.json exists; either rm it (fresh volumes are empty) or pass --skip-seed"
    fi
    log "── 5. seeding (real register/login flows; Argon2id + HIBP priced)"
    # Concurrency 2, not 6: auth's Argon2id allocs 64 MiB/op (t=3, p=2) — six
    # parallel registrations OOM-killed the 352M Go auth mid-seed (silent
    # restart, 502/504 wall). 2 × 64 MiB + runtime stays inside 352M.
    USERS="${USERS:-600}" TEAM_SIZE="${TEAM_SIZE:-30}" \
    CANVAS_NODES="${CANVAS_NODES:-40}" CANVAS_EDGES="${CANVAS_EDGES:-50}" \
    SEED_CONCURRENCY="${SEED_CONCURRENCY:-2}" node tests/load/seed.mjs || { dump_logs; die "seed crashed — see $RESULTS/failed-*.log"; }
    log "  ✓ seeded"
  else
    log "── 5. seeding skipped (--skip-seed)"
  fi
fi

# ── 6. smoke ─────────────────────────────────────────────────────────────────
if [[ "$RUN_WS" == false ]]; then
  log "── 6. smoke run (5 VUs, ~45 s) — harness sanity"
  k6 run tests/load/k6-smoke.js 2>&1 | tee "$RESULTS/smoke.log"
  K6_STATUS=${PIPESTATUS[0]}
  [[ "$K6_STATUS" == "0" ]] || { dump_logs; die "smoke run failed — see $RESULTS/smoke.log + failed-*.log"; }
  # Distinctness lives here, not in handleSummary: k6 module state is per-VU
  # and handleSummary runs in a fresh instance, so it can never see a set
  # assembled across VUs. Count the per-VU `smoke-user` lines from the log.
  SMOKE_VUS_COUNT="${SMOKE_VUS:-5}"
  DISTINCT_USERS="$(grep -o 'smoke-user VU[0-9]* user=[0-9a-f-]*' "$RESULTS/smoke.log" \
    | sed 's/.*user=//' | sort -u | wc -l)"
  [[ "$DISTINCT_USERS" -ge "$((SMOKE_VUS_COUNT - 1))" ]] \
    || { dump_logs; die "smoke cookie check failed: ${DISTINCT_USERS} distinct users across ${SMOKE_VUS_COUNT} VUs — sessions collapsed; do not trust a capacity run"; }
  log "  ✓ smoke passed (${DISTINCT_USERS} distinct VU sessions)"
fi

# ── 7. survey (sampled, per-stage k6 runs) ───────────────────────────────────
start_sampler() {
  : > "$RESULTS/sampler.csv"
  (
    while true; do
      TS="$(date +%s%3N)"
      docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}}' \
        | awk -F, -v ts="$TS" '{
            cpu=$2; sub(/%/,"",cpu);
            mem=$3;
            sub(/ \/ .*$/, "", mem);   # drop the " / limit" suffix (its unit poisoned the match)
            if (mem ~ /GiB/)      { sub(/GiB/,"",mem); mem=mem*1024 }
            else if (mem ~ /MiB/) { sub(/MiB/,"",mem) }
            else                  { sub(/[a-zA-Z]+$/,"",mem); mem=mem/1024 }
            printf "%s,%s,%s,%s,,,,\n", ts, $1, cpu, mem
          }' >> "$RESULTS/sampler.csv"
      # Prom exposition binds loopback :9090 INSIDE the backend container, so
      # the published 19090 can never answer — scrape via docker exec instead.
      PROM="$(docker exec meshwork-backend-api node -e "fetch('http://127.0.0.1:9090/metrics').then(r=>r.text()).then(t=>process.stdout.write(t)).catch(()=>process.exit(1))" 2>/dev/null \
        | awk '
            /^meshwork_nodejs_eventloop_lag_seconds[{ ]/  {lag=$2}
            /^meshwork_process_resident_memory_bytes[{ ]/ {mem=$2}
            /^websocket_connections_active[{ ]/          {active=$2}
            END {
              if (lag != "" && mem != "")
                printf "%0.0f,%0.0f,%d\n", lag*1000, mem/1048576, (active=="" ? 0 : active)
            }')"
      if [[ -n "$PROM" ]]; then
        TS2="$(date +%s%3N)"
        echo "$TS2,prom,,$PROM," >> "$RESULTS/sampler.csv"
      fi
      sleep 4
    done
  ) &
  SAMPLER_PID=$!
}
stage_mark() { echo "# stage,$STAGE_INDEX,$(date +%s%3N)" >> "$RESULTS/sampler.csv"; }
trap stop_sampler EXIT

if [[ "$RUN_WS" == true ]]; then
  log "── 7. WebSocket ceiling probe (no stage table)"
  k6 run -e WS_TARGET="${WS_TARGET:-200}" -e WS_HOLD="${WS_HOLD:-120}" tests/load/k6-ws.js
elif [[ "$SMOKE_ONLY" == true ]]; then
  log "── 7. skipping the survey (--smoke)"
elif [[ "$REALISTIC" == true ]]; then
  log "── 7. realistic sustained run (~${REALISTIC_RPS:-10} req/s for ${REALISTIC_DURATION:-15m})"
  start_sampler
  k6 run \
    -e RPS="${REALISTIC_RPS:-10}" -e DURATION="${REALISTIC_DURATION:-15m}" \
    -e LOGIN_STAGGER_SEC="${LOGIN_STAGGER_SEC:-0}" \
    tests/load/k6-realistic.js 2>&1 | tee "$RESULTS/realistic.log"
  K6_STATUS=${PIPESTATUS[0]}
  stop_sampler
  [[ "$K6_STATUS" == "0" ]] || { dump_logs; die "realistic run failed — see $RESULTS/realistic.log + failed-*.log"; }
  log "  ✓ realistic run passed (fail <1%, p95 <500ms)"
else
  log "── 7. capacity survey"
  STAGE_INDEX=0
  start_sampler
  TABLE="${STAGE_TABLE:-10:165 25:180 50:180 100:210 200:210 240:180}"
  for spec in $TABLE; do
    TARGET="${spec%%:*}"
    SECONDS_="${spec##*:}"
    STAGE_INDEX=$((STAGE_INDEX + 1))
    stage_mark
    log "  -> stage $STAGE_INDEX: ${TARGET} VUs over ${SECONDS_}s"
    k6 run \
      -e STAGE_TARGET="$TARGET" -e STAGE_SECONDS="$SECONDS_" -e STAGE_INDEX="$STAGE_INDEX" \
      -e LANDING_RATE="${LANDING_RATE:-10}" \
      -e LOGIN_STAGGER_SEC="${LOGIN_STAGGER_SEC:-0}" \
      tests/load/k6-capacity.js 2>&1 | tee "$RESULTS/stage-$STAGE_INDEX.log"
    K6_STATUS=${PIPESTATUS[0]}
    if [[ "$K6_STATUS" != "0" ]]; then
      warn "stage $STAGE_INDEX tripped the abort — survey stops here (that stage's summary is still recorded)"
      break
    fi
  done
  stop_sampler

  log "── 8. report"
  LOAD_PROFILE="$PROFILE" LOAD_P95_MS="${LOAD_P95_MS:-500}" LOAD_LAG_MS="${LOAD_LAG_MS:-250}" node tests/load/report.mjs \
    || warn "report step failed (stage summaries are still in results/)"
fi

# ── 9. teardown ──────────────────────────────────────────────────────────────
# `down --volumes` would ALSO delete names declared in the base compose file
# (including the dev data volumes). So: down without --volumes, then delete
# ONLY the loadtest volumes by exact name.
LOADTEST_VOLUMES=(meshwork-studio_pgdata_loadtest meshwork-studio_redis_loadtest)
teardown() {
  log "tearing down load-test stack"
  docker compose "${COMPOSE_ARGS[@]}" down --remove-orphans 2>/dev/null || true
  for v in "${LOADTEST_VOLUMES[@]}"; do
    docker volume rm "$v" 2>/dev/null || true
  done
}
TEARDOWN_MSG="to tear down later: docker compose -f docker-compose.yml -f docker-compose.loadtest.yml down, then docker volume rm ${LOADTEST_VOLUMES[*]}"
if [[ "$KEEP" == true ]]; then
  warn "stack left up (--keep) — $TEARDOWN_MSG"
else
  YN=y
  if [[ "$AUTO_YES" != true ]]; then
    read -r -p "  Tear down the load-test stack + volumes? [y/N] " YN || YN=n
    [[ "$YN" =~ ^[Yy] ]] || YN=n
  fi
  if [[ "$YN" =~ ^[Yy] ]]; then
    teardown
  else
    log "stack left up — $TEARDOWN_MSG"
  fi
fi

log "── done: artifacts in tests/load/results/"
exit 0
