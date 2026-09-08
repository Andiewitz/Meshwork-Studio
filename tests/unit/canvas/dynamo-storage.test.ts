import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  documentFrom: vi.fn(),
}));

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
}));

import {
  CanvasRevisionConflictError,
  CanvasWriteIncompleteError,
  DynamoCanvasStorage,
} from "@services/canvas/db/dynamo";
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

describe("DynamoCanvasStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.documentFrom.mockReturnValue({ send: mocks.send });
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof QueryCommand) return { Items: [] };
      if (command instanceof GetCommand) return {};
      return {};
    });
  });

  it("follows LastEvaluatedKey until every node page is read", async () => {
    mocks.send
      .mockResolvedValueOnce({
        Items: [
          {
            pk: "ws#canvas-1",
            sk: "node#first",
            body: { position: { x: 0, y: 0 }, data: { label: "First" } },
          },
        ],
        LastEvaluatedKey: { pk: "ws#canvas-1", sk: "node#first" },
      })
      .mockResolvedValueOnce({
        Items: [
          {
            pk: "ws#canvas-1",
            sk: "node#second",
            body: { position: { x: 1, y: 1 }, data: { label: "Second" } },
          },
        ],
      });

    const nodes = await new DynamoCanvasStorage().getNodes("canvas-1");

    expect(nodes.map((node) => node.id)).toEqual(["first", "second"]);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1][0]).toBeInstanceOf(QueryCommand);
    expect(mocks.send.mock.calls[1][0].input).toMatchObject({
      ExclusiveStartKey: { pk: "ws#canvas-1", sk: "node#first" },
    });
  });

  it("retries only DynamoDB writes returned as unprocessed", async () => {
    const unprocessed = {
      PutRequest: {
        Item: {
          pk: "ws#canvas-2",
          sk: "node#n1",
          body: { position: { x: 0, y: 0 }, data: { label: "N1" } },
        },
      },
    };
    let writeAttempts = 0;
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof QueryCommand) return { Items: [] };
      if (command instanceof GetCommand) return {};
      if (command instanceof BatchWriteCommand) {
        writeAttempts += 1;
        return writeAttempts === 1
          ? { UnprocessedItems: { "meshwork-canvas": [unprocessed] } }
          : { UnprocessedItems: {} };
      }
      return {};
    });

    await new DynamoCanvasStorage().syncCanvas(
      "canvas-2",
      [
        {
          id: "n1",
          position: { x: 0, y: 0 },
          data: { label: "N1" },
        },
      ],
      [],
    );

    const batchCalls = mocks.send.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof BatchWriteCommand);
    expect(batchCalls).toHaveLength(2);
    expect(batchCalls[1].input).toMatchObject({
      RequestItems: { "meshwork-canvas": [unprocessed] },
    });
  });

  it("fails instead of acknowledging exhausted unprocessed writes", async () => {
    const unprocessed = {
      PutRequest: {
        Item: {
          pk: "ws#canvas-3",
          sk: "node#n1",
          body: { position: { x: 0, y: 0 }, data: { label: "N1" } },
        },
      },
    };
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof QueryCommand) return { Items: [] };
      if (command instanceof GetCommand) return {};
      if (command instanceof BatchWriteCommand)
        return { UnprocessedItems: { "meshwork-canvas": [unprocessed] } };
      return { UnprocessedItems: { "meshwork-canvas": [unprocessed] } };
    });

    await expect(
      new DynamoCanvasStorage().syncCanvas(
        "canvas-3",
        [
          {
            id: "n1",
            position: { x: 0, y: 0 },
            data: { label: "N1" },
          },
        ],
        [],
      ),
    ).rejects.toEqual(expect.any(CanvasWriteIncompleteError));
  });

  it("rejects a stale revision before it changes canvas items", async () => {
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof GetCommand) return { Item: { revision: 2 } };
      if (command instanceof QueryCommand)
        throw new Error("stale writes must not query canvas items");
      return {};
    });

    await expect(
      new DynamoCanvasStorage().syncCanvas("canvas-4", [], [], 1),
    ).rejects.toEqual(expect.any(CanvasRevisionConflictError));

    const commands = mocks.send.mock.calls.map(([command]) => command);
    expect(
      commands.some((command) => command instanceof BatchWriteCommand),
    ).toBe(false);
    expect(commands.some((command) => command instanceof PutCommand)).toBe(
      true,
    );
    expect(commands.some((command) => command instanceof DeleteCommand)).toBe(
      true,
    );
  });
});
