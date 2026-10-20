// DynamoDB persistence for canvas documents.
//
// Legacy mode (default): one item per node/edge under pk = ws#{workspaceId}.
// Document mode: one doc item per workspace, with an S3 object above the
// inline threshold. CANVAS_DOC_MODEL selects off | read | on.
//
// syncCanvas is a diff in legacy mode: existing keys are queried, removed
// nodes/edges are deleted, changed items are re-put, untouched items are
// skipped. Document mode replaces the whole document with one CAS write.

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
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { gzipSync, gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import type {
  CanvasEdge,
  CanvasNode,
  CanvasSnapshot,
  ICanvasStorage,
} from "./model";
import {
  applyCanvasChanges,
  canvasSnapshotSyncSchema,
  type CanvasChanges,
} from "@shared/canvas";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("dynamo-canvas");

const TABLE = process.env.CANVAS_DDB_TABLE || "meshwork-canvas";
const ENDPOINT = process.env.DYNAMODB_ENDPOINT; // dynamo-local in dev
const REGION = process.env.AWS_REGION || "us-east-1";
const DOC_KEY = "doc";
const DEFAULT_INLINE_MAX_BYTES = 350 * 1024;
const S3_PREFIX_DEFAULT = "canvases";

export type CanvasDocModelMode = "off" | "read" | "on";

export function canvasDocModelMode(): CanvasDocModelMode {
  const mode = process.env.CANVAS_DOC_MODEL;
  return mode === "read" || mode === "on" ? mode : "off";
}

function inlineMaxBytes(): number {
  const raw = process.env.CANVAS_DOC_INLINE_MAX_BYTES;
  if (!raw) return DEFAULT_INLINE_MAX_BYTES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_INLINE_MAX_BYTES;
}

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

let cachedS3: S3Client | null = null;
function s3Client(): S3Client {
  if (cachedS3) return cachedS3;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "local";
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    "local";
  cachedS3 = new S3Client({
    region: REGION,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    ...(endpoint ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
  return cachedS3;
}

function s3Bucket(): string {
  const bucket = process.env.CANVAS_S3_BUCKET;
  if (!bucket) {
    throw new CanvasDocConfigError(
      "CANVAS_S3_BUCKET is required when a canvas document exceeds the inline threshold",
    );
  }
  return bucket;
}

function canvasObjectKey(
  workspaceId: string,
  revision: number,
  writerId: string,
): string {
  const prefix = (process.env.CANVAS_S3_PREFIX || S3_PREFIX_DEFAULT).replace(
    /^\/+|\/+$/g,
    "",
  );
  const object = `${workspaceId}/${revision}-${writerId}.json.gz`;
  return prefix ? `${prefix}/${object}` : object;
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
  revision?: number;
}

interface CanvasDocItem extends Omit<Item, "body"> {
  sk: typeof DOC_KEY;
  revision: number;
  body?: Uint8Array;
  bytes?: number;
  s3Key?: string;
  etag?: string;
  updatedAt?: string;
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

export class CanvasDocConfigError extends Error {
  readonly code = "CANVAS_DOC_CONFIG";

  constructor(message: string) {
    super(message);
    this.name = "CanvasDocConfigError";
  }
}

export class CanvasInvalidGraphError extends Error {
  readonly code = "INVALID_CANVAS";

  constructor(readonly issues: { path: string; message: string }[]) {
    super("Canvas contains invalid nodes or connections");
    this.name = "CanvasInvalidGraphError";
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

function snapshotFromItems(items: Item[]): CanvasSnapshot {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  for (const item of items) {
    if (item.sk.startsWith("node#")) {
      nodes.push({
        ...item.body,
        id: item.sk.slice("node#".length),
      } as CanvasNode);
    } else if (item.sk.startsWith("edge#")) {
      edges.push({
        ...item.body,
        id: item.sk.slice("edge#".length),
      } as CanvasEdge);
    }
  }
  return { nodes, edges, revision: revisionOf(items) };
}

function validateMergedCanvas(
  nodes: { id: string }[],
  edges: { id: string; source: string; target: string }[],
  baseRevision: number,
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const parsed = canvasSnapshotSyncSchema.safeParse({
    nodes,
    edges,
    baseRevision,
  });
  if (!parsed.success) {
    throw new CanvasInvalidGraphError(
      parsed.error.issues.slice(0, 10).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return {
    nodes: parsed.data.nodes,
    edges: parsed.data.edges,
  };
}

function revisionOf(items: Item[]): number {
  const revision = items.find((item) => item.sk === REVISION_KEY)?.revision;
  return typeof revision === "number" && revision >= 0 ? revision : 0;
}

function docRevision(item: CanvasDocItem): number {
  return typeof item.revision === "number" && item.revision >= 0
    ? item.revision
    : 0;
}

function encodeCanvas(nodes: CanvasNode[], edges: CanvasEdge[]) {
  const json = JSON.stringify({ nodes, edges });
  return {
    body: gzipSync(Buffer.from(json, "utf8")),
    bytes: Buffer.byteLength(json, "utf8"),
  };
}

function decodeCanvas(body: Uint8Array): {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
} {
  const parsed = JSON.parse(gunzipSync(Buffer.from(body)).toString("utf8")) as {
    nodes?: unknown;
    edges?: unknown;
  };
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error("Canvas document is missing nodes or edges");
  }
  return {
    nodes: parsed.nodes as CanvasNode[],
    edges: parsed.edges as CanvasEdge[],
  };
}

async function getDocMeta(workspaceId: string): Promise<CanvasDocItem | null> {
  const { doc } = clients();
  const response = await doc.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: partitionKey(workspaceId), sk: DOC_KEY },
      ConsistentRead: true,
    }),
  );
  return response.Item ? (response.Item as CanvasDocItem) : null;
}

async function getS3Object(key: string): Promise<Uint8Array> {
  const response = await s3Client().send(
    new GetObjectCommand({ Bucket: s3Bucket(), Key: key }),
  );
  const body = response.Body as
    { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!body?.transformToByteArray) {
    throw new Error(`S3 object ${key} has no readable body`);
  }
  return body.transformToByteArray();
}

async function putS3Object(
  key: string,
  body: Uint8Array,
): Promise<string | undefined> {
  const response = await s3Client().send(
    new PutObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
      Body: body,
      ContentType: "application/json",
      ContentEncoding: "gzip",
    }),
  );
  return response.ETag;
}

async function deleteS3Object(key: string): Promise<void> {
  try {
    await s3Client().send(
      new DeleteObjectCommand({ Bucket: s3Bucket(), Key: key }),
    );
  } catch (err) {
    log.warn({ err, key }, "Failed to delete orphaned canvas object");
  }
}

async function readDocSnapshot(
  workspaceId: string,
  meta: CanvasDocItem,
): Promise<CanvasSnapshot> {
  let body: Uint8Array | undefined;
  if (meta.s3Key) {
    body = await getS3Object(meta.s3Key);
  } else if (meta.body) {
    body = Buffer.from(meta.body);
  }
  if (!body) {
    throw new Error(`Canvas document for ${workspaceId} has no body`);
  }
  const { nodes, edges } = decodeCanvas(body);
  return { nodes, edges, revision: docRevision(meta) };
}

async function readDocSnapshotForMode(
  workspaceId: string,
  mode: Exclude<CanvasDocModelMode, "off">,
): Promise<CanvasSnapshot | null> {
  const meta = await getDocMeta(workspaceId);
  if (!meta) return null;
  if (
    mode === "read" &&
    (await getCanvasRevisionLegacy(workspaceId)) > docRevision(meta)
  ) {
    return null;
  }
  return readDocSnapshot(workspaceId, meta);
}

async function readDocRevisionForMode(
  workspaceId: string,
  mode: Exclude<CanvasDocModelMode, "off">,
): Promise<number | null> {
  const meta = await getDocMeta(workspaceId);
  if (!meta) return null;
  const revision = docRevision(meta);
  if (
    mode === "read" &&
    (await getCanvasRevisionLegacy(workspaceId)) > revision
  ) {
    return null;
  }
  return revision;
}

async function readCurrentRevision(workspaceId: string): Promise<number> {
  const meta = await getDocMeta(workspaceId);
  if (meta) return docRevision(meta);
  return getCanvasRevisionLegacy(workspaceId);
}

async function commitDocSnapshot(
  workspaceId: string,
  current: CanvasDocItem | null,
  currentRevision: number,
  baseRevision: number,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): Promise<number> {
  const nextRevision = currentRevision + 1;
  const { body, bytes } = encodeCanvas(nodes, edges);
  let s3Key: string | undefined;
  let etag: string | undefined;

  if (body.byteLength > inlineMaxBytes()) {
    s3Key = canvasObjectKey(workspaceId, nextRevision, randomUUID());
    etag = await putS3Object(s3Key, body);
  }

  const item: Record<string, unknown> = {
    pk: partitionKey(workspaceId),
    sk: DOC_KEY,
    revision: nextRevision,
    bytes,
    updatedAt: new Date().toISOString(),
    ...(s3Key ? { s3Key, etag } : { body }),
  };

  try {
    await clients().doc.send(
      new PutCommand({
        TableName: TABLE,
        Item: item,
        ConditionExpression: current
          ? "#revision = :base"
          : "attribute_not_exists(#pk)",
        ExpressionAttributeNames: current
          ? { "#revision": "revision" }
          : { "#pk": "pk" },
        ...(current
          ? { ExpressionAttributeValues: { ":base": currentRevision } }
          : {}),
      }),
    );
  } catch (err) {
    if (s3Key) await deleteS3Object(s3Key);
    if ((err as Error).name === "ConditionalCheckFailedException") {
      const latest = await readCurrentRevision(workspaceId);
      throw new CanvasRevisionConflictError(baseRevision, latest);
    }
    throw err;
  }

  log.info(
    { workspaceId, revision: nextRevision, bytes, s3: Boolean(s3Key) },
    "Canvas document committed",
  );
  return nextRevision;
}

async function writeDocSnapshot(
  workspaceId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  expectedRevision?: number,
): Promise<number> {
  const current = await getDocMeta(workspaceId);
  const currentRevision = current
    ? docRevision(current)
    : await getCanvasRevisionLegacy(workspaceId);
  const baseRevision = expectedRevision ?? currentRevision;
  if (baseRevision !== currentRevision) {
    throw new CanvasRevisionConflictError(baseRevision, currentRevision);
  }
  return commitDocSnapshot(
    workspaceId,
    current,
    currentRevision,
    baseRevision,
    nodes,
    edges,
  );
}

async function writeDocChanges(
  workspaceId: string,
  changes: CanvasChanges,
  expectedRevision?: number,
): Promise<CanvasSnapshot> {
  const current = await getDocMeta(workspaceId);
  const currentRevision = current
    ? docRevision(current)
    : await getCanvasRevisionLegacy(workspaceId);
  const baseRevision = expectedRevision ?? currentRevision;
  if (baseRevision !== currentRevision) {
    throw new CanvasRevisionConflictError(baseRevision, currentRevision);
  }

  const base = current
    ? await readDocSnapshot(workspaceId, current)
    : await getCanvasLegacy(workspaceId);
  const merged = applyCanvasChanges(base.nodes, base.edges, changes);
  const validated = validateMergedCanvas(
    merged.nodes,
    merged.edges,
    currentRevision,
  );
  const revision = await commitDocSnapshot(
    workspaceId,
    current,
    currentRevision,
    baseRevision,
    validated.nodes,
    validated.edges,
  );
  return { ...validated, revision };
}

async function getCanvasRevisionLegacy(workspaceId: string): Promise<number> {
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

async function getCanvasLegacy(workspaceId: string): Promise<CanvasSnapshot> {
  return snapshotFromItems(await queryPartition(workspaceId));
}

async function getNodesLegacy(workspaceId: string): Promise<CanvasNode[]> {
  const items = await queryPartition(workspaceId, "node#");
  return items.map(
    (raw) => ({ ...raw.body, id: raw.sk.slice("node#".length) }) as CanvasNode,
  );
}

async function getEdgesLegacy(workspaceId: string): Promise<CanvasEdge[]> {
  const items = await queryPartition(workspaceId, "edge#");
  return items.map(
    (raw) => ({ ...raw.body, id: raw.sk.slice("edge#".length) }) as CanvasEdge,
  );
}

async function writeLegacySnapshot(
  workspaceId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  expectedRevision?: number,
  changes?: CanvasChanges,
): Promise<CanvasSnapshot> {
  const lockOwner = await acquireCanvasLock(workspaceId);
  try {
    const currentRevision = await getCanvasRevisionLegacy(workspaceId);
    // The optional value maintains safe compatibility for internal callers;
    // the public API always supplies the revision returned by GET /canvas.
    const revisionToWrite = expectedRevision ?? currentRevision;
    if (revisionToWrite !== currentRevision) {
      throw new CanvasRevisionConflictError(revisionToWrite, currentRevision);
    }

    const existing = (await queryPartition(workspaceId)).filter(isCanvasItem);
    let nextNodes = nodes;
    let nextEdges = edges;
    if (changes) {
      const current = snapshotFromItems(existing);
      const merged = applyCanvasChanges(current.nodes, current.edges, changes);
      const validated = validateMergedCanvas(
        merged.nodes,
        merged.edges,
        currentRevision,
      );
      nextNodes = validated.nodes;
      nextEdges = validated.edges;
    }

    const desired = new Map<string, Item>();
    for (const n of nextNodes)
      desired.set(`node#${n.id}`, nodeItem(workspaceId, n));
    for (const e of nextEdges)
      desired.set(`edge#${e.id}`, edgeItem(workspaceId, e));

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
    return { nodes: nextNodes, edges: nextEdges, revision: nextRevision };
  } finally {
    await releaseCanvasLock(workspaceId, lockOwner);
  }
}

async function syncCanvasLegacy(
  workspaceId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  expectedRevision?: number,
): Promise<number> {
  return (
    await writeLegacySnapshot(workspaceId, nodes, edges, expectedRevision)
  ).revision;
}

async function duplicateCanvasLegacy(
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

export async function scanCanvasWorkspaceIds(): Promise<string[]> {
  const { doc } = clients();
  const ids = new Set<string>();
  let lastKey: Record<string, unknown> | undefined;
  do {
    const response = await doc.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression:
          "#sk = :meta OR #sk = :doc OR begins_with(#sk, :node) OR begins_with(#sk, :edge)",
        ExpressionAttributeNames: { "#sk": "sk" },
        ExpressionAttributeValues: {
          ":meta": REVISION_KEY,
          ":doc": DOC_KEY,
          ":node": "node#",
          ":edge": "edge#",
        },
        ProjectionExpression: "pk",
        ExclusiveStartKey: lastKey,
        ConsistentRead: true,
      }),
    );
    for (const item of response.Items ?? []) {
      const pk = String(item.pk ?? "");
      if (pk.startsWith("ws#")) ids.add(pk.slice("ws#".length));
    }
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  return [...ids];
}

export class DynamoCanvasStorage implements ICanvasStorage {
  async getCanvas(workspaceId: string): Promise<CanvasSnapshot> {
    const mode = canvasDocModelMode();
    if (mode !== "off") {
      const snapshot = await readDocSnapshotForMode(workspaceId, mode);
      if (snapshot) return snapshot;
    }
    return getCanvasLegacy(workspaceId);
  }

  async getNodes(workspaceId: string): Promise<CanvasNode[]> {
    const mode = canvasDocModelMode();
    if (mode !== "off") {
      const snapshot = await readDocSnapshotForMode(workspaceId, mode);
      if (snapshot) return snapshot.nodes;
    }
    return getNodesLegacy(workspaceId);
  }

  async getEdges(workspaceId: string): Promise<CanvasEdge[]> {
    const mode = canvasDocModelMode();
    if (mode !== "off") {
      const snapshot = await readDocSnapshotForMode(workspaceId, mode);
      if (snapshot) return snapshot.edges;
    }
    return getEdgesLegacy(workspaceId);
  }

  async getCanvasRevision(workspaceId: string): Promise<number> {
    const mode = canvasDocModelMode();
    if (mode !== "off") {
      const revision = await readDocRevisionForMode(workspaceId, mode);
      if (revision !== null) return revision;
    }
    return getCanvasRevisionLegacy(workspaceId);
  }

  async syncCanvas(
    workspaceId: string,
    nodes: CanvasNode[],
    edges: CanvasEdge[],
    expectedRevision?: number,
  ): Promise<number> {
    if (canvasDocModelMode() === "on") {
      return writeDocSnapshot(workspaceId, nodes, edges, expectedRevision);
    }
    return syncCanvasLegacy(workspaceId, nodes, edges, expectedRevision);
  }

  async syncCanvasChanges(
    workspaceId: string,
    changes: CanvasChanges,
    expectedRevision?: number,
  ): Promise<CanvasSnapshot> {
    if (canvasDocModelMode() === "on") {
      return writeDocChanges(workspaceId, changes, expectedRevision);
    }
    return writeLegacySnapshot(workspaceId, [], [], expectedRevision, changes);
  }

  async duplicateCanvas(
    fromWorkspaceId: string,
    toWorkspaceId: string,
  ): Promise<void> {
    if (canvasDocModelMode() !== "off") {
      const source = await this.getCanvas(fromWorkspaceId);
      await this.syncCanvas(toWorkspaceId, source.nodes, source.edges);
      return;
    }
    await duplicateCanvasLegacy(fromWorkspaceId, toWorkspaceId);
  }

  /** Bulk cleanup keyed by explicit workspace ids (ownership resolved by the
   *  caller via the workspace service). */
  async deleteWorkspaces(workspaceIds: string[]): Promise<void> {
    for (const id of workspaceIds) {
      const existing = await queryPartition(id);
      for (const item of existing) {
        if (item.sk === DOC_KEY) {
          const meta = item as unknown as CanvasDocItem;
          if (meta.s3Key) await deleteS3Object(meta.s3Key);
        }
      }
      const requests = existing.map((item) => ({
        DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
      }));
      if (requests.length > 0) await batchWrite(requests);
    }
  }

  async backfillCanvas(
    workspaceId: string,
  ): Promise<"created" | "updated" | "exists" | "empty"> {
    const existing = await getDocMeta(workspaceId);
    const snapshot = await getCanvasLegacy(workspaceId);
    if (
      snapshot.nodes.length === 0 &&
      snapshot.edges.length === 0 &&
      snapshot.revision === 0
    ) {
      return existing ? "exists" : "empty";
    }
    if (existing && existing.revision >= snapshot.revision) return "exists";

    const { body, bytes } = encodeCanvas(snapshot.nodes, snapshot.edges);
    let s3Key: string | undefined;
    let etag: string | undefined;
    if (body.byteLength > inlineMaxBytes()) {
      s3Key = canvasObjectKey(workspaceId, snapshot.revision, randomUUID());
      etag = await putS3Object(s3Key, body);
    }

    try {
      await clients().doc.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            pk: partitionKey(workspaceId),
            sk: DOC_KEY,
            revision: snapshot.revision,
            bytes,
            updatedAt: new Date().toISOString(),
            ...(s3Key ? { s3Key, etag } : { body }),
          },
          ConditionExpression: existing
            ? "#revision = :base"
            : "attribute_not_exists(#pk)",
          ExpressionAttributeNames: {
            "#pk": "pk",
            ...(existing ? { "#revision": "revision" } : {}),
          },
          ...(existing
            ? {
                ExpressionAttributeValues: {
                  ":base": existing.revision,
                },
              }
            : {}),
        }),
      );
    } catch (err) {
      if (s3Key) await deleteS3Object(s3Key);
      if ((err as Error).name === "ConditionalCheckFailedException") {
        return "exists";
      }
      throw err;
    }

    log.info(
      {
        workspaceId,
        revision: snapshot.revision,
        bytes,
        s3: Boolean(s3Key),
        reconciled: Boolean(existing),
      },
      existing ? "Canvas document reconciled" : "Canvas document backfilled",
    );
    return existing ? "updated" : "created";
  }

  /** One-way rollback helper: rewrite the legacy item model from the document
   *  and align the legacy revision before switching back to `off`. */
  async restoreLegacyFromDoc(
    workspaceId: string,
  ): Promise<"restored" | "skipped" | "empty"> {
    const meta = await getDocMeta(workspaceId);
    if (!meta) return "empty";
    const snapshot = await readDocSnapshot(workspaceId, meta);

    const legacyRevision = await getCanvasRevisionLegacy(workspaceId);
    if (snapshot.revision <= legacyRevision) return "skipped";

    const writtenRevision = await syncCanvasLegacy(
      workspaceId,
      snapshot.nodes,
      snapshot.edges,
    );
    if (writtenRevision !== snapshot.revision) {
      await clients().doc.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            pk: partitionKey(workspaceId),
            sk: REVISION_KEY,
            revision: snapshot.revision,
          },
          ConditionExpression: "#revision = :current",
          ExpressionAttributeNames: { "#revision": "revision" },
          ExpressionAttributeValues: { ":current": writtenRevision },
        }),
      );
    }

    log.info(
      { workspaceId, revision: snapshot.revision },
      "Canvas legacy model restored from document",
    );
    return "restored";
  }
}
