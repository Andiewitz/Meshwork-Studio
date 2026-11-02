import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { RedisReplayLog } from "@services/collaboration/websocket/replay-log";

const run = "a".repeat(40);
function fake() {
  const redis = {
    info: vi.fn().mockResolvedValue(`redis_version:7\r\nrun_id:${run}\r\n`),
    eval: vi.fn(),
  };
  return {
    redis,
    log: new RedisReplayLog(redis),
  };
}
describe("bounded replay log", () => {
  it("stores checkpoints with bounded retention and hashes workspace keys", async () => {
    const { redis, log } = fake();
    redis.eval.mockResolvedValue("1-0");
    expect(await log.checkpoint("workspace")).toEqual({
      id: "1-0",
      incarnation: run,
    });
    const args = redis.eval.mock.calls[0];
    expect(args[2]).toMatch(/^realtime:replay:[a-f0-9]{64}$/);
    expect(args[2]).not.toContain("workspace");
    expect(args.slice(3)).toEqual([128, 300000, "checkpoint", ""]);
  });
  it("returns ordered events, ignoring checkpoints", async () => {
    const { redis, log } = fake();
    redis.eval.mockResolvedValue([
      1,
      [
        [
          "2-0",
          [
            "kind",
            "event",
            "payload",
            JSON.stringify({ type: "node-move", nodeId: "a" }),
          ],
        ],
        ["3-0", ["kind", "checkpoint", "payload", ""]],
        [
          "4-0",
          [
            "kind",
            "event",
            "payload",
            JSON.stringify({ type: "edges-change", changes: [] }),
          ],
        ],
      ],
    ]);
    expect(await log.readAfter("workspace", "1-0", run)).toEqual({
      status: "available",
      events: [
        { id: "2-0", event: { type: "node-move", nodeId: "a" } },
        { id: "4-0", event: { type: "edges-change", changes: [] } },
      ],
    });
  });
  it("returns a gap for missing anchors, invalid entries and redis restarts", async () => {
    const { redis, log } = fake();
    redis.eval
      .mockResolvedValueOnce([0])
      .mockResolvedValueOnce([1, [["2-0", ["kind", "gap", "payload", ""]]]])
      .mockResolvedValueOnce([
        1,
        [["2-0", ["kind", "event", "payload", "not-json"]]],
      ]);
    expect(await log.readAfter("workspace", "1-0", run)).toEqual({
      status: "gap",
    });
    expect(await log.readAfter("workspace", "1-0", run)).toEqual({
      status: "gap",
    });
    expect(await log.readAfter("workspace", "1-0", run)).toEqual({
      status: "gap",
    });
    redis.info
      .mockResolvedValueOnce(`run_id:${run}\r\n`)
      .mockResolvedValueOnce(`run_id:${"b".repeat(40)}\r\n`);
    redis.eval.mockResolvedValueOnce([1, []]);
    expect(await log.readAfter("workspace", "1-0", run)).toEqual({
      status: "gap",
    });
  });
  it("records a gap instead of retaining oversized changes and never hides Redis errors", async () => {
    const { redis, log } = fake();
    redis.eval.mockResolvedValueOnce("9-0");
    const result = await log.appendEvent("workspace", {
      type: "canvas-sync",
      payload: "x".repeat(9000),
    });
    expect(result).toEqual({ id: "9-0", incarnation: run, replayable: false });
    expect(redis.eval.mock.calls[0].slice(-2)).toEqual(["gap", ""]);
    redis.info.mockRejectedValueOnce(new Error("offline"));
    await expect(log.checkpoint("workspace")).rejects.toThrow("offline");
  });
  it("rejects duplicated or out-of-order stream entries", async () => {
    const { redis, log } = fake();
    const event = JSON.stringify({ type: "node-move", nodeId: "n" });
    redis.eval.mockResolvedValue([
      1,
      [
        ["3-0", ["kind", "event", "payload", event]],
        ["2-0", ["kind", "event", "payload", event]],
      ],
    ]);
    expect(await log.readAfter("workspace", "1-0", run)).toEqual({
      status: "gap",
    });
  });
});
