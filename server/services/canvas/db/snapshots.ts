import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  BatchWriteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type {
  CanvasEdge,
  CanvasNode,
  CanvasSnapshot,
  ICanvasStorage,
} from "./model";
import {
  CanvasDeletedError,
  CanvasRevisionConflictError,
  CanvasWriteIncompleteError,
} from "./errors";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("canvas-snapshots");
const PART_BYTES = 280 * 1024;
const MAX_SNAPSHOT_BYTES = 6 * 1024 * 1024;
const pk = (id: string) => `ws#${id}`;
const partKey = (generation: string, index: number) =>
  `snapshot#${generation}#${String(index).padStart(6, "0")}`;
interface Pointer {
  hash: string;
  bytes: number;
  compressed?: Uint8Array;
  generation?: string;
  parts?: number;
}
interface Head {
  token: string;
  revision: number;
  deleted?: boolean;
  pointer?: Pointer;
}
interface CopyIntent {
  sourceId: string;
  sourceRevision: number;
  expectedToken: string | null;
  expectedRevision: number;
  pointer: Pointer;
  status: "pending" | "completed";
}
interface Row {
  sk: string;
  body?: Record<string, unknown>;
  revision?: number;
  chunk?: Uint8Array;
}

function isConditional(error: unknown): boolean {
  const e = error as {
    name?: string;
    CancellationReasons?: { Code?: string }[];
  };
  return (
    e.name === "ConditionalCheckFailedException" ||
    (e.name === "TransactionCanceledException" &&
      e.CancellationReasons?.some(
        (reason) => reason.Code === "ConditionalCheckFailed",
      ) === true)
  );
}

/** Immutable payloads plus a conditional document head: no partial revision is visible. */
export class AtomicCanvasStorage implements ICanvasStorage {
  constructor(
    private readonly doc: Pick<DynamoDBDocumentClient, "send">,
    private readonly table: string,
  ) {}

  private async head(id: string): Promise<Head | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.table,
        Key: { pk: pk(id), sk: "doc" },
        ConsistentRead: true,
      }),
    );
    return result.Item as Head | undefined;
  }

  private guard(id: string, token: string | undefined) {
    const names: Record<string, string> = token
      ? { "#token": "token", "#deleted": "deleted" }
      : { "#pk": "pk" };
    return {
      TableName: this.table,
      Key: { pk: pk(id), sk: "doc" },
      ConditionExpression: token
        ? "#token = :token AND attribute_not_exists(#deleted)"
        : "attribute_not_exists(#pk)",
      ExpressionAttributeNames: names,
      ...(token ? { ExpressionAttributeValues: { ":token": token } } : {}),
    };
  }

  private async rows(id: string, prefix?: string): Promise<Row[]> {
    const out: Row[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await this.doc.send(
        new QueryCommand({
          TableName: this.table,
          ConsistentRead: true,
          KeyConditionExpression: prefix
            ? "#pk = :pk AND begins_with(#sk, :prefix)"
            : "#pk = :pk",
          ExpressionAttributeNames: {
            "#pk": "pk",
            ...(prefix ? { "#sk": "sk" } : {}),
          },
          ExpressionAttributeValues: {
            ":pk": pk(id),
            ...(prefix ? { ":prefix": prefix } : {}),
          },
          ExclusiveStartKey: cursor,
        }),
      );
      out.push(...((page.Items ?? []) as Row[]));
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return out;
  }

  private async readPointer(
    id: string,
    pointer: Pointer,
  ): Promise<{ nodes: CanvasNode[]; edges: CanvasEdge[] }> {
    const bytes = pointer.compressed
      ? Buffer.from(pointer.compressed)
      : Buffer.concat(
          (await this.rows(id, `snapshot#${pointer.generation}#`)).map((row) =>
            Buffer.from(row.chunk ?? []),
          ),
        );
    if (
      bytes.length !== pointer.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== pointer.hash
    ) {
      throw new CanvasWriteIncompleteError(1, 1);
    }
    const value = JSON.parse(
      gunzipSync(bytes, { maxOutputLength: MAX_SNAPSHOT_BYTES }).toString(
        "utf8",
      ),
    ) as { nodes: CanvasNode[]; edges: CanvasEdge[] };
    if (!Array.isArray(value.nodes) || !Array.isArray(value.edges))
      throw new CanvasWriteIncompleteError(1, 1);
    return value;
  }

  private async read(
    id: string,
  ): Promise<{ snapshot: CanvasSnapshot; head?: Head }> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const head = await this.head(id);
      if (head?.deleted)
        return {
          head,
          snapshot: { nodes: [], edges: [], revision: head.revision },
        };
      if (head?.pointer) {
        try {
          return {
            head,
            snapshot: {
              ...(await this.readPointer(id, head.pointer)),
              revision: head.revision,
            },
          };
        } catch (error) {
          // A concurrent publication may have retired the old overflow chunks.
          if ((await this.head(id))?.token !== head.token) continue;
          throw error;
        }
      }
      // Legacy items are read-only after rollout. Never run mixed old/new writers.
      const legacy = await this.rows(id);
      if (await this.head(id)) continue;
      const nodes = legacy
        .filter((row) => row.sk.startsWith("node#"))
        .map((row) => ({ ...row.body, id: row.sk.slice(5) }) as CanvasNode);
      const edges = legacy
        .filter((row) => row.sk.startsWith("edge#"))
        .map((row) => ({ ...row.body, id: row.sk.slice(5) }) as CanvasEdge);
      return {
        snapshot: {
          nodes,
          edges,
          revision: legacy.find((row) => row.sk === "meta")?.revision ?? 0,
        },
      };
    }
    throw new CanvasWriteIncompleteError(1, 3);
  }

  async getCanvas(id: string): Promise<CanvasSnapshot> {
    return (await this.read(id)).snapshot;
  }
  async getNodes(id: string): Promise<CanvasNode[]> {
    return (await this.getCanvas(id)).nodes;
  }
  async getEdges(id: string): Promise<CanvasEdge[]> {
    return (await this.getCanvas(id)).edges;
  }
  async getCanvasRevision(id: string): Promise<number> {
    return (await this.read(id)).snapshot.revision;
  }

  private async prepare(
    id: string,
    nodes: CanvasNode[],
    edges: CanvasEdge[],
    head?: Head,
  ): Promise<Pointer> {
    const order = (a: { id: string }, b: { id: string }) =>
      Buffer.compare(Buffer.from(a.id), Buffer.from(b.id));
    const json = JSON.stringify({
      nodes: nodes
        .map(({ workspaceId: _workspaceId, ...node }) => node)
        .sort(order),
      edges: edges
        .map(({ workspaceId: _workspaceId, ...edge }) => edge)
        .sort(order),
    });
    if (Buffer.byteLength(json) > MAX_SNAPSHOT_BYTES)
      throw new CanvasWriteIncompleteError(1, 0);
    const bytes = gzipSync(json);
    const pointer: Pointer = {
      hash: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    };
    if (bytes.length <= PART_BYTES) return { ...pointer, compressed: bytes };
    const generation = randomUUID();
    const parts = Math.ceil(bytes.length / PART_BYTES);
    // At most nine 280 KiB payloads + a head check per transaction (<4 MiB).
    for (let offset = 0; offset < parts; offset += 9) {
      const puts = Array.from(
        { length: Math.min(9, parts - offset) },
        (_, index) => {
          const part = offset + index;
          return {
            Put: {
              TableName: this.table,
              Item: {
                pk: pk(id),
                sk: partKey(generation, part),
                chunk: bytes.subarray(
                  part * PART_BYTES,
                  (part + 1) * PART_BYTES,
                ),
              },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          };
        },
      );
      try {
        await this.doc.send(
          new TransactWriteCommand({
            TransactItems: [
              { ConditionCheck: this.guard(id, head?.token) },
              ...puts,
            ],
          }),
        );
      } catch (error) {
        if (isConditional(error)) await this.conflict(id, head?.revision ?? 0);
        throw error;
      }
    }
    return { ...pointer, generation, parts };
  }

  private async conflict(id: string, expected: number): Promise<never> {
    const head = await this.head(id);
    if (head?.deleted) throw new CanvasDeletedError();
    throw new CanvasRevisionConflictError(expected, head?.revision ?? expected);
  }

  private async removeKeys(id: string, keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 25) {
      let pending = keys
        .slice(i, i + 25)
        .map((sk) => ({ DeleteRequest: { Key: { pk: pk(id), sk } } }));
      for (let attempt = 0; pending.length && attempt < 6; attempt++) {
        const result = await this.doc.send(
          new BatchWriteCommand({ RequestItems: { [this.table]: pending } }),
        );
        pending = (result.UnprocessedItems?.[this.table] ??
          []) as typeof pending;
        if (pending.length)
          await new Promise((resolve) =>
            setTimeout(resolve, 25 * 2 ** attempt),
          );
      }
      if (pending.length)
        throw new CanvasWriteIncompleteError(pending.length, 6);
    }
  }

  private async retire(id: string, head?: Head): Promise<void> {
    try {
      if (head?.pointer?.generation) {
        await this.removeKeys(
          id,
          Array.from({ length: head.pointer.parts ?? 0 }, (_, i) =>
            partKey(head.pointer!.generation!, i),
          ),
        );
      } else if (!head) {
        const legacy = await this.rows(id);
        await this.removeKeys(
          id,
          legacy
            .filter(
              (row) =>
                row.sk.startsWith("node#") ||
                row.sk.startsWith("edge#") ||
                row.sk === "meta" ||
                row.sk === "meta#lock",
            )
            .map((row) => row.sk),
        );
      }
    } catch (error) {
      log.warn(
        { err: error, workspaceId: id },
        "Committed snapshot cleanup deferred",
      );
    }
  }

  async syncCanvas(
    id: string,
    nodes: CanvasNode[],
    edges: CanvasEdge[],
    expectedRevision?: number,
  ): Promise<number> {
    const current = await this.read(id);
    if (current.head?.deleted) throw new CanvasDeletedError();
    const expected = expectedRevision ?? current.snapshot.revision;
    if (expected !== current.snapshot.revision)
      throw new CanvasRevisionConflictError(
        expected,
        current.snapshot.revision,
      );
    const pointer = await this.prepare(id, nodes, edges, current.head);
    const { Key, ...condition } = this.guard(id, current.head?.token);
    try {
      await this.doc.send(
        new PutCommand({
          ...condition,
          Item: {
            ...Key,
            format: 2,
            token: randomUUID(),
            revision: expected + 1,
            pointer,
          },
        }),
      );
    } catch (error) {
      if (isConditional(error)) await this.conflict(id, expected);
      throw error;
    }
    await this.retire(id, current.head);
    return expected + 1;
  }

  async duplicateCanvas(
    sourceId: string,
    targetId: string,
    operationId = `copy:${sourceId}:${targetId}`,
  ): Promise<void> {
    if (sourceId === targetId) return;
    const key = { pk: pk(targetId), sk: `copy#${operationId}` };
    const receipt = async () =>
      (
        await this.doc.send(
          new GetCommand({
            TableName: this.table,
            Key: key,
            ConsistentRead: true,
          }),
        )
      ).Item as CopyIntent | undefined;
    let intent = await receipt();
    if (!intent) {
      const source = await this.read(sourceId);
      const target = await this.read(targetId);
      if (source.head?.deleted || target.head?.deleted)
        throw new CanvasDeletedError();
      const pointer = await this.prepare(
        targetId,
        source.snapshot.nodes,
        source.snapshot.edges,
        target.head,
      );
      intent = {
        sourceId,
        sourceRevision: source.snapshot.revision,
        expectedToken: target.head?.token ?? null,
        expectedRevision: target.snapshot.revision,
        pointer,
        status: "pending",
      };
      try {
        await this.doc.send(
          new TransactWriteCommand({
            TransactItems: [
              { ConditionCheck: this.guard(sourceId, source.head?.token) },
              { ConditionCheck: this.guard(targetId, target.head?.token) },
              {
                Put: {
                  TableName: this.table,
                  Item: { ...key, ...intent },
                  ConditionExpression: "attribute_not_exists(pk)",
                },
              },
            ],
          }),
        );
      } catch (error) {
        if (!isConditional(error)) throw error;
        const winner = await receipt();
        if (!winner) await this.conflict(targetId, target.snapshot.revision);
        intent = winner;
      }
    }
    if (!intent || intent.sourceId !== sourceId)
      throw new CanvasWriteIncompleteError(1, 0);
    if (intent.status === "completed") return;
    const { Key, ...condition } = this.guard(
      targetId,
      intent.expectedToken ?? undefined,
    );
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                ...condition,
                Item: {
                  ...Key,
                  format: 2,
                  token: randomUUID(),
                  revision: intent.expectedRevision + 1,
                  pointer: intent.pointer,
                },
              },
            },
            {
              Update: {
                TableName: this.table,
                Key: key,
                UpdateExpression: "SET #status = :done REMOVE #pointer",
                ConditionExpression: "#status = :pending",
                ExpressionAttributeNames: {
                  "#status": "status",
                  "#pointer": "pointer",
                },
                ExpressionAttributeValues: {
                  ":done": "completed",
                  ":pending": "pending",
                },
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (!isConditional(error)) throw error;
      if ((await receipt())?.status === "completed") return;
      await this.conflict(targetId, intent.expectedRevision);
    }
    // Old destination payloads cannot leak into the committed copy.
    // The intent doesn't retain the previous editable document body. Old
    // overflow chunks from a copy replacement are harmless deferred garbage.
    if (!intent.expectedToken) await this.retire(targetId);
  }

  async deleteWorkspaces(ids: string[]): Promise<void> {
    for (const id of ids) {
      // Permanent tombstone fences saves, copy commits, intents and chunk writes.
      await this.doc.send(
        new PutCommand({
          TableName: this.table,
          Item: {
            pk: pk(id),
            sk: "doc",
            format: 2,
            token: randomUUID(),
            revision: 0,
            deleted: true,
          },
        }),
      );
      await this.removeKeys(
        id,
        (await this.rows(id))
          .filter((row) => row.sk !== "doc")
          .map((row) => row.sk),
      );
    }
  }
}
