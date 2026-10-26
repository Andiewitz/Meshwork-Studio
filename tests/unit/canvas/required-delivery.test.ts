import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { EventBus } from "@server/lib/events";
import { createWorkspaceSummaryReader } from "@services/workspace/public";

const { deleteWorkspaces, duplicateCanvas, getWorkspace } = vi.hoisted(() => ({
  deleteWorkspaces: vi.fn(),
  duplicateCanvas: vi.fn(),
  getWorkspace: vi.fn(),
}));
vi.mock("@services/canvas/db/storage", () => ({
  canvasStorage: { deleteWorkspaces, duplicateCanvas },
}));
vi.mock("@services/canvas/db/dynamo", () => ({ ensureCanvasTable: vi.fn() }));
vi.mock("@services/canvas/routes/canvasRoutes", () => ({
  registerCanvasRoutes: vi.fn(),
}));
import { CanvasService } from "@services/canvas";

function wiredBus() {
  const eventBus = new EventBus();
  CanvasService.initialize(express(), {
    eventBus,
    isAuthenticated: (_req, _res, next) => next(),
    workspaces: createWorkspaceSummaryReader({ getWorkspace }),
    teamAccess: {
      checkAccess: async () => ({ status: "denied" }),
      lookupRole: async () => ({ status: "missing" }),
    },
  });
  return eventBus;
}

beforeEach(() => {
  vi.resetAllMocks();
  deleteWorkspaces.mockResolvedValue(undefined);
  duplicateCanvas.mockResolvedValue(undefined);
  getWorkspace.mockResolvedValue({ canvasCopyStatus: "copying" });
});

describe("Canvas required delivery owner", () => {
  it("confirms cleanup only after the actual write settles, and supports delete replay", async () => {
    const bus = wiredBus();
    let finish!: () => void;
    deleteWorkspaces.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const completed = vi.fn();
    const run = bus
      .executeRequired("workspace.deleted", { id: "ws" }, { operationId: "op" })
      .then(completed);
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    finish();
    await run;
    expect(completed).toHaveBeenCalledWith({
      operationId: "op",
      status: "completed",
    });
    await bus.executeRequired(
      "workspace.deleted",
      { id: "ws" },
      { operationId: "op" },
    );
    expect(deleteWorkspaces).toHaveBeenCalledTimes(2);
  });

  it("does not swallow storage failure or produce a completion receipt", async () => {
    const bus = wiredBus();
    deleteWorkspaces.mockRejectedValue(new Error("incomplete Dynamo write"));
    await expect(
      bus.executeRequired(
        "workspaces.deleted",
        { ids: ["ws"] },
        { operationId: "op" },
      ),
    ).rejects.toThrow("incomplete Dynamo write");
  });

  it("confirms a copy only after storage finishes", async () => {
    const bus = wiredBus();
    await expect(
      bus.executeRequired(
        "workspace.duplicated",
        { originalId: "src", newId: "dest" },
        { operationId: "copy-op" },
      ),
    ).resolves.toEqual({ operationId: "copy-op", status: "completed" });
    expect(duplicateCanvas).toHaveBeenCalledWith("src", "dest", "copy-op");
  });

  it("does not reapply an obsolete copy to a ready or deleted destination", async () => {
    const bus = wiredBus();
    getWorkspace
      .mockResolvedValueOnce({ canvasCopyStatus: "ready" })
      .mockResolvedValueOnce(undefined);
    for (const operationId of ["ready-op", "deleted-op"]) {
      await expect(
        bus.executeRequired(
          "workspace.duplicated",
          { originalId: "src", newId: "dest" },
          { operationId },
        ),
      ).resolves.toEqual({ operationId, status: "completed" });
    }
    expect(duplicateCanvas).not.toHaveBeenCalled();
  });

  it("does not acknowledge a copy when Workspace is unavailable", async () => {
    const bus = wiredBus();
    getWorkspace.mockRejectedValueOnce(new Error("Workspace offline"));
    await expect(
      bus.executeRequired(
        "workspace.duplicated",
        { originalId: "src", newId: "dest" },
        { operationId: "copy-op" },
      ),
    ).rejects.toThrow("Workspace offline");
    expect(duplicateCanvas).not.toHaveBeenCalled();
  });
});
