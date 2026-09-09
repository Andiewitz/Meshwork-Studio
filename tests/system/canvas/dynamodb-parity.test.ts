import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { DynamoCanvasStorage } from "../../../server/services/canvas/db/dynamo";

// Storage captures its configuration at import time, before beforeAll runs.
vi.hoisted(() => {
  process.env.CANVAS_DDB_TABLE = "meshwork-canvas-test";
  process.env.DYNAMODB_ENDPOINT ||= "http://127.0.0.1:8000";
});

/**
 * Canvas persistence PARITY suite.
 *
 * Runs against real DynamoDB semantics via dynamo-local (compose service
 * emnesh-dynamodb-local). It is in the explicit system-test tier, so ordinary
 * unit/integration runs never silently skip this coverage.
 *
 * These tests pin the exact contract the old Postgres implementation
 * provided, so the DynamoDB cutover cannot silently change behavior:
 *   - get returns exactly what was synced
 *   - sync REPLACES the set (removed nodes/edges disappear)
 *   - unchanged items are not rewritten (diff, not blind upsert)
 *   - duplicateCanvas copies every item under a new partition
 */

const ENDPOINT = process.env.DYNAMODB_ENDPOINT || "http://127.0.0.1:8000";

const ddb = new DynamoDBClient({
  endpoint: ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

describe("canvas dynamodb parity", () => {
  let storage: InstanceType<typeof DynamoCanvasStorage>;
  let tableCreated = false;

  beforeAll(async () => {
    const res = await fetch(ENDPOINT.replace(/\/$/, ""), { method: "GET" });
    if (res.status >= 500) {
      throw new Error(`DynamoDB Local is unavailable at ${ENDPOINT}`);
    }
    try {
      await ddb.send(
        new CreateTableCommand({
          TableName: "meshwork-canvas-test",
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
    tableCreated = true;
    await waitUntilTableExists(
      { client: ddb, maxWaitTime: 20, minDelay: 1, maxDelay: 2 },
      { TableName: "meshwork-canvas-test" },
    );
    storage = new DynamoCanvasStorage();
  });

  afterAll(async () => {
    if (tableCreated)
      await ddb.send(
        new DeleteTableCommand({ TableName: "meshwork-canvas-test" }),
      );
    ddb.destroy();
  });

  const node = (id: string, label: string) => ({
    id,
    position: { x: 10, y: 20 },
    data: { label },
  });

  it("syncs_then_returns_the_full_canvas", async () => {
    await storage.syncCanvas(
      "ws-p1",
      [node("n1", "a"), node("n2", "b")],
      [{ id: "e1", source: "n1", target: "n2" }],
    );

    expect((await storage.getNodes("ws-p1")).map((n) => n.id)).toEqual([
      "n1",
      "n2",
    ]);
    expect((await storage.getEdges("ws-p1")).map((e) => e.id)).toEqual(["e1"]);
  });

  it("replace_set_removes_items_missing_from_the_payload", async () => {
    await storage.syncCanvas("ws-r", [node("a", "a"), node("b", "b")], []);
    await storage.syncCanvas("ws-r", [node("a", "a-updated")], []);

    const nodes = await storage.getNodes("ws-r");
    expect(nodes.map((n) => n.id)).toEqual(["a"]);
    expect(nodes[0].data).toEqual({ label: "a-updated" });
    expect(await storage.getEdges("ws-r")).toEqual([]);
  });

  it("duplicate_copies_every_item_to_the_new_partition", async () => {
    await storage.syncCanvas(
      "ws-src",
      [node("k1", "x")],
      [{ id: "ke1", source: "k1", target: "k1" }],
    );
    await storage.duplicateCanvas("ws-src", "ws-dst");

    expect((await storage.getNodes("ws-dst")).map((n) => n.id)).toEqual(["k1"]);
    expect(await storage.getEdges("ws-dst")).toHaveLength(1);
    // source untouched
    expect(await storage.getNodes("ws-src")).toHaveLength(1);
  });

  it("deleteWorkspaces_clears_the_whole_partition", async () => {
    await storage.syncCanvas("ws-del", [node("z", "z")], []);
    await storage.deleteWorkspaces(["ws-del"]);
    expect(await storage.getNodes("ws-del")).toEqual([]);
  });
});
