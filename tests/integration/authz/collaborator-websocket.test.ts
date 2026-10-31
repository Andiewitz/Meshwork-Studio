import { afterAll, beforeAll, expect, it, vi } from "vitest";
import http from "node:http";
import WebSocket from "ws";
vi.mock("@server/lib/redis", () => ({
  getRedis: () => null,
  createRedisClient: () => null,
}));
vi.mock("../../../server/auth", () => ({
  verifyAssertionToken: (token: string) =>
    token
      ? { sub: token, sid: token, eml: `${token}@example.com`, nam: token }
      : null,
  authenticateUpgrade: async () => null,
  revokedSessions: new Set(),
}));
import { initializeWebSocket } from "@services/collaboration/websocket/presence";
import type { WorkspaceAccess } from "@shared/schema/workspace-contract";
const grants: Record<string, WorkspaceAccess> = {
  owner: "owner",
  viewer: "view",
};
let roleDelays: number[] = [];
let batchDelays: number[] = [];
let batchShouldFail = false;
let batchCalls = 0;
let server: http.Server;
let port: number;
const sockets: WebSocket[] = [];
function next(ws: WebSocket): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("message timeout")), 3000);
    ws.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}
async function connect(user: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: { Cookie: `meshwork_assertion=${user}` },
  });
  sockets.push(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  return ws;
}
beforeAll(async () => {
  server = http.createServer();
  initializeWebSocket(server, {
    canAccessWorkspace: async (u) => (grants[u] ?? "none") !== "none",
    canAccessMany: async (_workspaceId, ids) => {
      batchCalls++;
      const delay = batchDelays.shift() ?? 0;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (batchShouldFail) throw new Error("workspace unavailable");
      return new Set(ids.filter((id) => (grants[id] ?? "none") !== "none"));
    },
    getWorkspaceRole: async (_w, u) => {
      const delay = roleDelays.shift() ?? 0;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      return grants[u] === "owner"
        ? "workspace-owner"
        : grants[u] === "edit"
          ? "editor"
          : grants[u] === "view"
            ? "viewer"
            : null;
    },
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;
});
afterAll(async () => {
  for (const ws of sockets) ws.terminate();
  await new Promise<void>((r) => server.close(() => r()));
});
it("allows a viewer to join but rejects edits and stops delivery after removal", async () => {
  const viewer = await connect("viewer");
  let message = next(viewer);
  viewer.send(JSON.stringify({ type: "join", workspaceId: "w" }));
  expect((await message).type).toBe("presence");
  message = next(viewer);
  viewer.send(
    JSON.stringify({ type: "node-move", nodeId: "n", nodeX: 1, nodeY: 2 }),
  );
  expect(await message).toMatchObject({ type: "error", code: "FORBIDDEN" });
  const owner = await connect("owner");
  const ownerPresence = next(owner);
  owner.send(JSON.stringify({ type: "join", workspaceId: "w" }));
  expect((await ownerPresence).type).toBe("presence");
  grants.viewer = "none";
  const closed = new Promise<number>((r) =>
    viewer.once("close", (code) => r(code)),
  );
  owner.send(
    JSON.stringify({ type: "node-move", nodeId: "n", nodeX: 1, nodeY: 2 }),
  );
  expect(await closed).toBe(4403);
});

it("preserves message order through slow sender and batch permission checks", async () => {
  grants.sender = "edit";
  grants.reader = "view";
  const reader = await connect("reader");
  let joined = next(reader);
  reader.send(JSON.stringify({ type: "join", workspaceId: "order-room" }));
  await joined;
  const sender = await connect("sender");
  joined = next(sender);
  sender.send(JSON.stringify({ type: "join", workspaceId: "order-room" }));
  await joined;
  await new Promise((resolve) => setTimeout(resolve, 25));
  roleDelays = [60, 0];
  batchDelays = [60, 0];
  const before = batchCalls;
  const received = new Promise<string[]>((resolve, reject) => {
    const ids: string[] = [];
    const timer = setTimeout(() => reject(new Error("message timeout")), 3000);
    reader.on("message", function handler(raw) {
      const value = JSON.parse(raw.toString());
      if (value.type !== "node-move") return;
      ids.push(value.nodeId);
      if (ids.length === 2) {
        clearTimeout(timer);
        reader.off("message", handler);
        resolve(ids);
      }
    });
  });
  sender.send(
    JSON.stringify({ type: "node-move", nodeId: "first", nodeX: 1, nodeY: 1 }),
  );
  sender.send(
    JSON.stringify({ type: "node-move", nodeId: "second", nodeX: 2, nodeY: 2 }),
  );
  await expect(received).resolves.toEqual(["first", "second"]);
  expect(batchCalls - before).toBe(2);
});

it("fails closed when batch authorization is unavailable", async () => {
  grants.sender2 = "edit";
  grants.reader2 = "view";
  batchShouldFail = false;
  roleDelays = [];
  batchDelays = [];
  const reader = await connect("reader2");
  let joined = next(reader);
  reader.send(JSON.stringify({ type: "join", workspaceId: "fail-room" }));
  await joined;
  const sender = await connect("sender2");
  joined = next(sender);
  sender.send(JSON.stringify({ type: "join", workspaceId: "fail-room" }));
  await joined;
  await new Promise((resolve) => setTimeout(resolve, 25));
  batchShouldFail = true;
  const closed = new Promise<number>((resolve) =>
    reader.once("close", resolve),
  );
  sender.send(
    JSON.stringify({
      type: "node-move",
      nodeId: "blocked",
      nodeX: 1,
      nodeY: 1,
    }),
  );
  await expect(closed).resolves.toBe(4403);
  batchShouldFail = false;
});
it("denies a downgraded editor and stops a removed recipient's queued delivery", async () => {
  grants.editor3 = "edit";
  grants.reader3 = "view";
  roleDelays = [];
  batchDelays = [];
  batchShouldFail = false;
  const reader = await connect("reader3");
  let joined = next(reader);
  reader.send(JSON.stringify({ type: "join", workspaceId: "revoke-room" }));
  await joined;
  const editor = await connect("editor3");
  joined = next(editor);
  editor.send(JSON.stringify({ type: "join", workspaceId: "revoke-room" }));
  await joined;
  await new Promise((resolve) => setTimeout(resolve, 25));
  grants.editor3 = "view";
  const denied = next(editor);
  editor.send(
    JSON.stringify({
      type: "node-move",
      nodeId: "forbidden",
      nodeX: 1,
      nodeY: 1,
    }),
  );
  expect(await denied).toMatchObject({ type: "error", code: "FORBIDDEN" });
  grants.editor3 = "edit";
  batchDelays = [60];
  const closed = new Promise<number>((resolve) =>
    reader.once("close", resolve),
  );
  editor.send(
    JSON.stringify({
      type: "node-move",
      nodeId: "removed",
      nodeX: 1,
      nodeY: 1,
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  grants.reader3 = "none";
  await expect(closed).resolves.toBe(4403);
});
