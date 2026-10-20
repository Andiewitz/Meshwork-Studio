import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

const mocks = vi.hoisted(() => ({
  getWorkspacesByIds: vi.fn(),
}));

vi.mock("@services/workspace/db/storage", () => ({
  workspaceStorage: {
    getWorkspacesByIds: mocks.getWorkspacesByIds,
  },
}));

import { registerWorkspaceInternalRoutes } from "@services/workspace/db/internal-routes";

describe("GET /internal/workspaces/lookup", () => {
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
      .get("/internal/workspaces/lookup?ids=ws2,missing,ws1,ws2")
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

    const res = await request(app).get("/internal/workspaces/lookup?ids=ws1");

    expect(res.status).toBe(404);
    expect(mocks.getWorkspacesByIds).not.toHaveBeenCalled();
  });
});
