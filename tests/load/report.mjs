#!/usr/bin/env node
// ─── capacity report assembler ──────────────────────────────────────────────
// Joins the per-stage k6 summaries (results/stage-N.json) with the sampler
// CSV (results/sampler.csv — docker stats + Node Prometheus rows) into
// results/capacity-report.md and prints the verdict.
//
//   node tests/load/report.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "results");

const P95_MS = Number(process.env.LOAD_P95_MS || 500);
const LAG_MS = Number(process.env.LOAD_LAG_MS || 250);
const FAIL_RATE = Number(process.env.LOAD_FAIL_RATE || 0.01);

// ─── load stage summaries ───────────────────────────────────────────────────

const stageFiles = (existsSync(OUT) ? readdirSync(OUT) : []).filter((f) =>
  /^stage-\d+\.json$/.test(f),
);
if (stageFiles.length === 0) {
  console.error(
    "No stage-*.json outputs in tests/load/results — run the capacity stages first.",
  );
  process.exit(1);
}
const stages = stageFiles
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  .map((f) => JSON.parse(readFileSync(resolve(OUT, f), "utf8")));

// ─── sampler CSV parsing ────────────────────────────────────────────────────
// Two row kinds share the file (writer side, scripts/loadtest.sh):
//   docker stats: ts,container,cpuPct,memMiB
//   prom scrape:  ts,prom,cpuPct(empty),lagMs,memMb,wsActive
// and stage boundaries as comment marks:   # stage,N,ts

function readSampler() {
  const p = resolve(OUT, "sampler.csv");
  if (!existsSync(p)) return { rows: [], marks: [] };
  const rows = [];
  const marks = [];
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (!line) continue;
    if (line.startsWith("# stage")) {
      const [, index, ts] = line.split(",");
      marks.push({ index: Number(index), ts: Number(ts) });
      continue;
    }
    const c = line.split(",");
    const isProm = c[1] === "prom";
    rows.push({
      ts: Number(c[0]),
      container: c[1],
      cpuPct: Number(c[2] || 0),
      memMiB: Number(c[3] || 0),
      lagMs: isProm && c[3] !== "" ? Number(c[3]) : null,
      memMb: isProm && c[4] !== "" ? Number(c[4]) : null,
      wsActive: isProm && c[5] !== "" ? Number(c[5]) : null,
    });
  }
  return { rows, marks };
}

const { rows: samplerRows, marks } = readSampler();

const windows = {};
for (let i = 0; i < marks.length; i++) {
  windows[marks[i].index] = {
    start: marks[i].ts,
    end: marks[i + 1] ? marks[i + 1].ts : Number.POSITIVE_INFINITY,
  };
}

const statRows = samplerRows.filter((r) => r.lagMs === null);
const promRows = samplerRows.filter((r) => r.lagMs !== null);

const inWindow = (row, w) => row.ts >= w.start && row.ts <= w.end;
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const peak = (v) => (v.length ? Math.max(...v) : 0);
const ms = (v) => (v == null ? "—" : v < 10 ? v.toFixed(1) : v.toFixed(0));

// ─── per-stage aggregation ──────────────────────────────────────────────────

const table = stages.map((stage) => {
  const metrics = stage.metrics || {};
  const val = (k) => metrics[k]?.values ?? {};
  const window = windows[stage.stageIndex] ?? {
    start: 0,
    end: Number.POSITIVE_INFINITY,
  };

  const prom = promRows.filter((r) => inWindow(r, window));
  const stats = statRows.filter((r) => inWindow(r, window));

  const duration = val("http_req_duration");
  const failed = val("http_req_failed");
  const p50 = duration.med ?? duration["p(50)"];

  const verdict = [];
  if ((failed.rate ?? 0) >= FAIL_RATE) verdict.push("FAIL-rate");
  if ((duration["p(95)"] ?? 0) > P95_MS) verdict.push("FAIL-p95");
  if (peak(prom.map((r) => r.lagMs ?? 0)) > LAG_MS) verdict.push("FAIL-lag");

  const curby = (rows, name) =>
    mean(rows.filter((r) => r.container === name).map((r) => r.cpuPct));
  const memby = (rows, name) =>
    mean(rows.filter((r) => r.container === name).map((r) => r.memMiB));

  return {
    stage: stage.stageIndex,
    vus: stage.stageTarget,
    rps: (val("http_reqs").rate ?? 0).toFixed(1),
    p50: ms(p50),
    p95: ms(duration["p(95)"] ?? 0),
    p99: ms(duration["p(99)"]),
    failPct: ((failed.rate ?? 0) * 100).toFixed(2),
    lagMean: mean(prom.map((r) => r.lagMs ?? 0)).toFixed(0),
    lagMax: peak(prom.map((r) => r.lagMs ?? 0)).toFixed(0),
    wsPeak: peak(prom.map((r) => r.wsActive ?? 0)),
    cpuBackend: curby(stats, "meshwork-backend-api").toFixed(0),
    cpuAuth: curby(stats, "meshwork-auth").toFixed(0),
    cpuPostgres: curby(stats, "meshwork-postgres").toFixed(0),
    cpuFrontend: curby(stats, "meshwork-frontend").toFixed(0),
    memBackend: memby(stats, "meshwork-backend-api").toFixed(0),
    memAuth: memby(stats, "meshwork-auth").toFixed(0),
    verdict: verdict.length ? verdict.join("+") : "PASS",
  };
});

// capacity = the LAST fully-passing stage reached in order
let capacity = table[0];
for (const row of table) {
  if (row.verdict === "PASS") capacity = row;
  else break;
}
const firstBreak = table.find((r) => r.verdict !== "PASS");

// ─── markdown ───────────────────────────────────────────────────────────────

const md = [];
md.push(`# k6 capacity report — ${process.env.LOAD_PROFILE || "load-test envelope"}`);
md.push("");
md.push(`Generated: ${new Date().toISOString()}`);
md.push(
  `Pass definition: HTTP failure rate < ${(FAIL_RATE * 100).toFixed(1)}%, p95 ≤ ${P95_MS} ms, event-loop lag max ≤ ${LAG_MS} ms`,
);
md.push("");
md.push("## Verdict");
md.push("");
md.push(
  `**Capacity: ~${capacity.vus} concurrent active VUs** — last stage with all checks passing (#${capacity.stage}).`,
);
if (firstBreak) {
  md.push(
    `First failing stage: **#${firstBreak.stage}** — ${firstBreak.verdict}.`,
  );
}
md.push("");
md.push("## Per stage");
md.push("");
md.push(
  "| stg | VUs | RPS | p50 | p95 | p99 | fail% | lag mean/max ms | ws peak | cpu% back/auth/pg/nginx | mem be/auth MB | verdict |",
);
md.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of table) {
  md.push(
    `| ${r.stage} | ${r.vus} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.failPct} | ${r.lagMean}/${r.lagMax} | ${r.wsPeak} | ${r.cpuBackend}/${r.cpuAuth}/${r.cpuPostgres}/${r.cpuFrontend} | ${r.memBackend}/${r.memAuth} | ${r.verdict} |`,
  );
}
md.push("");
md.push("## Reading the table");
md.push("");
md.push(
  "- `cpu backend` is % of one core; sustained ~100 means the single Node process is saturated even if the container cap is higher. A cluster/worker split is the first lever.",
);
md.push(
  "- `p95` climbing while CPU is low → waiting on Postgres/DynamoDB-local, not on CPU.",
);
md.push(
  "- spikes in `fail%` with 503 in the logs → DDB write locks or canvas-copy 503 paths.",
);
md.push(
  "- auth CPU spiking on the ramp of each stage → Argon2id login cost, paced by the 45 s ramp.",
);
md.push(
  "- `ws peak` is the sampled max of `meshwork_websocket_connections_active` in that stage window.",
);
md.push("");

const out = resolve(OUT, "capacity-report.md");
writeFileSync(out, md.join("\n") + "\n");

console.log(
  md.filter((l) => l.startsWith("#") || l.startsWith("**Capacity")).join("\n"),
);
console.log(`\n→ ${out}`);
