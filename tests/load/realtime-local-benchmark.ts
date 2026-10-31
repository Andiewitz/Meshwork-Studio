/** Local WebSocket fan-out benchmark. No external services or real accounts.
 * Run: node node_modules/tsx/dist/cli.mjs tests/load/realtime-local-benchmark.ts
 * Permissions deliberately simulate one 1 ms database query per lookup or batch.
 */
import http from "node:http";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import WebSocket from "ws";

process.env.REDIS_URL = "";
process.env.LOG_LEVEL = "error";
const key = crypto.generateKeyPairSync("ed25519");
process.env.AUTH_ASSERTION_PUBLIC_KEY = key.publicKey
  .export({ format: "der", type: "spki" })
  .subarray(-32)
  .toString("base64");
const { initAuth } = await import("../../server/auth/index");
const { initializeWebSocket } =
  await import("../../server/services/collaboration/websocket/presence");
initAuth();
let queryCount = 0;
let countedRoom = "";
async function simulatedAccess(workspaceId: string) {
  for (let i = 0; i < 1; i++) {
    if (workspaceId === countedRoom) queryCount++;
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
  return true;
}
function assertion(user: string) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user,
      sid: `session-${user}`,
      adm: false,
      exp: Math.floor(Date.now() / 1000) + 300,
    }),
  );
  return `v1.${payload.toString("base64url")}.${crypto.sign(null, payload, key.privateKey).toString("base64url")}`;
}
function receive(ws: WebSocket, predicate: (data: any) => boolean) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off("message", listener);
      reject(new Error("message timeout"));
    }, 15000);
    function listener(raw: WebSocket.RawData) {
      const data = JSON.parse(raw.toString());
      if (predicate(data)) {
        clearTimeout(timeout);
        ws.off("message", listener);
        resolve();
      }
    }
    ws.on("message", listener);
  });
}
function percentile(data: number[], q: number) {
  const sorted = [...data].sort((a, b) => a - b);
  return sorted[Math.ceil(q * sorted.length) - 1];
}
const server = http.createServer();
const wss = initializeWebSocket(server, {
  canAccessWorkspace: async (_userId, workspaceId) =>
    simulatedAccess(workspaceId),
  canAccessMany: async (workspaceId, userIds) => {
    await simulatedAccess(workspaceId);
    return new Set(userIds);
  },
  getWorkspaceRole: async (workspaceId) => {
    await simulatedAccess(workspaceId);
    return "editor";
  },
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;
console.log(
  "Local WebSocket benchmark: 1 simulated 1ms query per permission lookup or batch, no Redis, 10 samples per room.",
);
try {
  for (const size of [2, 10, 50]) {
    const sockets: WebSocket[] = [];
    const room = `bench-${size}`;
    try {
      for (let i = 0; i < size; i++) {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
          headers: {
            Cookie: `meshwork_assertion=${assertion(`user-${size}-${i}`)}`,
          },
        });
        sockets.push(ws);
        await new Promise<void>((resolve, reject) => {
          ws.once("open", () => resolve());
          ws.once("error", reject);
        });
        const joined = receive(ws, (data) => data.type === "presence");
        ws.send(JSON.stringify({ type: "join", workspaceId: room }));
        await joined;
      }
      // Drain asynchronous join announcements before timing the isolated messages.
      await new Promise<void>((resolve) => setTimeout(resolve, 2500));
      const results: number[] = [];
      countedRoom = room;
      const startQueries = queryCount;
      for (let i = 0; i < 10; i++) {
        const nodeId = `sample-${size}-${i}`;
        const start = performance.now();
        const deliveries = sockets
          .slice(1)
          .map((ws) =>
            receive(
              ws,
              (data) => data.type === "node-move" && data.nodeId === nodeId,
            ),
          );
        sockets[0].send(
          JSON.stringify({ type: "node-move", nodeId, nodeX: i, nodeY: i }),
        );
        await Promise.all(deliveries);
        results.push(performance.now() - start);
      }
      console.log(
        JSON.stringify({
          participants: size,
          recipients: size - 1,
          samples: results.length,
          queriesPerMessage: (queryCount - startQueries) / results.length,
          lastRecipientMs: {
            p50: Number(percentile(results, 0.5).toFixed(2)),
            p95: Number(percentile(results, 0.95).toFixed(2)),
            max: Number(Math.max(...results).toFixed(2)),
          },
        }),
      );
    } finally {
      countedRoom = "";
      for (const ws of sockets) ws.terminate();
    }
  }
} finally {
  for (const client of wss.clients) client.terminate();
  await new Promise<void>((resolve) => wss.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
