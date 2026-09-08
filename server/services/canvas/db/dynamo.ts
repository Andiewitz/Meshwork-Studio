// DynamoDB persistence for canvas documents — the ONLY storage path.
//
// Design (single table, on-demand billing):
//   pk = ws#{workspaceId}          (partition = one canvas)
//   sk = node#{nodeId} | edge#{edgeId}
//
// syncCanvas is a diff: existing keys are queried, removed nodes/edges are
// deleted, changed items are re-put, untouched items are skipped. This keeps
// consumed capacity proportional to the actual edit, matching the previous
// Postgres upsert behavior.

import {
  DynamoDBClient,
  DescribeTableCommand,
  CreateTableCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { CanvasEdge, CanvasNode, ICanvasStorage } from "./model";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("dynamo-canvas");

const TABLE = process.env.CANVAS_DDB_TABLE || "meshwork-canvas";
const ENDPOINT = process.env.DYNAMODB_ENDPOINT; // dynamo-local in dev
const REGION = process.env.AWS_REGION || "us-east-1";

function ddb() {
  const client = new DynamoDBClient({
    endpoint: ENDPOINT,
    region: REGION,
    ...(ENDPOINT
      ? { credentials: { accessKeyId: "local", secretAccessKey: "local" } }
      : {}),
  });
  return { client, doc: DynamoDBDocumentClient.from(client) };
}

let cached: {
  client: DynamoDBClient;
  doc: ReturnType<typeof DynamoDBDocumentClient.from>;
} | null = null;
function clients() {
  cached ??= ddb();
  return cached;
}

export const partitionKey = (workspaceId: string) => `ws#${workspaceId}`;

/** Readiness probe used by tests and the /ready path. */
export async function canvasTableReady(timeoutMs = 1500): Promise<boolean> {
  const { client } = clients();
  try {
    const res = await Promise.race([
      client.send(new DescribeTableCommand({ TableName: TABLE })),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("timeout")), timeoutMs),
      ),
    ]);
    return Boolean((res as { Table?: unknown }).Table);
  } catch (err) {
    if ((err as Error).name === "ResourceNotFoundException") return false;
    throw err;
  }
}

/** Ensure the DynamoDB table exists, auto-creating if missing. */
export async function ensureCanvasTable(): Promise<void> {
  const { client } = clients();
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE }));
    log.info(
      { table: TABLE, region: REGION },
      "DynamoDB canvas table verified",
    );
  } catch (err: any) {
    if (err?.name !== "ResourceNotFoundException") {
      log.warn({ err, table: TABLE }, "DynamoDB describe table warning");
      return;
    }
    log.info(
      { table: TABLE, region: REGION },
      "DynamoDB canvas table missing, creating...",
    );
    try {
      await client.send(
        new CreateTableCommand({
          TableName: TABLE,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "pk", AttributeType: "S" },
            { AttributeName: "sk", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "pk", KeyType: "HASH" },
            { AttributeName: "sk", KeyType: "RANGE" },
          ],
          ...(ENDPOINT ? {} : { SSESpecification: { Enabled: true } }),
        }),
      );
      await waitUntilTableExists(
        { client, maxWaitTime: 30 },
        { TableName: TABLE },
      );
      log.info({ table: TABLE }, "DynamoDB canvas table created successfully");
    } catch (createErr) {
      log.error(
        { err: createErr, table: TABLE },
        "Failed to auto-create DynamoDB canvas table",
      );
    }
  }
}

interface Item {
  pk: string;
  sk: string;
  body: Record<string, unknown>;
}

interface BatchWriteRequest {
  PutRequest?: { Item: Item };
  DeleteRequest?: { Key: Record<string, unknown> };
}

const MAX_BATCH_WRITE_ATTEMPTS = 6;
const BATCH_WRITE_RETRY_BASE_MS = 25;

/** A successful DynamoDB response can still contain writes that were skipped. */
export class CanvasWriteIncompleteError extends Error {
  readonly code = "CANVAS_WRITE_INCOMPLETE";
  readonly retryable = true;

  constructor(
    readonly remainingItems: number,
    readonly attempts: number,
  ) {
    super(
      `DynamoDB did not process ${remainingItems} canvas write${remainingItems === 1 ? "" : "s"} after ${attempts} attempts`,
    );
    this.name = "CanvasWriteIncompleteError";
  }
}

function nodeItem(workspaceId: string, n: CanvasNode): Item {
  const body = { ...n } as Record<string, unknown>;
  const id = n.id;
  delete body.id;
  delete body.workspaceId;
  return {
    pk: partitionKey(workspaceId),
    sk: `node#${id}`,
    body,
  };
}

function edgeItem(workspaceId: string, e: CanvasEdge): Item {
  const body = { ...e } as Record<string, unknown>;
  const id = body.id as string;
  delete body.id;
  delete body.workspaceId;
  return { pk: partitionKey(workspaceId), sk: `edge#${id}`, body };
}

async function queryPartition(
  workspaceId: string,
  prefix?: "node#" | "edge#",
): Promise<Item[]> {
  const { doc } = clients();
  const out: Item[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const expressionAttributeNames: Record<string, string> = { "#pk": "pk" };
    const expressionAttributeValues: Record<string, unknown> = {
      ":pk": partitionKey(workspaceId),
    };
    if (prefix) {
      expressionAttributeNames["#sk"] = "sk";
      expressionAttributeValues[":prefix"] = prefix;
    }
    const res = await doc.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: prefix
          ? "#pk = :pk AND begins_with(#sk, :prefix)"
          : "#pk = :pk",
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of res.Items ?? []) out.push(item as unknown as Item);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return out;
}

async function batchWrite(requests: BatchWriteRequest[]): Promise<void> {
  const { doc } = clients();
  for (let i = 0; i < requests.length; i += 25) {
    let pending = requests.slice(i, i + 25);
    let attempts = 0;

    while (pending.length > 0 && attempts < MAX_BATCH_WRITE_ATTEMPTS) {
      attempts += 1;
      const response = await doc.send(
        new BatchWriteCommand({
          RequestItems: { [TABLE]: pending },
        }),
      );
      pending = (response.UnprocessedItems?.[TABLE] ??
        []) as BatchWriteRequest[];

      if (pending.length > 0 && attempts < MAX_BATCH_WRITE_ATTEMPTS) {
        const cappedDelay = Math.min(
          BATCH_WRITE_RETRY_BASE_MS * 2 ** (attempts - 1),
          1_000,
        );
        const jitter = Math.floor(Math.random() * BATCH_WRITE_RETRY_BASE_MS);
        await new Promise<void>((resolve) =>
          setTimeout(resolve, cappedDelay + jitter),
        );
      }
    }

    if (pending.length > 0) {
      log.error(
        { attempts, remainingItems: pending.length, table: TABLE },
        "Canvas batch write incomplete after retries",
      );
      throw new CanvasWriteIncompleteError(pending.length, attempts);
    }
  }
}

export class DynamoCanvasStorage implements ICanvasStorage {
  async getNodes(workspaceId: string): Promise<CanvasNode[]> {
    const items = await queryPartition(workspaceId, "node#");
    return items.map(
      (raw) =>
        ({ ...raw.body, id: raw.sk.slice("node#".length) }) as CanvasNode,
    );
  }

  async getEdges(workspaceId: string): Promise<CanvasEdge[]> {
    const items = await queryPartition(workspaceId, "edge#");
    return items.map(
      (raw) =>
        ({ ...raw.body, id: raw.sk.slice("edge#".length) }) as CanvasEdge,
    );
  }

  async syncCanvas(
    workspaceId: string,
    nodes: CanvasNode[],
    edges: CanvasEdge[],
  ): Promise<void> {
    const desired = new Map<string, Item>();
    for (const n of nodes)
      desired.set(`node#${n.id}`, nodeItem(workspaceId, n));
    for (const e of edges)
      desired.set(`edge#${e.id}`, edgeItem(workspaceId, e));

    const existing = await queryPartition(workspaceId);
    const existingByKey = new Map(existing.map((i) => [i.sk, i]));

    const requests: BatchWriteRequest[] = [];

    // deletions: existed but no longer desired
    for (const [sk] of existingByKey) {
      if (!desired.has(sk)) {
        requests.push({
          DeleteRequest: { Key: { pk: partitionKey(workspaceId), sk } },
        });
      }
    }

    // puts: new or materially changed
    for (const [sk, item] of desired) {
      const prev = existingByKey.get(sk);
      if (prev && JSON.stringify(prev.body) === JSON.stringify(item.body)) {
        continue; // unchanged — skip write
      }
      requests.push({ PutRequest: { Item: item } });
    }

    if (requests.length > 0) await batchWrite(requests);
  }

  async duplicateCanvas(
    fromWorkspaceId: string,
    toWorkspaceId: string,
  ): Promise<void> {
    const source = await queryPartition(fromWorkspaceId);
    const requests = source.map((item) => ({
      PutRequest: {
        Item: { ...item, pk: partitionKey(toWorkspaceId) },
      },
    }));
    if (requests.length > 0) await batchWrite(requests);
  }

  /** Bulk cleanup keyed by explicit workspace ids (ownership resolved by the
   *  caller via the workspace service). */
  async deleteWorkspaces(workspaceIds: string[]): Promise<void> {
    for (const id of workspaceIds) {
      const existing = await queryPartition(id);
      const requests = existing.map((item) => ({
        DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
      }));
      if (requests.length > 0) await batchWrite(requests);
    }
  }
}
