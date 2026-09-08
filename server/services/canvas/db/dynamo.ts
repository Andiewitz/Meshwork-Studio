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
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
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
const REVISION_KEY = "meta";
const LOCK_KEY = "meta#lock";
const LOCK_TTL_SECONDS = 120;

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

/** The submitted canvas was based on an older, already-committed revision. */
export class CanvasRevisionConflictError extends Error {
  readonly code = "CANVAS_REVISION_CONFLICT";

  constructor(
    readonly expectedRevision: number,
    readonly currentRevision: number,
  ) {
    super(
      `Canvas revision ${expectedRevision} is stale; current revision is ${currentRevision}`,
    );
    this.name = "CanvasRevisionConflictError";
  }
}

/** A different request is currently applying a canvas snapshot. */
export class CanvasWriteLockedError extends Error {
  readonly code = "CANVAS_WRITE_IN_PROGRESS";
  readonly retryable = true;

  constructor() {
    super("Another canvas save is in progress");
    this.name = "CanvasWriteLockedError";
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
        ConsistentRead: true,
      }),
    );
    for (const item of res.Items ?? []) out.push(item as unknown as Item);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return out;
}

function isCanvasItem(item: Item): boolean {
  return item.sk.startsWith("node#") || item.sk.startsWith("edge#");
}

async function getCanvasRevision(workspaceId: string): Promise<number> {
  const { doc } = clients();
  const response = await doc.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: partitionKey(workspaceId), sk: REVISION_KEY },
      ConsistentRead: true,
    }),
  );
  const revision = response.Item?.revision;
  return typeof revision === "number" && revision >= 0 ? revision : 0;
}

async function acquireCanvasLock(workspaceId: string): Promise<string> {
  const { doc } = clients();
  const owner = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  try {
    await doc.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          pk: partitionKey(workspaceId),
          sk: LOCK_KEY,
          owner,
          expiresAt: now + LOCK_TTL_SECONDS,
        },
        ConditionExpression: "attribute_not_exists(#pk) OR #expiresAt < :now",
        ExpressionAttributeNames: { "#pk": "pk", "#expiresAt": "expiresAt" },
        ExpressionAttributeValues: { ":now": now },
      }),
    );
    return owner;
  } catch (err) {
    if ((err as Error).name === "ConditionalCheckFailedException") {
      throw new CanvasWriteLockedError();
    }
    throw err;
  }
}

async function releaseCanvasLock(
  workspaceId: string,
  owner: string,
): Promise<void> {
  const { doc } = clients();
  try {
    await doc.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { pk: partitionKey(workspaceId), sk: LOCK_KEY },
        ConditionExpression: "#owner = :owner",
        ExpressionAttributeNames: { "#owner": "owner" },
        ExpressionAttributeValues: { ":owner": owner },
      }),
    );
  } catch (err) {
    // A timed-out lock may have been replaced; never delete its replacement.
    log.warn({ err, workspaceId }, "Failed to release canvas write lock");
  }
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

  async getCanvasRevision(workspaceId: string): Promise<number> {
    return getCanvasRevision(workspaceId);
  }

  async syncCanvas(
    workspaceId: string,
    nodes: CanvasNode[],
    edges: CanvasEdge[],
    expectedRevision?: number,
  ): Promise<number> {
    const lockOwner = await acquireCanvasLock(workspaceId);
    try {
      const currentRevision = await getCanvasRevision(workspaceId);
      // The optional value maintains safe compatibility for internal callers;
      // the public API always supplies the revision returned by GET /canvas.
      const revisionToWrite = expectedRevision ?? currentRevision;
      if (revisionToWrite !== currentRevision) {
        throw new CanvasRevisionConflictError(revisionToWrite, currentRevision);
      }

      const desired = new Map<string, Item>();
      for (const n of nodes)
        desired.set(`node#${n.id}`, nodeItem(workspaceId, n));
      for (const e of edges)
        desired.set(`edge#${e.id}`, edgeItem(workspaceId, e));

      const existing = (await queryPartition(workspaceId)).filter(isCanvasItem);
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

      const nextRevision = currentRevision + 1;
      const { doc } = clients();
      await doc.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            pk: partitionKey(workspaceId),
            sk: REVISION_KEY,
            revision: nextRevision,
          },
          ConditionExpression:
            "attribute_not_exists(#revision) OR #revision = :expectedRevision",
          ExpressionAttributeNames: { "#revision": "revision" },
          ExpressionAttributeValues: { ":expectedRevision": currentRevision },
        }),
      );
      return nextRevision;
    } finally {
      await releaseCanvasLock(workspaceId, lockOwner);
    }
  }

  async duplicateCanvas(
    fromWorkspaceId: string,
    toWorkspaceId: string,
  ): Promise<void> {
    const source = (await queryPartition(fromWorkspaceId)).filter(isCanvasItem);
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
