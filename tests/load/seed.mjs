#!/usr/bin/env node
// ─── Meshwork k6 fixture seeder ──────────────────────────────────────────────
// Registers N accounts through the real HTTP API (nginx :5000 → Go auth),
// logs each one in, gives every user a personal workspace with a canvas in
// DynamoDB, then builds teams. Runs OUTSIDE the measured window; it exists so
// k6 can assume accounts/workspaces/canvases already exist.
//
// Output: tests/load/results/state.json — consumed by k6 scripts.
//
// Env:
//   BASE_URL=http://localhost:5000   k6 target surface
//   USERS=600                        accounts to create
//   TEAM_SIZE=30                     members per team → ceil(USERS/TEAM_SIZE)
//   CANVAS_NODES=40                  nodes per canvas
//   CANVAS_EDGES=50                  edges per canvas
//   SEED_CONCURRENCY=2               parallel accounts (auth Argon2id is
//                                    64 MiB/op; 6 parallel OOM-killes the
//                                    352M auth container — see loadtest.sh)
//
// Prereq: load-test stack up (docker-compose.loadtest.yml raises the Go
// LOGIN_RATE_LIMIT_PER_IP, blanks SMTP and boots fresh *_loadtest volumes).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "results");

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const USERS = Number(process.env.USERS ?? 600);
const TEAM_SIZE = Number(process.env.TEAM_SIZE ?? 30);
const CANVAS_NODES = Number(process.env.CANVAS_NODES ?? 40);
const CANVAS_EDGES = Number(process.env.CANVAS_EDGES ?? 50);
const CONCURRENCY = Number(process.env.SEED_CONCURRENCY ?? 6);

// Fixed password is fine: local-only, loadtest volumes, freshly seeded stack.
const PASSWORD = "LoadTest-Plough-4711-Deploy";
const ORIGIN = "http://localhost:5000";

const curve = process.env.CANVAS_CURVE === "big";

// ─── tiny HTTP client with manual cookie jar ────────────────────────────────

const cookieAt = (jar) => jar.map(([k, v]) => `${k}=${v}`).join("; ");

async function clientFetch(url, opts = {}, jar = []) {
  const res = await fetch(`${BASE_URL}${url}`, {
    ...opts,
    headers: {
      ...(opts.headers ?? {}),
      ...(jar.length ? { Cookie: cookieAt(jar) } : {}),
    },
    redirect: "manual",
  });
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) {
      const k = pair.slice(0, eq).trim();
      const v = pair.slice(eq + 1).trim();
      const at = jar.findIndex(([k2]) => k2 === k);
      if (v.length > 0) {
        at >= 0 ? (jar[at][1] = v) : jar.push([k, v]);
      } else if (at >= 0) jar.splice(at, 1);
    }
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, jar };
}

// ─── deterministic canvas factory ────────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(seed) {
  const rng = mulberry32(seed);
  const w = 1600;
  const h = 2400;
  const nodes = [];
  const NODE_N = curve ? 90 : CANVAS_NODES;
  for (let i = 0; i < NODE_N; i++) {
    nodes.push({
      id: `n${i}`,
      type: "mesh",
      position: {
        x: Math.round(rng() * w),
        y: Math.round(rng() * h),
      },
      data: {
        label: `Service-${i}`,
        kind: ["logic", "service", "cloud", "cache", "store"][i % 5],
      },
      width: 110 + Math.round(rng() * 60),
      height: 48 + Math.round(rng() * 24),
    });
  }
  const edges = [];
  const EDGE_N = curve ? 130 : CANVAS_EDGES;
  const seen = new Set();
  for (let i = 0; i < EDGE_N; i++) {
    const src = Math.floor(rng() * NODE_N);
    let tgt = Math.floor(rng() * NODE_N);
    if (src === tgt) tgt = (tgt + 1) % NODE_N;
    const key = src < tgt ? `${src}->${tgt}` : `${tgt}->${src}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ id: `e${i}`, source: `n${src}`, target: `n${tgt}` });
  }
  return { nodes, edges };
}

// ─── account provisioning (real register/login flows) ───────────────────────

async function bootstrapAccount(email) {
  // 1. csrf pair (not rate-limited, no session needed)
  const csrf = await clientFetch("/api/v1/auth/csrf-token", { method: "GET" });
  if (csrf.status !== 200) throw new Error(`csrf ${csrf.status}`);
  const csrfToken = csrf.body.csrfToken;
  const csrfHeaders = {
    "X-CSRF-Token": csrfToken,
    Origin: ORIGIN,
    "Content-Type": "application/json",
  };
  let jar = csrf.jar;

  // 2. register (pays Argon2id + synchronous HIBP; offline HIBP degrades to
  //    a no-op check, so this works without internet)
  const name = email.match(/^load-(\d+)-(\d+)/);
  const birth = await clientFetch(
    "/api/v1/auth/register",
    {
      method: "POST",
      headers: csrfHeaders,
      body: JSON.stringify({
        email,
        password: PASSWORD,
        firstName: "Load",
        lastName: `${name?.[2] ?? "0"}`,
      }),
    },
    jar,
  );
  jar = birth.jar;

  // 3. login (register itself is not an auto-login in every config)
  const login = await clientFetch(
    "/api/v1/auth/login",
    {
      method: "POST",
      headers: csrfHeaders,
      body: JSON.stringify({ email, password: PASSWORD }),
    },
    jar,
  );
  if (login.status !== 200) {
    throw new Error(`login ${login.status} ${JSON.stringify(login.body)}`);
  }
  jar = login.jar;
  const userId = login.body.user?.id;
  if (!userId) throw new Error("no user id in login response");

  const auth = { email, password: PASSWORD, jar, userId };
  const put = {
    method: "POST",
    headers: { ...csrfHeaders },
  };
  const call = (path, body) =>
    clientFetch(
      path,
      { ...put, body: body ? JSON.stringify(body) : undefined },
      auth.jar,
    ).then((r) => ((auth.jar = r.jar), r));

  // 4. personal workspace + canvas (owner ⇒ editor via workspace-owner role)
  const ws = await call("/api/v1/workspaces", {
    title: `P-${name?.[2] ?? "0"}`,
  });
  if (ws.status !== 201) throw new Error(`workspace ${ws.status}`);
  const canvas = makeCanvas(Number(name?.[2]));
  const sync = await call(`/api/v1/workspaces/${ws.body.id}/canvas`, {
    ...canvas,
    baseRevision: 0,
  });
  if (sync.status !== 200) {
    throw new Error(`canvas ${sync.status} ${JSON.stringify(sync.body)}`);
  }
  auth.personalWorkspace = { id: ws.body.id, revision: sync.body.revision };

  // 5. optional team membership handled by seed() (needs the invite code)
  return auth;
}

// ─── scheduler ───────────────────────────────────────────────────────────────

const paddingTeam = (n) => String(n).padStart(3, "0");

// The monolith calls ensureCanvasTable() exactly once at boot, fire-and-forget.
// Under the load-test caps DDB's JVM always comes up after the backend, so that
// describe fails (ECONNREFUSED) and the table is never created — every canvas
// sync would then 500 with ResourceNotFoundException. The seeder runs after the
// script's DDB canary, so it guarantees the table before k6 needs it. No-op
// when the backend already won the race.
async function ensureCanvasTable() {
  const table = "meshwork-canvas";
  const client = new DynamoDBClient({
    endpoint: process.env.DYNAMODB_ENDPOINT ?? "http://127.0.0.1:8000",
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local",
    },
  });
  try {
    await client.send(new DescribeTableCommand({ TableName: table }));
    console.log(`  canvas table "${table}" already exists`);
    return;
  } catch (err) {
    if (err?.name !== "ResourceNotFoundException") throw err;
  }
  try {
    await client.send(
      new CreateTableCommand({
        TableName: table,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "S" },
        ],
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
      }),
    );
    await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: table });
    console.log(`  canvas table "${table}" created`);
  } catch (err) {
    // Another creator (backend boot) won the race — that's fine.
    if (err?.name !== "ResourceInUseException") throw err;
    console.log(`  canvas table "${table}" created concurrently`);
  }
}

const progressLine = (done, total, tag) => {
  process.stdout.write(`  [${done}/${total}] ${tag.padEnd(34)}\r`);
};

async function main() {
  const t0 = Date.now();
  const teams = Math.max(1, Math.ceil(USERS / TEAM_SIZE));
  console.log(
    `Seeding: ${USERS} accounts, ${teams} teams × ~${TEAM_SIZE}, canvas ${curve ? "90/130" : `${CANVAS_NODES}/${CANVAS_EDGES}`} @ ${BASE_URL}`,
  );
  mkdirSync(OUT, { recursive: true });
  await ensureCanvasTable();

  const emails = Array.from({ length: USERS }, (_v, i) => {
    const team = Math.floor(i / TEAM_SIZE);
    const padded = String(i).padStart(5, "0");
    return `load-${paddingTeam(team)}-${padded}@loadtest.example.com`;
  });

  const state = {
    createdAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    password: PASSWORD,
    canvasShape: {
      nodes: curve ? 90 : CANVAS_NODES,
      edges: curve ? 130 : CANVAS_EDGES,
    },
    teamSize: TEAM_SIZE,
    users: [],
    teams: [],
  };

  const queue = emails.map((email, index) => ({ email, index }));
  const accounts = new Array(USERS);
  let done = 0;
  let failures = 0;

  const worker = async () => {
    while (queue.length) {
      const next = queue.shift();
      try {
        accounts[next.index] = await bootstrapAccount(next.email);
      } catch (err) {
        failures += 1;
        console.error(`\n  ✗ ${next.email}: ${err.message}`);
        if (failures > 10) throw new Error("too many seed failures");
      }
      done += 1;
      progressLine(done, USERS, next.email);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (failures > 0) throw new Error(`seed failed for ${failures} accounts`);
  console.log(
    `\n  ✓ ${USERS} accounts registered + logged in (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
  );

  // ── teams: owner = first member of each chunk; others join via invite code
  state.users = accounts.map((a) => ({
    email: a.email,
    password: a.password,
    userId: a.userId,
    personalWorkspace: a.personalWorkspace,
  }));

  for (let t = 0; t < teams; t++) {
    const teamAccount = accounts[t * TEAM_SIZE];
    state.teams[t] = { index: t, sharedWorkspaceIds: [] };
    const csrfToken = teamAccount.jar.find(([k]) => k === "meshwork_csrf")?.[1];
    const csrfHeaders = {
      "X-CSRF-Token": csrfToken ?? "",
      Origin: ORIGIN,
      "Content-Type": "application/json",
    };
    const call = (path, body) =>
      clientFetch(
        path,
        {
          method: body ? "POST" : "GET",
          headers: { ...csrfHeaders },
          body: body ? JSON.stringify(body) : undefined,
        },
        teamAccount.jar,
      ).then((r) => ((teamAccount.jar = r.jar), r));

    const team = await call("/api/v1/teams", { name: `Load-Team-${t}` });
    if (team.status !== 201) throw new Error(`team ${team.status}`);
    const teamId = team.body.id;
    state.teams[t].id = teamId;

    for (const seedWs of [0, 1]) {
      const ws = await call("/api/v1/workspaces", {
        title: `T${t}-S${seedWs}`,
      });
      if (ws.status !== 201) throw new Error(`team ws ${ws.status}`);
      const share = await call(`/api/v1/teams/${teamId}/workspaces`, {
        workspaceId: ws.body.id,
      });
      if (share.status !== 201) throw new Error(`share ${share.status}`);
      state.teams[t].sharedWorkspaceIds.push(ws.body.id);
    }

    // members join (viewer role — realistic read-mostly membership)
    for (let m = 1; m < TEAM_SIZE && t * TEAM_SIZE + m < USERS; m++) {
      const member = accounts[t * TEAM_SIZE + m];
      const join = await clientFetch(
        "/api/v1/teams/join",
        {
          method: "POST",
          headers: {
            "X-CSRF-Token":
              member.jar.find(([k]) => k === "meshwork_csrf")?.[1] ?? "",
            Origin: ORIGIN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inviteCode: team.body.inviteCode }),
        },
        member.jar,
      ).then((r) => ((member.jar = r.jar), r));
      if (join.status !== 201) {
        throw new Error(`join ${join.status} ${JSON.stringify(join.body)}`);
      }
    }
  }

  const out = resolve(OUT, "state.json");
  writeFileSync(out, JSON.stringify(state, null, 1));
  console.log(`\n  ✓ teams wired; state → ${out}`);
}

main().catch((err) => {
  console.error(`\nseed: ${err.message}`);
  process.exit(1);
});
