import { beforeEach, describe, expect, it, vi } from "vitest";
import { gunzipSync, gzipSync } from "node:zlib";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  documentFrom: vi.fn(),
  s3send: vi.fn(),
}));

vi.hoisted(() => {
  process.env.CANVAS_DOC_MODEL = "on";
  process.env.CANVAS_S3_BUCKET = "test-bucket";
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class DynamoDBClient {},
  DescribeTableCommand: class DescribeTableCommand {},
  CreateTableCommand: class CreateTableCommand {},
  waitUntilTableExists: vi.fn(),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: mocks.documentFrom,
  },
  BatchWriteCommand: class BatchWriteCommand {
    constructor(readonly input: Record<string, unknown>) {}
  },
  DeleteCommand: class DeleteCommand {
    constructor(readonly input: Record<string, unknown>) {}
  },
  GetCommand: class GetCommand {
    constructor(readonly input: Record<string, unknown>) {}
  },
  PutCommand: class PutCommand {
    constructor(readonly input: Record<string, unknown>) {}
  },
  QueryCommand: class QueryCommand {
    constructor(readonly input: Record<string, unknown>) {}
  },
  ScanCommand: class ScanCommand {
    constructor(readonly input: Record<string, unknown>) {}
  },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class S3Client {
    send = mocks.s3send;
  },
  GetObjectCommand: class GetObjectCommand {
    constructor(readonly input: Record<string, unknown>) {}
  },
  PutObjectCommand: class PutObjectCommand {
    constructor(readonly input: Record<string, unknown>) {}
  },
  DeleteObjectCommand: class DeleteObjectCommand {
    constructor(readonly input: Record<string, unknown>) {}
  },
}));

import {
  CanvasRevisionConflictError,
  DynamoCanvasStorage,
} from "@services/canvas/db/dynamo";
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const node = (id: string, label = id) => ({
  id,
  position: { x: 0, y: 0 },
  data: { label },
});

const encoded = (nodes: unknown[], edges: unknown[] = []) =>
  gzipSync(Buffer.from(JSON.stringify({ nodes, edges }), "utf8"));

const docItem = (
  revision: number,
  nodes: unknown[],
  edges: unknown[] = [],
) => ({
  pk: "ws#canvas-doc",
  sk: "doc",
  revision,
  bytes: 10,
  body: encoded(nodes, edges),
});

const commands = () => mocks.send.mock.calls.map(([command]) => command);

describe("DynamoCanvasStorage document model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.documentFrom.mockReturnValue({ send: mocks.send });
    mocks.send.mockResolvedValue({});
    mocks.s3send.mockResolvedValue({});
    process.env.CANVAS_DOC_MODEL = "on";
    process.env.CANVAS_DOC_INLINE_MAX_BYTES = "1024";
    process.env.CANVAS_S3_BUCKET = "test-bucket";
    delete process.env.CANVAS_S3_PREFIX;
  });

  it("writes a small canvas as one conditional document item", async () => {
    const storage = new DynamoCanvasStorage();
    const nodes = [node("n1")];

    await expect(storage.syncCanvas("canvas-doc", nodes, [], 0)).resolves.toBe(
      1,
    );

    const put = commands().find(
      (command): command is PutCommand => command instanceof PutCommand,
    );
    const putItem = put?.input.Item as Record<string, unknown> | undefined;
    expect(put?.input).toMatchObject({
      TableName: "meshwork-canvas",
      ConditionExpression: "attribute_not_exists(#pk)",
    });
    expect(putItem).toMatchObject({
      pk: "ws#canvas-doc",
      sk: "doc",
      revision: 1,
    });
    expect(putItem?.s3Key).toBeUndefined();
    expect(
      JSON.parse(gunzipSync(putItem?.body as Buffer).toString("utf8")),
    ).toEqual({ nodes, edges: [] });
    expect(mocks.s3send).not.toHaveBeenCalled();
  });

  it("uses the current revision when expectedRevision is omitted", async () => {
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof GetCommand) {
        return { Item: docItem(4, [node("n1")]) };
      }
      return {};
    });

    await expect(
      new DynamoCanvasStorage().syncCanvas("canvas-doc", [node("n2")], []),
    ).resolves.toBe(5);

    const put = commands().find(
      (command): command is PutCommand => command instanceof PutCommand,
    );
    expect(put?.input).toMatchObject({
      ConditionExpression: "#revision = :base",
      ExpressionAttributeValues: { ":base": 4 },
    });
  });

  it("rejects a stale revision before writing", async () => {
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof GetCommand) {
        return { Item: docItem(3, [node("n1")]) };
      }
      return {};
    });

    await expect(
      new DynamoCanvasStorage().syncCanvas("canvas-doc", [node("n1")], [], 2),
    ).rejects.toEqual(expect.any(CanvasRevisionConflictError));
    expect(commands().some((command) => command instanceof PutCommand)).toBe(
      false,
    );
  });

  it("stores and reads large canvases through S3", async () => {
    process.env.CANVAS_DOC_INLINE_MAX_BYTES = "16";
    const nodes = [node("n1")];
    mocks.s3send.mockResolvedValue({ ETag: '"etag-1"' });

    await expect(
      new DynamoCanvasStorage().syncCanvas("canvas-doc", nodes, [], 0),
    ).resolves.toBe(1);

    const putObject = mocks.s3send.mock.calls
      .map(([command]) => command)
      .find(
        (command): command is PutObjectCommand =>
          command instanceof PutObjectCommand,
      );
    expect(putObject?.input).toMatchObject({
      Bucket: "test-bucket",
      ContentEncoding: "gzip",
    });
    const s3Key = putObject?.input.Key;
    expect(s3Key).toMatch(/^canvases\/canvas-doc\/1-[0-9a-f-]+\.json\.gz$/);

    const put = commands().find(
      (command): command is PutCommand => command instanceof PutCommand,
    );
    const putItem = put?.input.Item as Record<string, unknown> | undefined;
    expect(putItem).toMatchObject({
      revision: 1,
      s3Key,
      etag: '"etag-1"',
    });
    expect(putItem?.body).toBeUndefined();

    mocks.send.mockReset();
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof GetCommand) {
        return {
          Item: {
            pk: "ws#canvas-doc",
            sk: "doc",
            revision: 1,
            s3Key: "canvases/canvas-doc/1.json.gz",
          },
        };
      }
      return {};
    });
    mocks.s3send.mockReset();
    mocks.s3send.mockResolvedValue({
      Body: {
        transformToByteArray: async () => encoded(nodes),
      },
    });

    const snapshot = await new DynamoCanvasStorage().getCanvas("canvas-doc");
    expect(snapshot).toEqual({ nodes, edges: [], revision: 1 });
    const getObject = mocks.s3send.mock.calls
      .map(([command]) => command)
      .find(
        (command): command is GetObjectCommand =>
          command instanceof GetObjectCommand,
      );
    expect(getObject?.input).toMatchObject({
      Bucket: "test-bucket",
      Key: "canvases/canvas-doc/1.json.gz",
    });
  });

  it("falls back to the legacy partition when the document is absent", async () => {
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof GetCommand) return {};
      if (command instanceof QueryCommand) {
        return {
          Items: [
            {
              pk: "ws#canvas-doc",
              sk: "node#old",
              body: { position: { x: 0, y: 0 }, data: { label: "old" } },
            },
            { pk: "ws#canvas-doc", sk: "meta", revision: 6 },
          ],
        };
      }
      return {};
    });

    const snapshot = await new DynamoCanvasStorage().getCanvas("canvas-doc");
    expect(snapshot.revision).toBe(6);
    expect(snapshot.nodes.map((n) => n.id)).toEqual(["old"]);
    expect(commands().some((command) => command instanceof QueryCommand)).toBe(
      true,
    );
  });

  it("read mode prefers the document only when it is not behind legacy", async () => {
    process.env.CANVAS_DOC_MODEL = "read";
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof GetCommand) {
        const key = command.input.Key as { sk?: string } | undefined;
        if (key?.sk === "doc") {
          return { Item: docItem(2, [node("from-doc")]) };
        }
        return { Item: { revision: 3 } };
      }
      if (command instanceof QueryCommand) {
        return {
          Items: [
            {
              pk: "ws#canvas-doc",
              sk: "node#from-legacy",
              body: { position: { x: 0, y: 0 }, data: { label: "legacy" } },
            },
            { pk: "ws#canvas-doc", sk: "meta", revision: 3 },
          ],
        };
      }
      return {};
    });

    const snapshot = await new DynamoCanvasStorage().getCanvas("canvas-doc");
    expect(snapshot.revision).toBe(3);
    expect(snapshot.nodes.map((n) => n.id)).toEqual(["from-legacy"]);
  });

  it("read mode keeps writing the legacy item model", async () => {
    process.env.CANVAS_DOC_MODEL = "read";
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof GetCommand) return { Item: { revision: 1 } };
      if (command instanceof QueryCommand) return { Items: [] };
      return {};
    });

    await expect(
      new DynamoCanvasStorage().syncCanvas("canvas-doc", [node("n1")], [], 1),
    ).resolves.toBe(2);

    const putItems = commands()
      .filter((command): command is PutCommand => command instanceof PutCommand)
      .map(
        (command) => command.input.Item as Record<string, unknown> | undefined,
      );
    expect(putItems.some((item) => item?.sk === "doc")).toBe(false);
    const batch = commands().find(
      (command): command is BatchWriteCommand =>
        command instanceof BatchWriteCommand,
    );
    expect(batch?.input.RequestItems?.["meshwork-canvas"]).toEqual(
      expect.arrayContaining([
        {
          PutRequest: {
            Item: expect.objectContaining({ sk: "node#n1" }),
          },
        },
      ]),
    );
    expect(
      commands().some((command) => command instanceof BatchWriteCommand),
    ).toBe(true);
  });

  it("backfills a legacy canvas at its current revision", async () => {
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof GetCommand) return {};
      if (command instanceof QueryCommand) {
        return {
          Items: [
            {
              pk: "ws#canvas-doc",
              sk: "node#old",
              body: { position: { x: 0, y: 0 }, data: { label: "old" } },
            },
            { pk: "ws#canvas-doc", sk: "meta", revision: 7 },
          ],
        };
      }
      return {};
    });

    await expect(
      new DynamoCanvasStorage().backfillCanvas("canvas-doc"),
    ).resolves.toBe("created");

    const put = commands().find(
      (command): command is PutCommand => command instanceof PutCommand,
    );
    const putItem = put?.input.Item as Record<string, unknown> | undefined;
    expect(putItem).toMatchObject({
      sk: "doc",
      revision: 7,
    });
    expect(put?.input.ConditionExpression).toBe("attribute_not_exists(#pk)");
  });

  it("reconciles a document that is behind the legacy revision", async () => {
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof GetCommand) {
        return { Item: docItem(4, [node("stale")]) };
      }
      if (command instanceof QueryCommand) {
        return {
          Items: [
            {
              pk: "ws#canvas-doc",
              sk: "node#fresh",
              body: { position: { x: 0, y: 0 }, data: { label: "fresh" } },
            },
            { pk: "ws#canvas-doc", sk: "meta", revision: 7 },
          ],
        };
      }
      return {};
    });

    await expect(
      new DynamoCanvasStorage().backfillCanvas("canvas-doc"),
    ).resolves.toBe("updated");

    const put = commands().find(
      (command): command is PutCommand => command instanceof PutCommand,
    );
    const putItem = put?.input.Item as Record<string, unknown> | undefined;
    expect(putItem).toMatchObject({
      sk: "doc",
      revision: 7,
    });
    expect(put?.input).toMatchObject({
      ConditionExpression: "#revision = :base",
      ExpressionAttributeValues: { ":base": 4 },
    });
  });

  it("restores the legacy item model from a newer document", async () => {
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof GetCommand) {
        const key = command.input.Key as { sk?: string } | undefined;
        if (key?.sk === "doc") {
          return { Item: docItem(5, [node("fresh")]) };
        }
        return { Item: { revision: 2 } };
      }
      if (command instanceof QueryCommand) return { Items: [] };
      return {};
    });

    await expect(
      new DynamoCanvasStorage().restoreLegacyFromDoc("canvas-doc"),
    ).resolves.toBe("restored");

    const batch = commands().find(
      (command): command is BatchWriteCommand =>
        command instanceof BatchWriteCommand,
    );
    expect(batch?.input.RequestItems?.["meshwork-canvas"]).toEqual(
      expect.arrayContaining([
        {
          PutRequest: {
            Item: expect.objectContaining({ sk: "node#fresh" }),
          },
        },
      ]),
    );

    const metaPuts = commands()
      .filter((command): command is PutCommand => command instanceof PutCommand)
      .map(
        (command) => command.input.Item as Record<string, unknown> | undefined,
      )
      .filter((item) => item?.sk === "meta");
    expect(metaPuts.at(-1)).toMatchObject({ revision: 5 });
  });

  it("turns a lost CAS race into a revision conflict", async () => {
    let getCalls = 0;
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof GetCommand) {
        getCalls += 1;
        return {
          Item: docItem(getCalls === 1 ? 1 : 2, [node("n1")]),
        };
      }
      if (command instanceof PutCommand) {
        throw Object.assign(new Error("conditional"), {
          name: "ConditionalCheckFailedException",
        });
      }
      return {};
    });

    await expect(
      new DynamoCanvasStorage().syncCanvas("canvas-doc", [node("n2")], [], 1),
    ).rejects.toEqual(new CanvasRevisionConflictError(1, 2));
  });

  it("deletes only its own S3 object when the CAS loses", async () => {
    process.env.CANVAS_DOC_INLINE_MAX_BYTES = "16";
    let getCalls = 0;
    mocks.s3send.mockResolvedValue({ ETag: '"etag-2"' });
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof GetCommand) {
        getCalls += 1;
        return {
          Item:
            getCalls === 1
              ? docItem(1, [node("n1")])
              : {
                  pk: "ws#canvas-doc",
                  sk: "doc",
                  revision: 2,
                  s3Key: "canvases/canvas-doc/2-other.json.gz",
                },
        };
      }
      if (command instanceof PutCommand) {
        throw Object.assign(new Error("conditional"), {
          name: "ConditionalCheckFailedException",
        });
      }
      return {};
    });

    await expect(
      new DynamoCanvasStorage().syncCanvas("canvas-doc", [node("n2")], [], 1),
    ).rejects.toEqual(new CanvasRevisionConflictError(1, 2));

    const s3Commands = mocks.s3send.mock.calls.map(([command]) => command);
    const putObject = s3Commands.find(
      (command): command is PutObjectCommand =>
        command instanceof PutObjectCommand,
    );
    const deletes = s3Commands.filter(
      (command): command is DeleteObjectCommand =>
        command instanceof DeleteObjectCommand,
    );
    expect(putObject?.input.Key).toMatch(
      /^canvases\/canvas-doc\/2-[0-9a-f-]+\.json\.gz$/,
    );
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.input.Key).toBe(putObject?.input.Key);
  });

  it("deletes the S3 object when removing a document workspace", async () => {
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof QueryCommand) {
        return {
          Items: [
            {
              pk: "ws#canvas-doc",
              sk: "doc",
              revision: 2,
              s3Key: "canvases/canvas-doc/2.json.gz",
            },
          ],
        };
      }
      return {};
    });

    await new DynamoCanvasStorage().deleteWorkspaces(["canvas-doc"]);

    expect(
      mocks.s3send.mock.calls
        .map(([command]) => command)
        .some((command) => command instanceof DeleteObjectCommand),
    ).toBe(true);
    expect(
      commands().some((command) => command instanceof BatchWriteCommand),
    ).toBe(true);
    expect(commands().some((command) => command instanceof DeleteCommand)).toBe(
      false,
    );
  });
});
