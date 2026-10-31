// ─── k6 realistic sustained profile ─────────────────────────────────────────
// Constant ARRIVAL of user actions at RPS req/s (default 10/s) for DURATION.
// Unlike the capacity ramp, this models a settled user population: cold
// logins are staggered per VU across the first LOGIN_STAGGER_SEC seconds
// (real users trickle in; a 50-login burst just OOMs Argon2id), and each
// arrival is one realistic action with a fixed mix:
//
//   read canvas 45% · list workspaces 15% · save canvas 20% ·
//   landing 10% · WS presence join 10%
//
//   k6 run -e RPS=10 -e DURATION=15m tests/load/k6-realistic.js

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

const RPS = Number(__ENV.RPS || 10);
const DURATION = __ENV.DURATION || "15m";
// Optional extra stagger (seconds, default 0): cold logins are already spread
// by the arrival executor — at 10 req/s only ~30 cold VUs ever log in, paced
// one arrival per slot. The knob exists for environments with tighter auth
// memory (raise it to spread logins further).
const LOGIN_STAGGER_SEC = Number(__ENV.LOGIN_STAGGER_SEC || 0);

export const options = {
  // Preserve each VU's session jar across iterations (k6 clears it by default).
  noCookiesReset: true,
  scenarios: {
    actions: {
      executor: "constant-arrival-rate",
      rate: RPS,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: Math.max(30, RPS * 3),
      maxVUs: Math.max(80, RPS * 8),
      exec: "actionVU",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

export const conflicts = new Counter("canvas_sync_409_replays");
export const canvasSaves = new Counter("canvas_saves");
export const wsJoins = new Counter("ws_joins");

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

// ─── single arrival = one user action ───────────────────────────────────────

export function actionVU() {
  const s = vuState();

  if (!s.isLoggedIn) {
    // First arrival on this VU ⇒ one cold user logs in. The arrival executor
    // paces these (one per slot), so the Argon2id wave stays small; the
    // optional stagger spreads it further when configured.
    if (s.loginDelay === undefined) {
      s.loginDelay = Math.random() * LOGIN_STAGGER_SEC;
    }
    if (s.loginDelay > 0) sleep(s.loginDelay);
    const user = users[((__VU - 1) * 2) % users.length];
    s.user = user;
    if (!loginVU(user)) {
      sleep(2);
      fail("login failed — check stack health");
    }
  }

  const user = s.user;
  const wsId = user.personalWorkspace.id;
  const roll = Math.random();

  if (roll < 0.45) {
    // open/refresh the canvas document
    const res = kget(`/api/v1/workspaces/${wsId}/canvas`, { group: "read" });
    if (check(res, { "canvas 200": (r) => r.status === 200 })) {
      s.canvas = res.json();
      s.revision = s.canvas.revision;
    }
  } else if (roll < 0.6) {
    // navigation: workspace list (Postgres)
    check(kget("/api/v1/workspaces", { group: "nav" }), {
      "list 200": (r) => r.status === 200,
    });
  } else if (roll < 0.8) {
    // autosave: needs a document — fetch it once if the VU has none yet
    if (!s.canvas) {
      const res = kget(`/api/v1/workspaces/${wsId}/canvas`, { group: "save" });
      if (!check(res, { "canvas 200": (r) => r.status === 200 })) return;
      s.canvas = res.json();
      s.revision = s.canvas.revision;
    }
    jitterNodes(s.canvas);
    const syncRes = kpost(
      `/api/v1/workspaces/${wsId}/canvas`,
      {
        nodes: s.canvas.nodes,
        edges: s.canvas.edges,
        baseRevision: s.revision,
      },
      { group: "save" },
    );
    if (syncRes.status === 409) {
      conflicts.add(1);
      const replay = kpost(
        `/api/v1/workspaces/${wsId}/canvas`,
        {
          nodes: s.canvas.nodes,
          edges: s.canvas.edges,
          baseRevision: syncRes.json("revision") ?? s.revision,
        },
        { group: "save" },
      );
      if (check(replay, { "save replay 200": (r) => r.status === 200 })) {
        s.revision = replay.json("revision") ?? (s.revision ?? 0) + 1;
      }
    } else {
      if (check(syncRes, { "save 200": (r) => r.status === 200 })) {
        s.revision = syncRes.json("revision") ?? (s.revision ?? 0) + 1;
        canvasSaves.add(1);
      }
    }
  } else if (roll < 0.9) {
    // anonymous-flavoured landing hit (same origin, jar irrelevant)
    const res = http.get(BASE + "/", {
      headers: { Origin: ORIGIN },
      tags: { group: "landing" },
    });
    check(res, { "landing 200": (r) => r.status === 200 });
  } else {
    // presence: join the room, one cursor tick, leave
    const res = ws.connect(
      BASE.replace(/^http/, "ws") + "/ws",
      {
        headers: { Origin: ORIGIN, Cookie: cookieString() },
        tags: { group: "presence" },
      },
      (socket) => {
        socket.on("open", () => {
          socket.send(JSON.stringify({ type: "join", workspaceId: wsId }));
          socket.setTimeout(() => {
            socket.send(JSON.stringify({ type: "cursor", x: 10, y: 10 }));
            socket.close();
          }, 3000);
        });
      },
    );
    if (res.status === 101) {
      wsJoins.add(1);
    } else {
      check(res, { "ws upgrade 101": (r) => r.status === 101 });
    }
  }
}

// ─── summary ────────────────────────────────────────────────────────────────

export function handleSummary(data) {
  const d = data.metrics.http_req_duration?.values;
  const failed = data.metrics.http_req_failed?.values;
  const reqs = data.metrics.http_reqs?.values;
  const lines = [
    `── realistic run: ~${RPS} req/s for ${DURATION} ──`,
    `  requests ${reqs?.count ?? 0} (${(reqs?.rate ?? 0).toFixed(1)}/s)  ` +
      `p50 ${(d?.["p(50)"] ?? 0).toFixed(0)}ms  p95 ${(d?.["p(95)"] ?? 0).toFixed(0)}ms  ` +
      `failures ${(((failed?.rate ?? 0) * 100)).toFixed(2)}%`,
    `  saves ${data.metrics.canvas_saves?.values?.count ?? 0}  ` +
      `409 replays ${data.metrics.canvas_sync_409_replays?.values?.count ?? 0}  ` +
      `ws joins ${data.metrics.ws_joins?.values?.count ?? 0}  ` +
      `dropped iterations ${data.metrics.dropped_iterations?.values?.count ?? 0}`,
  ];
  return {
    stdout: lines.join("\n") + "\n",
    [`tests/load/results/realistic-summary.json`]: JSON.stringify(
      {
        generatedAt: Date.now(),
        rps: RPS,
        duration: DURATION,
        metrics: data.metrics,
      },
      null,
      1,
    ),
  };
}
