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
    getWorkspaceRole: async (_w, u) =>
      grants[u] === "owner"
        ? "workspace-owner"
        : grants[u] === "edit"
          ? "editor"
          : grants[u] === "view"
            ? "viewer"
            : null,
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
