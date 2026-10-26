import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { AtomicCanvasStorage } from "@services/canvas/db/snapshots";
import {
  CanvasDeletedError,
  CanvasRevisionConflictError,
} from "@services/canvas/db/errors";

const table = `canvas-consistency-${randomUUID()}`;
const client = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_ENDPOINT || "http://127.0.0.1:8000",
  region: "us-east-1",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
const doc = DynamoDBDocumentClient.from(client);
const store = new AtomicCanvasStorage(doc, table);
let created = false;
const node = (id: string) => ({
  id,
  position: { x: 0, y: 0 },
  data: { label: id },
});
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("Canvas snapshot consistency against DynamoDB", () => {
  beforeAll(async () => {
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
    created = true;
    await waitUntilTableExists(
      { client, maxWaitTime: 20, minDelay: 1, maxDelay: 2 },
      { TableName: table },
    );
  });
  afterAll(async () => {
    if (created)
      await client.send(new DeleteTableCommand({ TableName: table }));
    client.destroy();
  });

  it("keeps a compressed overflow snapshot intact across DynamoDB pages", async () => {
    const large = {
      ...node("large"),
      data: { label: randomBytes(1_200_000).toString("base64") },
    };
    await store.syncCanvas(
      "overflow",
      [large],
      [{ id: "edge", source: "large", target: "large" }],
      0,
    );
    expect(await store.getCanvas("overflow")).toEqual({
      nodes: [large],
      edges: [{ id: "edge", source: "large", target: "large" }],
      revision: 1,
    });
  });

  it("allows only one publication when two writers share the same revision", async () => {
    await store.syncCanvas("race", [node("old")], [], 0);
    const results = await Promise.allSettled([
      store.syncCanvas("race", [node("a")], [], 1),
      store.syncCanvas("race", [node("b")], [], 1),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const loser = results.find((result) => result.status === "rejected");
    expect(
      loser?.status === "rejected" &&
        loser.reason instanceof CanvasRevisionConflictError,
    ).toBe(true);
    const snapshot = await store.getCanvas("race");
    expect(snapshot.revision).toBe(2);
    expect(["a", "b"]).toContain(snapshot.nodes[0].id);
  });

  it("pins the copy intent across a failure and source edit; replay preserves later destination edits", async () => {
    await store.syncCanvas("source", [node("pinned")], [], 0);
    let fail = true;
    const interrupted = new AtomicCanvasStorage(
      {
        send: (async (command: any) => {
          if (
            fail &&
            command instanceof TransactWriteCommand &&
            command.input.TransactItems?.some(
              (operation: any) => operation.Update,
            )
          )
            throw new Error("injected copy interruption");
          return doc.send(command);
        }) as typeof doc.send,
      },
      table,
    );
    await expect(
      interrupted.duplicateCanvas("source", "target", "copy-op"),
    ).rejects.toThrow("injected");
    await store.syncCanvas("source", [node("changed")], [], 1);
    fail = false;
    await interrupted.duplicateCanvas("source", "target", "copy-op");
    expect((await store.getCanvas("target")).nodes).toEqual([node("pinned")]);
    await store.syncCanvas("target", [node("edited")], [], 1);
    await store.duplicateCanvas("source", "target", "copy-op");
    expect((await store.getCanvas("target")).nodes).toEqual([node("edited")]);
  });

  it.each([false, true])(
    "rejects paused save after deletion (overflow=%s)",
    async (overflow) => {
      const id = `delete-race-${overflow}`;
      await store.syncCanvas(id, [node("old")], [], 0);
      const entered = gate(),
        resume = gate();
      let paused = false;
      const delayed = new AtomicCanvasStorage(
        {
          send: (async (command: any) => {
            const stage =
              command instanceof TransactWriteCommand &&
              command.input.TransactItems?.some(
                (operation: any) => operation.Put?.Item?.chunk,
              );
            const publish =
              command instanceof PutCommand && command.input.Item?.sk === "doc";
            if (!paused && (overflow ? stage : publish)) {
              paused = true;
              entered.release();
              await resume.promise;
            }
            return doc.send(command);
          }) as typeof doc.send,
        },
        table,
      );
      const updated = overflow
        ? {
            ...node("large"),
            data: { label: randomBytes(340_000).toString("base64") },
          }
        : node("late");
      const write = delayed.syncCanvas(id, [updated], [], 1);
      const rejected = expect(write).rejects.toBeInstanceOf(CanvasDeletedError);
      await entered.promise;
      await store.deleteWorkspaces([id]);
      resume.release();
      await rejected;
      expect(await store.getCanvas(id)).toEqual({
        nodes: [],
        edges: [],
        revision: 0,
      });
      await expect(
        store.syncCanvas(id, [node("resurrect")], [], 0),
      ).rejects.toBeInstanceOf(CanvasDeletedError);
    },
  );

  it("a staged overflow publication failure leaves the old snapshot readable", async () => {
    await store.syncCanvas("failed-publication", [node("old")], [], 0);
    const failing = new AtomicCanvasStorage(
      {
        send: (async (command: any) => {
          if (command instanceof PutCommand)
            throw new Error("injected publication failure");
          return doc.send(command);
        }) as typeof doc.send,
      },
      table,
    );
    await expect(
      failing.syncCanvas(
        "failed-publication",
        [
          {
            ...node("large"),
            data: { label: randomBytes(340_000).toString("base64") },
          },
        ],
        [],
        1,
      ),
    ).rejects.toThrow("injected");
    expect(await store.getCanvas("failed-publication")).toEqual({
      nodes: [node("old")],
      edges: [],
      revision: 1,
    });
  });
});
