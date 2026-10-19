// ─── k6 capacity survey — single stage per invocation ───────────────────────
// Called BY the orchestrator once per stage:
//   k6 run -e STAGE_TARGET=50 -e STAGE_SECONDS=165 -e STAGE_INDEX=3 \
//          tests/load/k6-capacity.js
//
// Three concurrent scenarios:
//   edit    — owner VUs: workspace list → read own canvas → jitter + sync
//             (DynamoDB write), hold a /ws presence connection in their
//             own room with cursor ticks.
//   browse  — viewer VUs: workspace list → team workspace list → read the
//             team's shared canvas (DynamoDB read), join the shared room.
//   landing — constant ~10 req/s of unauthenticated traffic
//             (index.html, a hashed asset, csrf-token).
//
// Sessions live in k6's native per-VU cookie jar (./k6-lib.js) — logins are
// isolated per VU automatically; k6/ws rebuilds the cookie header by hand.

import http from "k6/http";
import ws from "k6/ws";
import { check, sleep, fail } from "k6";
import { Counter } from "k6/metrics";
import {
  BASE,
  ORIGIN,
  vuState,
  kget,
  kpost,
  loginVU,
  jitterNodes,
  cookieString,
} from "./k6-lib.js";

const STAGE_TARGET = Number(__ENV.STAGE_TARGET || 0);
const STAGE_SECONDS = Number(__ENV.STAGE_SECONDS || 165);
const RAMP_SECONDS = Number(__ENV.RAMP_SECONDS || 45);
const STAGE_INDEX = Number(__ENV.STAGE_INDEX || 1);
const LOGIN_STAGGER_SEC = Number(__ENV.LOGIN_STAGGER_SEC || 0);

if (!STAGE_TARGET) {
  fail("STAGE_TARGET env is required (orchestrator passes it)");
}

const conflicts = new Counter("canvas_sync_409_replays");
const wsMessages = new Counter("ws_messages_received");

// ─── scenario placement ─────────────────────────────────────────────────────
// Stage concurrency is split 1:1 between edit and browse.
const half = Math.floor(STAGE_TARGET / 2);
const stageStages = [
  { duration: `${RAMP_SECONDS}s`, target: half },
  { duration: `${STAGE_SECONDS - RAMP_SECONDS}s`, target: half },
];

const LANDING_RATE = Number(__ENV.LANDING_RATE || 10);

export const options = {
  // k6 clears the per-VU cookie jar after EVERY iteration by default — the
  // per-VU login would be lost (401 NO_SESSION from iteration 2 onwards).
  noCookiesReset: true,
  discardResponseBodies: false,
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
  thresholds: {
    // Only the error budget hard-aborts: a stage that starts failing exists
    // to be stopped; latency verdicts are computed per stage in the report.
    http_req_failed: [
      { threshold: "rate<0.01", abortOnFail: true, delayAbortEval: "30s" },
    ],
  },
  scenarios: {
    edit: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: stageStages,
      exec: "editorVU",
      gracefulRampDown: "10s",
      tags: { group: "edit" },
    },
    browse: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: stageStages,
      exec: "browserVU",
      gracefulRampDown: "10s",
      tags: { group: "browse" },
    },
    landing: {
      executor: "constant-arrival-rate",
      rate: LANDING_RATE,
      timeUnit: "1s",
      duration: `${STAGE_SECONDS}s`,
      preAllocatedVUs: 15,
      maxVUs: 60,
      exec: "landingVU",
    },
  },
};

// ─── fixtures ───────────────────────────────────────────────────────────────

let state;
try {
  state = JSON.parse(open("./results/state.json"));
} catch (err) {
  fail(
    `state.json missing — run the seeder first (node tests/load/seed.mjs): ${err}`,
  );
}
const users = state.users;
const teamSize = state.teamSize || 30;
if (STAGE_TARGET / 2 > Math.floor(users.length / 2)) {
  fail(
    `STAGE_TARGET ${STAGE_TARGET} needs ${STAGE_TARGET / 2} VUs per scenario; seeded for ${Math.floor(users.length / 2)}`,
  );
}

function pickUser(scenario, vu) {
  return users[(vu - 1) * 2 + (scenario === "browse" ? 1 : 0)];
}

// ─── editor scenario ────────────────────────────────────────────────────────

function loginStaggered(user) {
  if (LOGIN_STAGGER_SEC > 0 && !vuState().isLoggedIn) {
    sleep(Math.random() * LOGIN_STAGGER_SEC);
  }
  return loginVU(user);
}

export function editorVU() {
  const user = pickUser("edit", __VU);
  if (!user) fail(`edit VU ${__VU} beyond seeded users`);
  if (!loginStaggered(user)) {
    sleep(3);
    return;
  }

  const wsId = user.personalWorkspace.id;

  // workspace list (Postgres)
  check(kget("/api/v1/workspaces", { group: "edit" }), {
    "list 200": (r) => r.status === 200,
  });

  // canvas read (DynamoDB: nodes + edges + revision)
  const canvasRes = kget(`/api/v1/workspaces/${wsId}/canvas`, {
    group: "edit",
  });
  const canvasOk = check(canvasRes, { "canvas 200": (r) => r.status === 200 });
  if (!canvasOk) {
    sleep(2);
    return;
  }
  const canvas = canvasRes.json();

  // hold presence while "staying" on the canvas (join + cursor ticks)
  presenceStay(wsId, {
    group: "ws",
    staySec: 6 + Math.floor(Math.random() * 8),
    cursorMs: 1500,
  });

  // optimistic write
  jitterNodes(canvas);
  const syncRes = kpost(
    `/api/v1/workspaces/${wsId}/canvas`,
    { nodes: canvas.nodes, edges: canvas.edges, baseRevision: canvas.revision },
    { group: "edit-write" },
  );
  if (syncRes.status === 409) {
    // conflict → one replay carrying the revision the server served back
    conflicts.add(1);
    const replay = kpost(
      `/api/v1/workspaces/${wsId}/canvas`,
      {
        nodes: canvas.nodes,
        edges: canvas.edges,
        baseRevision: syncRes.json("revision") ?? canvas.revision,
      },
      { group: "edit-write" },
    );
    check(replay, { "replay 200": (r) => r.status === 200 });
  } else {
    check(syncRes, { "sync 200": (r) => r.status === 200 });
  }

  sleep(0.5);
}

// ─── browser scenario ───────────────────────────────────────────────────────

export function browserVU() {
  const user = pickUser("browse", __VU);
  if (!user) fail(`browse VU ${__VU} beyond seeded users`);
  if (!loginStaggered(user)) {
    sleep(3);
    return;
  }

  const userIndex = users.indexOf(user);
  const shared = (state.teams[Math.floor(userIndex / teamSize)]
    .sharedWorkspaceIds || [])[0];

  check(kget("/api/v1/workspaces", { group: "browse" }), {
    "list 200": (r) => r.status === 200,
  });
  check(kget("/api/v1/teams", { group: "browse" }), {
    "teams 200": (r) => r.status === 200,
  });

  if (!shared) {
    sleep(2);
    return;
  }
  const canvasRes = kget(`/api/v1/workspaces/${shared}/canvas`, {
    group: "browse",
  });
  if (check(canvasRes, { "shared canvas 200": (r) => r.status === 200 })) {
    // viewers crowd the shared team room → real fan-out pressure
    presenceStay(shared, {
      group: "ws",
      staySec: 10 + Math.floor(Math.random() * 10),
      cursorMs: 1800,
    });
  } else {
    sleep(2);
  }

  sleep(1);
}

// ─── landing scenario (unauthenticated) ─────────────────────────────────────

export function landingVU() {
  const res = http.get(BASE + "/", {
    headers: { Origin: ORIGIN },
    tags: { group: "landing" },
  });
  check(res, { "landing 200": (r) => r.status === 200 });
  if (Math.random() < 0.4 && res.body) {
    const m = String(res.body).match(/(\/assets\/[^"']+\.js)/);
    const assetUrl = m ? m[1] : "/assets/";
    const asset = http.get(BASE + assetUrl, {
      headers: { Origin: ORIGIN },
      tags: { group: "landing" },
    });
    check(asset, { "asset 200": (r) => r.status < 400 });
  }
  if (Math.random() < 0.3) {
    http.get(BASE + "/api/v1/auth/csrf-token", {
      headers: { Origin: ORIGIN },
      tags: { group: "landing" },
    });
  }
  sleep(0.4);
}

// ─── presence plumbing ──────────────────────────────────────────────────────

// Open /ws, join a room, tick cursors, close. The k6 WebSocket lives only
// inside the connect callback, so ALL staying logic happens over socket
// timers — sleep() inside the callback would desync the ws event loop.
// k6/ws does not read the HTTP jar: the cookie header is rebuilt by hand.
function presenceStay(workspaceId, { group, staySec, cursorMs }) {
  const cookie = vuState().isLoggedIn ? cookieString() : "";

  ws.connect(
    BASE.replace(/^http/, "ws") + "/ws",
    { headers: { Origin: ORIGIN, Cookie: cookie }, tags: { group } },
    (socket) => {
      socket.on("message", () => wsMessages.add(1));
      socket.on("open", () => {
        socket.send(JSON.stringify({ type: "join", workspaceId }));
        socket.setInterval(() => {
          socket.send(
            JSON.stringify({
              type: "cursor",
              x: Math.round(Math.random() * 1400),
              y: Math.round(Math.random() * 900),
            }),
          );
        }, cursorMs);
      });
      socket.setTimeout(() => socket.close(), staySec * 1000);
    },
  );
}

// ─── summaries ──────────────────────────────────────────────────────────────

export function handleSummary(data) {
  return {
    stdout: humanSummary(data),
    [`tests/load/results/stage-${STAGE_INDEX}.json`]: JSON.stringify(
      {
        generatedAt: Date.now(),
        stageIndex: STAGE_INDEX,
        stageTarget: STAGE_TARGET,
        stageSeconds: STAGE_SECONDS,
        landingRate: LANDING_RATE,
        metrics: data.metrics,
        checks: data.root_group,
      },
      null,
      1,
    ),
  };
}

function humanSummary(data) {
  const lines = [
    `── stage ${STAGE_INDEX}: ${STAGE_TARGET} VUs (edit ${half} / browse ${half}), landing ${LANDING_RATE}/s ──`,
  ];
  const reqs = data.metrics.http_reqs?.values;
  if (reqs) {
    lines.push(`  RPS ${reqs.rate?.toFixed(1)} (${reqs.count} reqs)`);
  }
  for (const [key, m] of Object.entries(data.metrics)) {
    const v = m.values;
    if (v && v.med != null && v["p(95)"] != null) {
      const p99 = v["p(99)"] != null ? `${v["p(99)"].toFixed(0)}ms` : "—";
      lines.push(
        `  ${key}: p50 ${v.med.toFixed(0)}ms p95 ${v["p(95)"].toFixed(0)}ms p99 ${p99}`,
      );
    }
  }
  if (data.metrics.http_req_failed?.values) {
    lines.push(
      `  failures: ${((data.metrics.http_req_failed.values.rate ?? 0) * 100).toFixed(2)}%`,
    );
  }
  lines.push(
    `  409 replays: ${data.metrics.canvas_sync_409_replays?.values?.count ?? 0}`,
  );
  return lines.join("\n") + "\n";
}
