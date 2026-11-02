import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

const mocks = vi.hoisted(() => ({
  getWorkspacesByIds: vi.fn(),
  getWorkspaceAccess: vi.fn(),
  getWorkspaceAccessVersion: vi.fn(),
}));

vi.mock("@services/workspace/db/storage", () => ({
  workspaceStorage: {
    getWorkspacesByIds: mocks.getWorkspacesByIds,
    getWorkspaceAccess: mocks.getWorkspaceAccess,
    getWorkspaceAccessVersion: mocks.getWorkspaceAccessVersion,
  },
}));

import { registerWorkspaceInternalRoutes } from "@services/workspace/db/internal-routes";

describe("GET /internal/v1/workspace/lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_KEY = "test-key";
  });

  it("batches unique ids and preserves request order", async () => {
    const app = express();
    registerWorkspaceInternalRoutes(app);
    mocks.getWorkspacesByIds.mockResolvedValueOnce([
      { id: "ws1", userId: "u1", title: "One" },
      { id: "ws2", userId: "u2", title: "Two" },
    ]);

    const res = await request(app)
      .get("/internal/v1/workspace/lookup?ids=ws2,missing,ws1,ws2")
      .set("X-Internal-Key", "test-key");

    expect(res.status).toBe(200);
    expect(mocks.getWorkspacesByIds).toHaveBeenCalledTimes(1);
    expect(mocks.getWorkspacesByIds).toHaveBeenCalledWith([
      "ws2",
      "missing",
      "ws1",
    ]);
    expect(res.body.workspaces).toEqual([
      { id: "ws2", ownerId: "u2", title: "Two" },
      { id: "ws1", ownerId: "u1", title: "One" },
    ]);
  });

  it("rejects a missing internal key", async () => {
    const app = express();
    registerWorkspaceInternalRoutes(app);

    const res = await request(app).get("/internal/v1/workspace/lookup?ids=ws1");

    expect(res.status).toBe(404);
    expect(mocks.getWorkspacesByIds).not.toHaveBeenCalled();
  });
});

describe("Workspace access internal contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_KEY = "test-key";
  });
  it.each(["owner", "edit", "view", "none"])(
    "returns %s from Workspace",
    async (access) => {
      const app = express();
      registerWorkspaceInternalRoutes(app);
      mocks.getWorkspaceAccess.mockResolvedValueOnce(access);
      const res = await request(app)
        .get("/internal/v1/workspace/access?workspaceId=w1&userId=u1")
        .set("X-Internal-Key", "test-key");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ access });
      expect(mocks.getWorkspaceAccess).toHaveBeenCalledWith("w1", "u1");
    },
  );
  it("rejects missing credentials and invalid requests before lookup", async () => {
    const app = express();
    registerWorkspaceInternalRoutes(app);
    expect(
      (
        await request(app).get(
          "/internal/v1/workspace/access?workspaceId=w1&userId=u1",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get("/internal/v1/workspace/access?workspaceId=w1")
          .set("X-Internal-Key", "test-key")
      ).status,
    ).toBe(400);
    expect(mocks.getWorkspaceAccess).not.toHaveBeenCalled();
  });
});

describe("Workspace access version internal contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_KEY = "test-key";
  });
  it("returns a versioned access decision without changing the existing access endpoint", async () => {
    const app = express();
    registerWorkspaceInternalRoutes(app);
    mocks.getWorkspaceAccessVersion.mockResolvedValueOnce({
      access: "view",
      epoch: "42",
    });
    const result = await request(app)
      .get("/internal/v1/workspace/access-version?workspaceId=w1&userId=u1")
      .set("X-Internal-Key", "test-key");
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ access: "view", epoch: "42" });
  });
  it("fails closed on missing credentials, malformed input, or database errors", async () => {
    const app = express();
    registerWorkspaceInternalRoutes(app);
    expect(
      (
        await request(app).get(
          "/internal/v1/workspace/access-version?workspaceId=w1&userId=u1",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get("/internal/v1/workspace/access-version?workspaceId=w1")
          .set("X-Internal-Key", "test-key")
      ).status,
    ).toBe(400);
    mocks.getWorkspaceAccessVersion.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    const result = await request(app)
      .get("/internal/v1/workspace/access-version?workspaceId=w1&userId=u1")
      .set("X-Internal-Key", "test-key");
    expect(result.status).toBeGreaterThanOrEqual(500);
  });
});
