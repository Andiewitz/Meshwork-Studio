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
  QueryCommand: class QueryCommand {
    constructor(readonly input: Record<string, unknown>) {}
  },
}));

import {
  CanvasWriteIncompleteError,
  DynamoCanvasStorage,
} from "@services/canvas/db/dynamo";
import { BatchWriteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

describe("DynamoCanvasStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.documentFrom.mockReturnValue({ send: mocks.send });
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
    mocks.send
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({
        UnprocessedItems: { "meshwork-canvas": [unprocessed] },
      })
      .mockResolvedValueOnce({ UnprocessedItems: {} });

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

    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(mocks.send.mock.calls[1][0]).toBeInstanceOf(BatchWriteCommand);
    expect(mocks.send.mock.calls[2][0].input).toMatchObject({
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
});
