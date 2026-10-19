// ─── k6 harness smoke test ──────────────────────────────────────────────────
// Beats the full pipeline to death cheaply: login, list, canvas read, canvas
// write, WS join + cursor, landing traffic — with assertions tuned to catch
// HARNESS bugs, not app bugs (distinct users per VU, cookie plumbing, etc.).
//
//   k6 run tests/load/k6-smoke.js          (5 VUs, ~45 s)

import http from "k6/http";
import ws from "k6/ws";
import { check, sleep, fail, group } from "k6";
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

const VUS = Number(__ENV.SMOKE_VUS || 5);

export const options = {
  // k6 clears the per-VU cookie jar after EVERY iteration by default — the
  // login performed in iteration 1 would be lost (401 NO_SESSION afterwards).
  noCookiesReset: true,
  scenarios: {
    smoke: {
      executor: "ramping-vus",
      startVUs: VUS,
      stages: [{ duration: "40s", target: VUS }],
      gracefulStop: "5s",
      exec: "smokeVU",
    },
    landingPoke: {
      executor: "constant-arrival-rate",
      rate: 3,
      timeUnit: "1s",
      duration: "35s",
      preAllocatedVUs: 5,
      exec: "landingVU",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
  },
};

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

// Harness-distinctness: every logged-in VU must carry a DIFFERENT user id —
// proves the per-VU cookie plumbing isn't collapsing into one session.
// NOTE: module state is per-VU in k6 and handleSummary runs in its own
// instance, so the distinctness verdict can't live there — each VU logs
// `smoke-user VU<n> user=<id>` once and the orchestrator counts the distinct
// ids from the log (scripts/loadtest.sh, smoke fence).

export function smokeVU() {
  if ((__VU - 1) * 2 + 1 >= users.length) {
    fail(`VU ${__VU} exceeds the seeded fixture (users: ${users.length})`);
  }
  const user = users[(__VU - 1) * 2];

  group("auth", () => {
    if (!loginVU(user)) {
      // Backoff first: fail() ends the iteration but the VU would otherwise
      // hot-loop login attempts — thousands of iters/s, i.e. megabytes of
      // stack traces, from a single broken stack.
      sleep(2);
      fail(
        `login failed for ${user.email} — check stack health + LOGIN_RATE_LIMIT_PER_IP`,
      );
    }
    const uid = vuState().userId;
    check(uid, {
      "session carries a user id": (v) => typeof v === "string" && v.length > 0,
    });
    console.log(`smoke-user VU${__VU} user=${uid}`);
  });

  const team = state.teams[Math.floor(users.indexOf(user) / teamSize)];

  group("browse", () => {
    check(kget("/api/v1/workspaces", { group: "smoke" }), {
      "workspaces 200": (r) => r.status === 200,
    });
    const shared = (team.sharedWorkspaceIds || [])[0];
    if (shared) {
      const groupRes = kget(`/api/v1/teams/${team.id}/workspaces`, {
        group: "smoke",
      });
      check(groupRes, { "team workspaces 200": (r) => r.status === 200 });
      const canvasRes = kget(`/api/v1/workspaces/${shared}/canvas`, {
        group: "smoke",
      });
      check(canvasRes, { "shared canvas 200": (r) => r.status === 200 });
    }
  });

  group("edit", () => {
    const wsId = user.personalWorkspace.id;
    const canvasRes = kget(`/api/v1/workspaces/${wsId}/canvas`, {
      group: "smoke",
    });
    if (!check(canvasRes, { "canvas 200": (r) => r.status === 200 })) {
      // Backoff: a persistent 401/5xx here would hot-loop without it.
      sleep(1);
      fail(`canvas read failed (${canvasRes.status}) for ${wsId}`);
    }
    const canvas = canvasRes.json();

    // one presence cycle: join → cursor → close
    group("ws", () => {
      ws.connect(
        BASE.replace(/^http/, "ws") + "/ws",
        {
          headers: { Origin: ORIGIN, Cookie: cookieString() },
          tags: { group: "smoke-ws" },
        },
        (socket) => {
          socket.on("open", () => {
            socket.send(JSON.stringify({ type: "join", workspaceId: wsId }));
            socket.setTimeout(() => {
              socket.send(JSON.stringify({ type: "cursor", x: 10, y: 10 }));
              socket.close();
            }, 1200);
          });
        },
      );
    });

    jitterNodes(canvas);
    const sync = kpost(
      `/api/v1/workspaces/${wsId}/canvas`,
      {
        nodes: canvas.nodes,
        edges: canvas.edges,
        baseRevision: canvas.revision,
      },
      { group: "smoke" },
    );
    const syncOk =
      check(sync, { "canvas sync 200": (r) => r.status === 200 }) ||
      replayOk(sync);
    check(syncOk, {
      "canvas sync accepted (200 or sane 409)": (r) => r === true,
    });
  });

  sleep(1);
}

function replayOk(res) {
  // 409 is legitimate only when the body carries the current revision slot.
  return res.status === 409 && res.json("revision") !== undefined;
}

export function landingVU() {
  const res = http.get(BASE + "/", {
    headers: { Origin: ORIGIN },
    tags: { group: "smoke-landing" },
  });
  check(res, { "landing 200": (r) => r.status === 200 });
}

export function handleSummary(data) {
  void data.root_group;
  const lines = [
    `── smoke done (distinctness: count the smoke-user lines above) ──`,
  ];
  const d = data.metrics.http_req_duration?.values;
  if (d) {
    lines.push(
      `  http p50 ${(d["p(50)"] ?? 0).toFixed(0)}ms  p95 ${(d["p(95)"] ?? 0).toFixed(0)}ms`,
    );
  }
  const failures = data.metrics.http_req_failed?.values?.rate ?? 0;
  lines.push(`  failures ${(failures * 100).toFixed(2)}%`);
  return { stdout: lines.join("\n") + "\n" };
}
