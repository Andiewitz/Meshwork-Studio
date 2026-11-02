import { createHash, randomUUID } from "node:crypto";
import Redis from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { RedisReplayLog } from "@services/collaboration/websocket/replay-log";

const url = process.env.REPLAY_TEST_REDIS_URL;
if (!url)
  throw new Error("REPLAY_TEST_REDIS_URL must name a disposable Redis server");
const redis = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 3000 });
const rooms: string[] = [];
function room() {
  const id = `replay-test-${randomUUID()}`;
  rooms.push(id);
  return id;
}
function key(id: string) {
  return `realtime:replay:${createHash("sha256").update(id).digest("hex")}`;
}

describe("Redis replay log", () => {
  afterAll(async () => {
    if (rooms.length) await redis.del(...rooms.map(key));
    await redis.quit();
  });
  it("replays ordered events and detects trimmed anchors", async () => {
    const id = room();
    const log = new RedisReplayLog(redis, { maxEntries: 3 });
    const anchor = await log.checkpoint(id);
    const first = await log.appendEvent(id, { type: "node-move", nodeId: "a" });
    const second = await log.appendEvent(id, {
      type: "edges-change",
      changes: [],
    });
    expect(await log.readAfter(id, anchor.id, anchor.incarnation)).toEqual({
      status: "available",
      events: [
        { id: first.id, event: { type: "node-move", nodeId: "a" } },
        { id: second.id, event: { type: "edges-change", changes: [] } },
      ],
    });
    await log.appendEvent(id, { type: "node-move", nodeId: "b" });
    expect(await log.readAfter(id, anchor.id, anchor.incarnation)).toEqual({
      status: "gap",
    });
  });
  it("marks oversized entries and expired streams as gaps", async () => {
    const id = room();
    const log = new RedisReplayLog(redis, { maxEventBytes: 64, ttlMs: 300 });
    const anchor = await log.checkpoint(id);
    expect(
      (
        await log.appendEvent(id, {
          type: "canvas-sync",
          payload: "x".repeat(100),
        })
      ).replayable,
    ).toBe(false);
    expect(await log.readAfter(id, anchor.id, anchor.incarnation)).toEqual({
      status: "gap",
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(await log.readAfter(id, anchor.id, anchor.incarnation)).toEqual({
      status: "gap",
    });
  });
});
