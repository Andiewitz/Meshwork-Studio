// ─── k6 WebSocket ceiling probe — phase 2 ───────────────────────────────────
// How many concurrent /ws presence connections can the stack hold on the
// t3 envelope before connects degrade or the backend approaches its memory
// cap? Run standalone, no HTTP traffic:
//
//   k6 run -e WS_TARGET=200 tests/load/k6-ws.js
//
// Pattern: every VU logs in once, opens /ws, joins its team's shared room
// (multi-member rooms ⇒ real fan-out), ticks a cursor every second and holds
// the connection for WS_HOLD seconds. Executor keeps iterating each VU, so a
// dropped socket is re-established ~immediately (backoff sleep on close).

import ws from "k6/ws";
import { sleep, fail } from "k6";
import { Counter } from "k6/metrics";
import { BASE, ORIGIN, loginVU, cookieString } from "./k6-lib.js";

const WS_TARGET = Number(__ENV.WS_TARGET || 200);
const HOLD_SECONDS = Number(__ENV.WS_HOLD || 120);
const RAMP_SECONDS = Number(__ENV.WS_RAMP || 30);

export const options = {
  // k6 clears the per-VU cookie jar after EVERY iteration by default — the
  // per-VU login would be lost (401 NO_SESSION from iteration 2 onwards).
  noCookiesReset: true,
  scenarios: {
    wsSustained: {
      executor: "ramping-vus",
      startVUs: 0,
      gracefulRampDown: "5s",
      stages: [
        { duration: `${RAMP_SECONDS}s`, target: WS_TARGET },
        { duration: `${HOLD_SECONDS}s`, target: WS_TARGET },
        { duration: "5s", target: 0 },
      ],
      exec: "wsVU",
    },
  },
  thresholds: {
    ws_connecting: ["p(95)<2000"],
    ws_session_duration: [`max>=${HOLD_SECONDS * 1000 - 15000}`],
  },
};

const dropped = new Counter("ws_survey_drops");

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

export function wsVU() {
  const user = users[(__VU - 1) * 2 + 1];
  if (!user) fail(`ws VU ${__VU} beyond seeded users`);
  if (!loginVU(user)) {
    sleep(3);
    return;
  }

  const shared = (state.teams[Math.floor(users.indexOf(user) / teamSize)]
    .sharedWorkspaceIds || [])[0];
  if (!shared) {
    fail("fixture has no shared workspace for this user's team");
  }

  const cookie = cookieString();

  ws.connect(
    BASE.replace(/^http/, "ws") + "/ws",
    { headers: { Origin: ORIGIN, Cookie: cookie }, tags: { group: "ws-hold" } },
    (socket) => {
      socket.on("open", () => {
        socket.send(JSON.stringify({ type: "join", workspaceId: shared }));
        socket.setInterval(() => {
          socket.send(
            JSON.stringify({
              type: "cursor",
              x: Math.round(Math.random() * 1400),
              y: Math.round(Math.random() * 900),
            }),
          );
        }, 1000);
      });
      socket.on("close", () => dropped.add(1)); // counts natural hold expiry too
      socket.on("error", () => dropped.add(1));
      // hold; if the stage outlasts us we drop exactly once and reconnect
      socket.setTimeout(() => socket.close(), HOLD_SECONDS * 1000);
    },
  );

  sleep(0.5);
}

export function handleSummary(data) {
  const lines = [
    `── ws probe: peak target ${WS_TARGET} connections held ${HOLD_SECONDS}s ──`,
  ];
  const sess = data.metrics.ws_session_duration?.values;
  if (sess) {
    lines.push(
      `  sessions: ${sess.count}  avg ${(sess.avg / 1000).toFixed(0)}s  p95 ${((sess["p(95)"] ?? 0) / 1000).toFixed(0)}s`,
    );
  }
  const conn = data.metrics.ws_connecting?.values;
  if (conn) {
    lines.push(
      `  connect p95 ${conn["p(95)"]?.toFixed(0)}ms max ${conn.max?.toFixed(0)}ms`,
    );
  }
  lines.push(
    `  sessions ended (incl. planned + errors): ${data.metrics.ws_survey_drops?.values?.count ?? 0}`,
  );
  return { stdout: lines.join("\n") + "\n" };
}
