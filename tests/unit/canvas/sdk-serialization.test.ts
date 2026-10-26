import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { AtomicCanvasStorage } from "@services/canvas/db/snapshots";

describe("Canvas AWS SDK serialization", () => {
  it("marshals binary snapshots and copy transactions through the real SDK without network calls", async () => {
    const requests: { target: string; body: any }[] = [];
    const client = new DynamoDBClient({
      endpoint: "http://127.0.0.1:1",
      region: "us-east-1",
      maxAttempts: 1,
      credentials: { accessKeyId: "local", secretAccessKey: "local" },
      requestHandler: {
        handle: async (request: any) => {
          requests.push({
            target: request.headers["x-amz-target"],
            body: JSON.parse(String(request.body)),
          });
          return {
            response: {
              statusCode: 200,
              headers: { "content-type": "application/x-amz-json-1.0" },
              body: Buffer.from("{}"),
            },
          };
        },
      },
    });
    try {
      const store = new AtomicCanvasStorage(
        DynamoDBDocumentClient.from(client),
        "serialization-test",
      );
      await store.syncCanvas(
        "ws",
        [{ id: "a", position: { x: 0, y: 0 }, data: { label: "hello" } }],
        [],
        0,
      );
      await store.duplicateCanvas("source", "target", "operation-id");
      const publication = requests.find((request) =>
        request.target.endsWith(".PutItem"),
      )!.body;
      const compressed = Buffer.from(
        publication.Item.pointer.M.compressed.B,
        "base64",
      );
      expect(JSON.parse(gunzipSync(compressed).toString("utf8"))).toEqual({
        nodes: [
          { id: "a", position: { x: 0, y: 0 }, data: { label: "hello" } },
        ],
        edges: [],
      });
      expect(publication.ExpressionAttributeNames).toEqual({ "#pk": "pk" });
      expect(publication.ExpressionAttributeValues).toBeUndefined();
      const transactions = requests.filter((request) =>
        request.target.endsWith(".TransactWriteItems"),
      );
      expect(transactions).toHaveLength(2);
      expect(
        transactions[0].body.TransactItems[2].Put.Item.expectedToken,
      ).toEqual({ NULL: true });
      expect(
        transactions[1].body.TransactItems[1].Update.UpdateExpression,
      ).toBe("SET #status = :done REMOVE #pointer");
    } finally {
      client.destroy();
    }
  });
});
