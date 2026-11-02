import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "@server/lib/events";
import { registerAccountCleanupInternalRoutes } from "@server/lib/account-cleanup-internal";

const input = {
  operationId: "bb58910d-3bf7-40cf-9cde-6f3992b09a33",
  userId: "user",
  claimToken: "bb58910d-3bf7-40cf-9cde-6f3992b09a34",
  service: "workspace",
};
describe("internal account cleanup bridge", () => {
  const previousKey = process.env.INTERNAL_API_KEY;
  afterEach(() => {
    if (previousKey === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = previousKey;
  });
  it("requires the internal key and a current identity lease before dispatch", async () => {
    process.env.INTERNAL_API_KEY = "node-key";
    const app = express();
    app.use(express.json());
    const bus = new EventBus();
    const owner = vi
      .fn()
      .mockResolvedValue({
        operationId: input.operationId,
        status: "published",
      });
    bus.registerRequired("account.cleanup.workspace", owner);
    const authorize = vi
      .fn()
      .mockResolvedValueOnce({ authorized: false })
      .mockResolvedValueOnce({ authorized: true });
    registerAccountCleanupInternalRoutes(app, bus, authorize);
    const call = () =>
      request(app).post("/internal/v1/account-cleanup/deliver");
    expect((await call().send(input)).status).toBe(404);
    expect(
      (
        await call()
          .set("X-Internal-Key", "node-key")
          .send({ ...input, claimToken: "bad" })
      ).status,
    ).toBe(400);
    expect(
      (await call().set("X-Internal-Key", "node-key").send(input)).status,
    ).toBe(403);
    expect(owner).not.toHaveBeenCalled();
    const success = await call().set("X-Internal-Key", "node-key").send(input);
    expect(success.status).toBe(200);
    expect(success.body).toEqual({
      operationId: input.operationId,
      status: "published",
    });
    expect(owner).toHaveBeenCalledWith(
      { userId: "user" },
      { operationId: input.operationId },
    );
  });
  it("fails closed without exposing dependency errors", async () => {
    process.env.INTERNAL_API_KEY = "node-key";
    const app = express();
    app.use(express.json());
    const bus = new EventBus();
    const authorize = vi
      .fn()
      .mockRejectedValue(new Error("private database detail"));
    registerAccountCleanupInternalRoutes(app, bus, authorize);
    const response = await request(app)
      .post("/internal/v1/account-cleanup/deliver")
      .set("X-Internal-Key", "node-key")
      .send(input);
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain(
      "private database detail",
    );
  });
});
