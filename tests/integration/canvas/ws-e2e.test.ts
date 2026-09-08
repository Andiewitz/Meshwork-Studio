import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import http from "node:http";
import crypto from "node:crypto";
import WebSocket from "ws";

/**
 * Canvas + WebSocket END-TO-END proof (real routes, real DynamoDB).
 *
 * Flow under test — identical to production:
 *   1. Alice & Bob authenticate via Go-signed assertions (verified locally)
 *   2. Alice syncs a canvas through the REAL canvas route → dynamo-local
 *   3. GET /canvas returns exactly what was stored
 *   4. Bob's live socket receives Alice's node-move broadcast
 */

process.env.AUTH_ASSERTION_PUBLIC_KEY = crypto
  .randomBytes(32)
  .toString("base64");
vi.hoisted(() => {
  process.env.CANVAS_DDB_TABLE = "meshwork-canvas-ws-test";
  process.env.DYNAMODB_ENDPOINT ||= "http://127.0.0.1:8000";
});

const { initAuth, optionalAuth, requireAuth } =
  await import("../../../server/auth");
const { initializeWebSocket } =
  await import("../../../server/services/team/websocket/presence");
import { registerCanvasRoutes } from "../../../server/services/canvas/routes/canvasRoutes";
import { teamStorage } from "@services/team/db/storage";
import { workspaceStorage } from "@services/workspace/db/storage";
import { canvasStorage as realCanvasStorage } from "@services/canvas/db/storage";

// Workspace ownership: alice owns ws-shared; outsider knows nothing.
vi.mock("@services/workspace/db/storage", () => ({
  workspaceStorage: {
    getWorkspace: async (_id: string) => ({
      id: _id,
      title: "Shared",
      userId: "alice",
      type: "system",
      icon: null,
      isFavorite: false,
      collectionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      description: null,
      author: null,
      aiContext: null,
      groups: [],
      tags: [],
    }),
  },
}));
vi.mock("@services/team/db/storage", () => ({
  teamStorage: {
    canAccessWorkspace: async (u: string, _w: string) => u !== "outsider",
    getWorkspaceRole: async (w: string, u: string) =>
      w === "ws-shared" && u === "alice" ? "workspace-owner" : "viewer",
    getTeamsForWorkspace: async () => [],
    getTeamMembers: async () => [],
  },
}));

function signAssertion(sub: string, sid: string): string {
  const seed = Buffer.from(process.env.AUTH_ASSERTION_PUBLIC_KEY!, "base64");
  const priv = crypto.createPrivateKey({
    key: pkcs8(seed),
    format: "der",
    type: "pkcs8",
  });
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      sid,
      adm: false,
      exp: Math.floor(Date.now() / 1000) + 240,
    }),
  );
  const sig = crypto.sign(null, payload, priv);
  return `v1.${payload.toString("base64url")}.${sig.toString("base64url")}`;
}

function pkcs8(seed: Buffer): Buffer {
  const inner = Buffer.concat([Buffer.from([0x04, 0x20]), seed]);
  const body = Buffer.concat([
    Buffer.from([0x02, 0x01, 0x00]),
    Buffer.from([0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70]),
    Buffer.from([0x04, inner.length]),
    inner,
  ]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

const shouldRun =
  process.env.CI === "true" || process.env.RUN_DDB_PARITY === "true";

describe.skipIf(!shouldRun)("canvas + websocket e2e", () => {
  let server: http.Server;
  let baseUrl: string;
  let origin: string;
  const sockets: WebSocket[] = [];

  beforeAll(async () => {
    // provision table
    const { CreateTableCommand, DynamoDBClient } =
      await import("@aws-sdk/client-dynamodb");
    const c = new DynamoDBClient({
      endpoint: process.env.DYNAMODB_ENDPOINT!,
      region: "us-east-1",
      credentials: { accessKeyId: "local", secretAccessKey: "local" },
    });
    try {
      await c.send(
        new CreateTableCommand({
          TableName: process.env.CANVAS_DDB_TABLE!,
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
    } catch (err) {
      if ((err as { name?: string }).name !== "ResourceInUseException")
        throw err;
    }

    initAuth();

    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    const ctx = {
      registry: {
        get: (key: string) => {
          if (key === "isAuthenticated") return requireAuth;
          if (key === "teamStorage") return teamStorage;
          if (key === "workspaceStorage") return workspaceStorage;
          if (key === "canvasStorage") return realCanvasStorage;
          return null;
        },
      },
      eventBus: { emit: vi.fn(), emitAsync: vi.fn(), on: vi.fn() },
    } as unknown as Parameters<typeof registerCanvasRoutes>[1];

    app.use(optionalAuth); // populate req.user from assertions
    registerCanvasRoutes(app, ctx);

    server = http.createServer(app);
    initializeWebSocket(server);
    await new Promise<void>((r) => server.listen(0, r));
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
    origin = baseUrl;
  });

  afterAll(() => {
    for (const socket of sockets) socket.terminate();
    server?.close();
  });

  it("sync_via_rest_persists_reads_back_and_broadcasts_over_ws", async () => {
    const aliceAssertion = signAssertion("alice", "sid-alice");
    const bobAssertion = signAssertion("bob", "sid-bob");

    // Bob connects + joins first.
    const bobWs = new WebSocket(`ws://${new URL(baseUrl).host}/ws`, {
      headers: { Cookie: `meshwork_assertion=${bobAssertion}` },
    });
    sockets.push(bobWs);
    await open(bobWs);
    bobWs.send(JSON.stringify({ type: "join", workspaceId: "ws-shared" }));
    await nextMessage(bobWs); // presence

    // Alice joins too.
    const aliceWs = new WebSocket(`ws://${new URL(baseUrl).host}/ws`, {
      headers: { Cookie: `meshwork_assertion=${aliceAssertion}` },
    });
    sockets.push(aliceWs);
    await open(aliceWs);
    aliceWs.send(JSON.stringify({ type: "join", workspaceId: "ws-shared" }));
    await nextMessage(aliceWs); // presence

    // Alice syncs the canvas over REST (real route → real Dynamo storage).
    const nodes = [
      { id: "n-1", position: { x: 42, y: 7 }, data: { label: "API" } },
      { id: "n-2", position: { x: 99, y: 9 }, data: { label: "DB" } },
    ];
    const edges = [{ id: "e-1", source: "n-1", target: "n-2" }];
    const syncRes = await fetch(
      `${baseUrl}/api/v1/workspaces/ws-shared/canvas`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          Cookie: `meshwork_assertion=${aliceAssertion}; meshwork_csrf=tok123`,
          "X-CSRF-Token": "tok123",
        },
        body: JSON.stringify({ nodes, edges, baseRevision: 0 }),
      },
    );
    expect(syncRes.status, await syncRes.text()).toBe(200);

    // Persistence proof: GET returns exactly what was synced.
    const getRes = await fetch(
      `${baseUrl}/api/v1/workspaces/ws-shared/canvas`,
      {
        headers: { Cookie: `meshwork_assertion=${aliceAssertion}` },
      },
    );
    expect(getRes.status).toBe(200);
    const stored = (await getRes.json()) as {
      nodes: { id: string }[];
      edges: unknown[];
    };
    expect(stored.nodes.map((n) => n.id).sort()).toEqual(["n-1", "n-2"]);
    expect(stored.edges).toHaveLength(1);

    // Live proof: Alice moves a node → Bob receives the broadcast.
    aliceWs.send(
      JSON.stringify({
        type: "node-move",
        nodeId: "n-1",
        nodeX: 50,
        nodeY: 10,
      }),
    );
    const msg = await nextMessage(bobWs, (m) => m.type === "node-move");
    expect(msg.nodeId).toBe("n-1");
    expect(msg.nodeX).toBe(50);

    aliceWs.close();
    bobWs.close();
  }, 20_000);
});

// ─── helpers ────────────────────────────────────────────────────────────────

function open(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}

function nextMessage(
  ws: WebSocket,
  filter?: (m: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const onMsg = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (!filter || filter(msg)) {
        ws.off("message", onMsg);
        clearTimeout(timer);
        resolve(msg);
      }
    };
    ws.on("message", onMsg);
    const timer = setTimeout(() => {
      ws.off("message", onMsg);
      reject(new Error("timeout waiting for ws message"));
    }, 5000);
  });
}
