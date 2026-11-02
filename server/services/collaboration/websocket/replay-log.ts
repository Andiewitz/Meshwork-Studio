import { createHash } from "node:crypto";
import type { Redis } from "ioredis";
import { z } from "zod";

const eventSchema = z
  .object({
    type: z.enum(["node-move", "canvas-sync", "nodes-change", "edges-change"]),
  })
  .passthrough();
export type ReplayEvent = z.infer<typeof eventSchema>;
export type ReplayRead =
  | { status: "available"; events: { id: string; event: ReplayEvent }[] }
  | { status: "gap" };

const APPEND = `
local id = redis.call('XADD', KEYS[1], 'MAXLEN', '=', ARGV[1], '*', 'kind', ARGV[3], 'payload', ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return id
`;
const READ_AFTER = `
local anchor = redis.call('XRANGE', KEYS[1], ARGV[1], ARGV[1], 'COUNT', 1)
if #anchor ~= 1 then return {0} end
local fields = anchor[1][2]
if #fields ~= 4 or fields[1] ~= 'kind' or fields[3] ~= 'payload' or (fields[2] ~= 'event' and fields[2] ~= 'checkpoint') then return {0} end
local entries = redis.call('XRANGE', KEYS[1], '(' .. ARGV[1], '+', 'COUNT', ARGV[2])
return {1, entries}
`;
const STREAM_ID = /^[0-9]{1,20}-[0-9]{1,20}$/;
const INCARNATION = /^[a-f0-9]{40}$/;

function isAfter(left: string, right: string): boolean {
  const [leftTime, leftSequence] = left.split("-").map(BigInt);
  const [rightTime, rightSequence] = right.split("-").map(BigInt);
  return (
    leftTime > rightTime ||
    (leftTime === rightTime && leftSequence > rightSequence)
  );
}

/**
 * A bounded Redis Stream primitive, not an authorization boundary. Callers
 * must validate a signed, user/session/workspace/epoch-bound cursor and order
 * live delivery with replay before enabling it in the WebSocket protocol.
 */
export class RedisReplayLog {
  constructor(
    private readonly redis: Pick<Redis, "info" | "eval">,
    private readonly options: {
      maxEntries?: number;
      maxEventBytes?: number;
      ttlMs?: number;
    } = {},
  ) {
    for (const [value, maximum] of [
      [options.maxEntries ?? 128, 128],
      [options.maxEventBytes ?? 8192, 8192],
      [options.ttlMs ?? 300000, 300000],
    ]) {
      if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
        throw new Error("Invalid replay log limit");
    }
  }

  private key(workspaceId: string): string {
    if (!workspaceId || workspaceId.length > 128)
      throw new Error("Invalid workspace ID");
    return `realtime:replay:${createHash("sha256").update(workspaceId).digest("hex")}`;
  }

  private async incarnation(): Promise<string> {
    const info = await this.redis.info("server");
    const value = /^run_id:([a-f0-9]{40})\r?$/m.exec(info)?.[1];
    if (!value || !INCARNATION.test(value))
      throw new Error("Redis incarnation unavailable");
    return value;
  }

  private async append(
    workspaceId: string,
    kind: "event" | "checkpoint" | "gap",
    payload: string,
  ) {
    const before = await this.incarnation();
    const id = await this.redis.eval(
      APPEND,
      1,
      this.key(workspaceId),
      this.options.maxEntries ?? 128,
      this.options.ttlMs ?? 300000,
      kind,
      payload,
    );
    const after = await this.incarnation();
    if (before !== after || typeof id !== "string" || !STREAM_ID.test(id))
      throw new Error("Replay log unavailable");
    return { id, incarnation: before };
  }

  async checkpoint(workspaceId: string) {
    return this.append(workspaceId, "checkpoint", "");
  }

  async appendEvent(workspaceId: string, input: unknown) {
    const event = eventSchema.parse(input);
    const encoded = JSON.stringify(event);
    if (
      Buffer.byteLength(encoded, "utf8") > (this.options.maxEventBytes ?? 8192)
    ) {
      const marker = await this.append(workspaceId, "gap", "");
      return { ...marker, replayable: false };
    }
    const position = await this.append(workspaceId, "event", encoded);
    return { ...position, replayable: true };
  }

  async readAfter(
    workspaceId: string,
    id: string,
    expectedIncarnation: string,
  ): Promise<ReplayRead> {
    if (!STREAM_ID.test(id) || !INCARNATION.test(expectedIncarnation))
      return { status: "gap" };
    const before = await this.incarnation();
    if (before !== expectedIncarnation) return { status: "gap" };
    const raw = await this.redis.eval(
      READ_AFTER,
      1,
      this.key(workspaceId),
      id,
      (this.options.maxEntries ?? 128) + 1,
    );
    const after = await this.incarnation();
    if (
      before !== after ||
      !Array.isArray(raw) ||
      raw[0] !== 1 ||
      !Array.isArray(raw[1])
    )
      return { status: "gap" };
    if (raw[1].length > (this.options.maxEntries ?? 128))
      return { status: "gap" };
    const events: { id: string; event: ReplayEvent }[] = [];
    let previousId = id;
    for (const entry of raw[1] as unknown[]) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== "string" ||
        !STREAM_ID.test(entry[0]) ||
        !Array.isArray(entry[1]) ||
        entry[1].length !== 4 ||
        entry[1][0] !== "kind" ||
        entry[1][2] !== "payload" ||
        typeof entry[1][1] !== "string" ||
        typeof entry[1][3] !== "string"
      )
        return { status: "gap" };
      if (!isAfter(entry[0], previousId)) return { status: "gap" };
      previousId = entry[0];
      const [, fields] = entry;
      if (fields[1] === "checkpoint") {
        if (fields[3] !== "") return { status: "gap" };
        continue;
      }
      if (
        fields[1] !== "event" ||
        Buffer.byteLength(fields[3], "utf8") >
          (this.options.maxEventBytes ?? 8192)
      )
        return { status: "gap" };
      try {
        const parsed = eventSchema.safeParse(JSON.parse(fields[3]));
        if (!parsed.success) return { status: "gap" };
        events.push({ id: entry[0], event: parsed.data });
      } catch {
        return { status: "gap" };
      }
    }
    return { status: "available", events };
  }
}
