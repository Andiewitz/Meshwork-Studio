// ─── shared k6 helpers for Meshwork load tests ──────────────────────────────
// Sessions run on k6's NATIVE per-VU cookie jar: every VU stores its own
// Set-Cookie responses (login ⇒ meshwork_session + meshwork_assertion, csrf
// GET ⇒ meshwork_csrf) and automatically attaches them to same-URL requests.
// That is per-VU isolation for free — no manual cookie plumbing, and the
// assertion cookie rotates itself via Set-Cookie absorption.
// The only manual glue left is for `k6/ws`, which does NOT read the jar:
// cookieString() reconstructs the header from the jar.

import http from "k6/http";
import exec from "k6/execution";

export { http };

export const BASE = __ENV.BASE_URL || "http://localhost:5000";
export const ORIGIN = BASE; // Origin === Host passes the same-origin check
export const CT = "application/json";

// ─── per-VU bookkeeping (light; the jar does the real work) ─────────────────

const vuStates = new Map();

export function vuState() {
  const key = `${exec.scenario.name}#${__VU}`;
  let s = vuStates.get(key);
  if (!s) {
    s = { isLoggedIn: false, userId: null };
    vuStates.set(key, s);
  }
  return s;
}

export function cookieString() {
  const jar = http.cookieJar();
  const cookies = jar.cookiesForURL(BASE);
  return Object.entries(cookies)
    .map(([k, vals]) => `${k}=${vals[0]}`)
    .join("; ");
}

// Double-submit CSRF (server/auth/csrf.ts): the X-CSRF-Token header must
// equal the `meshwork_csrf` cookie exactly. Read it straight from the jar so
// the pair can never drift.
export function csrfToken() {
  const vals = http.cookieJar().cookiesForURL(BASE).meshwork_csrf;
  return vals && vals[0] ? vals[0] : "";
}

// ─── request helpers ────────────────────────────────────────────────────────

export function kget(path, tags) {
  return http.get(BASE + path, { headers: { Origin: ORIGIN }, tags });
}

export function kpost(path, body, tags) {
  return http.post(BASE + path, JSON.stringify(body), {
    headers: {
      Origin: ORIGIN,
      "Content-Type": CT,
      "X-CSRF-Token": csrfToken(),
    },
    tags,
  });
}

// ─── auth bootstrap (once per VU, first iteration; jar stores cookies) ──────

export function loginVU(user) {
  const s = vuState();
  if (s.isLoggedIn) return true;

  // csrf pair: cookie lands in the jar; body secret goes into the header
  // (the token is only minted by the csrf-token GET — no rotation on login)
  const csrf = http.get(BASE + "/api/v1/auth/csrf-token", {
    headers: { Origin: ORIGIN },
    tags: { group: "auth" },
  });
  const token = csrf.json("csrfToken");

  const login = http.post(
    BASE + "/api/v1/auth/login",
    JSON.stringify({ email: user.email, password: user.password }),
    {
      headers: {
        Origin: ORIGIN,
        "Content-Type": CT,
        "X-CSRF-Token": token || "",
      },
      tags: { group: "auth" },
    },
  );

  s.isLoggedIn = login.status === 200;
  if (s.isLoggedIn) {
    s.userId = login.json("user")?.id ?? user.userId;
  } else {
    console.log(
      `login failed status=${login.status} body=${String(login.body ?? "").slice(0, 160)}`,
    );
  }
  return s.isLoggedIn;
}

// ─── canvas payload mutation ────────────────────────────────────────────────

// Real editor behavior: drag a handful of nodes, then save. Mutates in place
// and returns the canvas; the caller passes the revision it just read.
export function jitterNodes(canvas) {
  const picked = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < picked && i < canvas.nodes.length; i++) {
    const node = canvas.nodes[Math.floor(Math.random() * canvas.nodes.length)];
    node.position.x += Math.round(Math.random() * 40 - 20);
    node.position.y += Math.round(Math.random() * 30 - 15);
  }
  return canvas;
}
