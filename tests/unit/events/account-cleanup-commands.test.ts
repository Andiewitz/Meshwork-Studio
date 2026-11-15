import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "@server/lib/events";

const mocks = vi.hoisted(() => ({
  workspace: {
    getUserCleanupStatus: vi.fn(),
    deleteAllUserDataAndEnqueueCleanup: vi.fn(),
  },
  team: { deleteAllUserData: vi.fn() },
  aiCleanup: vi.fn(),
  outbox: { start: vi.fn(), wake: vi.fn(), stop: vi.fn() },
}));
vi.mock("@services/workspace/db/storage", () => ({
  workspaceStorage: mocks.workspace,
}));
vi.mock("@services/workspace/routes/workspaceRoutes", () => ({
  registerWorkspaceRoutes: vi.fn(),
}));
vi.mock("@services/workspace/db/internal-routes", () => ({
  registerWorkspaceInternalRoutes: vi.fn(),
}));
vi.mock("@services/workspace/outbox-service", () => ({
  workspaceOutbox: mocks.outbox,
}));
vi.mock("@services/team/db/storage", () => ({ teamStorage: mocks.team }));
vi.mock("@services/team/db/internal-routes", () => ({
  registerTeamInternalRoutes: vi.fn(),
}));
vi.mock("@services/ai/db/storage", () => ({
  deleteAllUserAiData: mocks.aiCleanup,
}));
vi.mock("@services/ai/routes/aiRoutes", () => ({
  createAIRoutes: () => express.Router(),
}));

import { WorkspaceService } from "@services/workspace";
import { TeamService } from "@services/team";
import { AIService } from "@services/ai";

describe("account cleanup service commands", () => {
  let bus: EventBus;
  let app: express.Express;
  const operationId = "bb58910d-3bf7-40cf-9cde-6f3992b09a33";
  beforeEach(() => {
    vi.resetAllMocks();
    bus = new EventBus();
    app = express();
    const context = {
      eventBus: bus,
      isAuthenticated: vi.fn(),
      directAccess: {} as never,
      workspaces: {} as never,
    };
    WorkspaceService.initialize(app, context);
    TeamService.initialize(app, context);
    AIService.initialize(app, context);
  });
  it("does not expose retired team routes while retaining cleanup", async () => {
    await request(app).get("/api/v1/teams").expect(404);
    await request(app).post("/api/v1/teams").expect(404);
    await request(app).get("/api/v1/workspaces/w/members").expect(404);
    await expect(
      bus.executeRequired(
        "account.cleanup.team",
        { userId: "user" },
        { operationId },
      ),
    ).resolves.toEqual({ operationId, status: "completed" });
    expect(mocks.team.deleteAllUserData).toHaveBeenCalledWith("user");
  });
  it("keeps workspace pending until canvas cleanup really completes", async () => {
    mocks.workspace.getUserCleanupStatus
      .mockResolvedValueOnce("not_found")
      .mockResolvedValueOnce("pending")
      .mockResolvedValueOnce("completed");
    mocks.workspace.deleteAllUserDataAndEnqueueCleanup.mockResolvedValue(["w"]);
    await expect(
      bus.executeRequired(
        "account.cleanup.workspace",
        { userId: "user" },
        { operationId },
      ),
    ).resolves.toEqual({ operationId, status: "published" });
    expect(
      mocks.workspace.deleteAllUserDataAndEnqueueCleanup,
    ).toHaveBeenCalledWith("user", operationId);
    expect(mocks.outbox.wake).toHaveBeenCalledOnce();
    await expect(
      bus.executeRequired(
        "account.cleanup.workspace",
        { userId: "user" },
        { operationId },
      ),
    ).resolves.toEqual({ operationId, status: "completed" });
    expect(
      mocks.workspace.deleteAllUserDataAndEnqueueCleanup,
    ).toHaveBeenCalledOnce();
  });
  it("propagates failures and returns receipts only after each owner finishes", async () => {
    mocks.workspace.getUserCleanupStatus.mockResolvedValue("failed");
    await expect(
      bus.executeRequired(
        "account.cleanup.workspace",
        { userId: "user" },
        { operationId },
      ),
    ).rejects.toThrow("failed");
    mocks.aiCleanup
      .mockRejectedValueOnce(new Error("AI unavailable"))
      .mockResolvedValueOnce(undefined);
    await expect(
      bus.executeRequired(
        "account.cleanup.ai",
        { userId: "user" },
        { operationId },
      ),
    ).rejects.toThrow("AI unavailable");
    await expect(
      bus.executeRequired(
        "account.cleanup.ai",
        { userId: "user" },
        { operationId },
      ),
    ).resolves.toEqual({ operationId, status: "completed" });
    mocks.team.deleteAllUserData.mockResolvedValue(undefined);
    await expect(
      bus.executeRequired(
        "account.cleanup.team",
        { userId: "user" },
        { operationId },
      ),
    ).resolves.toEqual({ operationId, status: "completed" });
  });
});
