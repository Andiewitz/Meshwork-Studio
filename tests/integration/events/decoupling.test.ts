import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus, type DrizzleTx } from "@server/lib/events";
import { AppRegistry } from "@server/lib/registry";

/**
 * Integration Tests for EventBus & Decoupled Module Communication
 *
 * These tests verify that the EventBus correctly dispatches events
 * across service boundaries — the core mechanism that replaced
 * direct `import` coupling between Auth, Workspace, Canvas, and Team.
 *
 * Strategy: Instead of calling Service.initialize() (which also mounts
 * HTTP routes and requires a full Express app), we register event listeners
 * manually to test the EventBus plumbing in isolation.
 */

// ─── Hoisted mocks (vitest hoists vi.mock calls) ────────────────────

const { mockWorkspaceStorage, mockCanvasStorage, mockTeamStorage } = vi.hoisted(
  () => ({
    mockWorkspaceStorage: {
      deleteAllUserData: vi.fn().mockResolvedValue(undefined),
    },
    mockCanvasStorage: {
      deleteAllUserData: vi.fn().mockResolvedValue(undefined),
      syncCanvas: vi.fn().mockResolvedValue(undefined),
      duplicateCanvas: vi.fn().mockResolvedValue(undefined),
    },
    mockTeamStorage: {
      deleteAllUserData: vi.fn().mockResolvedValue(undefined),
    },
  }),
);

vi.mock("@services/workspace/db/storage", () => ({
  workspaceStorage: mockWorkspaceStorage,
  WorkspaceDatabaseStorage: vi
    .fn()
    .mockImplementation(() => mockWorkspaceStorage),
}));

vi.mock("@services/canvas/db/storage", () => ({
  canvasStorage: mockCanvasStorage,
  CanvasDatabaseStorage: vi.fn().mockImplementation(() => mockCanvasStorage),
}));

vi.mock("@services/team/db/storage", () => ({
  teamStorage: mockTeamStorage,
  TeamDatabaseStorage: vi.fn().mockImplementation(() => mockTeamStorage),
}));

// ─── Tests ──────────────────────────────────────────────────────────

describe("EventBus & Decoupling Integration Tests", () => {
  let eventBus: EventBus;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = new EventBus();
  });

  // ── user.deleted cascade ──────────────────────────────────────────

  describe("user.deleted event cascade", () => {
    beforeEach(() => {
      // Wire up listeners the same way WorkspaceService.initialize and
      // CanvasService.initialize do — but without HTTP routes.
      eventBus.on("user.deleted", async ({ id, tx }) => {
        await mockWorkspaceStorage.deleteAllUserData(id, tx);
      });
      eventBus.on("user.deleted", async ({ id, tx }) => {
        await mockCanvasStorage.deleteAllUserData(id, tx);
      });
      eventBus.on("user.deleted", async ({ id, tx }) => {
        await mockTeamStorage.deleteAllUserData(id, tx);
      });
    });

    it("should cascade user deletion to all dependent modules", async () => {
      const userId = "123";
      const mockTx = { transaction: "mock" } as unknown as DrizzleTx;

      await eventBus.emitAsync("user.deleted", { id: userId, tx: mockTx });

      expect(mockWorkspaceStorage.deleteAllUserData).toHaveBeenCalledTimes(1);
      expect(mockWorkspaceStorage.deleteAllUserData).toHaveBeenCalledWith(
        "123",
        mockTx,
      );

      expect(mockCanvasStorage.deleteAllUserData).toHaveBeenCalledTimes(1);
      expect(mockCanvasStorage.deleteAllUserData).toHaveBeenCalledWith(
        "123",
        mockTx,
      );

      expect(mockTeamStorage.deleteAllUserData).toHaveBeenCalledTimes(1);
      expect(mockTeamStorage.deleteAllUserData).toHaveBeenCalledWith(
        "123",
        mockTx,
      );
    });

    it("should pass tx=undefined when no transaction is provided", async () => {
      await eventBus.emitAsync("user.deleted", { id: "456" });

      expect(mockWorkspaceStorage.deleteAllUserData).toHaveBeenCalledWith(
        "456",
        undefined,
      );
      expect(mockCanvasStorage.deleteAllUserData).toHaveBeenCalledWith(
        "456",
        undefined,
      );
      expect(mockTeamStorage.deleteAllUserData).toHaveBeenCalledWith(
        "456",
        undefined,
      );
    });
  });

  // ── workspace.deleted cascade ─────────────────────────────────────

  describe("workspace.deleted event cascade", () => {
    beforeEach(() => {
      // Wire up the Canvas listener for workspace deletion
      eventBus.on("workspace.deleted", async ({ id }) => {
        await mockCanvasStorage.syncCanvas(id, [], []);
      });
    });

    it("should clear canvas data when a workspace is deleted", async () => {
      await eventBus.emitAsync("workspace.deleted", { id: 42 });

      expect(mockCanvasStorage.syncCanvas).toHaveBeenCalledTimes(1);
      expect(mockCanvasStorage.syncCanvas).toHaveBeenCalledWith(42, [], []);
    });
  });

  // ── workspace.duplicated cascade ──────────────────────────────────

  describe("workspace.duplicated event cascade", () => {
    beforeEach(() => {
      eventBus.on("workspace.duplicated", async ({ originalId, newId }) => {
        await mockCanvasStorage.duplicateCanvas(originalId, newId);
      });
    });

    it("should duplicate canvas data when a workspace is duplicated", async () => {
      await eventBus.emitAsync("workspace.duplicated", {
        originalId: 10,
        newId: 20,
      });

      expect(mockCanvasStorage.duplicateCanvas).toHaveBeenCalledTimes(1);
      expect(mockCanvasStorage.duplicateCanvas).toHaveBeenCalledWith(10, 20);
    });
  });

  // ── Error isolation ───────────────────────────────────────────────

  describe("Error isolation", () => {
    it("should not crash the emitter if one listener throws", async () => {
      eventBus.on("user.deleted", async () => {
        throw new Error("DB Connection lost");
      });
      eventBus.on("user.deleted", async ({ id }) => {
        await mockCanvasStorage.deleteAllUserData(id);
      });

      await expect(
        eventBus.emitAsync("user.deleted", { id: "999" }),
      ).rejects.toThrow("DB Connection lost");
    });
  });

  // ── Isolation between EventBus instances ──────────────────────────

  describe("Instance isolation", () => {
    it("should not leak listeners between separate EventBus instances", async () => {
      const bus1 = new EventBus();
      const bus2 = new EventBus();

      const listener1 = vi.fn();
      const listener2 = vi.fn();

      bus1.on("user.deleted", listener1);
      bus2.on("user.deleted", listener2);

      await bus1.emitAsync("user.deleted", { id: "1" });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  // ── Registry integration ──────────────────────────────────────────

  describe("AppRegistry + EventBus integration", () => {
    it("should compose a valid AppContext for module initialization", () => {
      const registry = new AppRegistry();
      registry.register("isAuthenticated", vi.fn());
      registry.register("teamStorage", mockTeamStorage);

      const context = { registry, eventBus };

      expect(context.registry.get("isAuthenticated")).toBeDefined();
      expect(context.registry.get("teamStorage")).toBe(mockTeamStorage);

      expect(typeof context.eventBus.on).toBe("function");
      expect(typeof context.eventBus.emitAsync).toBe("function");
    });

    it("should throw when retrieving an unregistered service", () => {
      const registry = new AppRegistry();
      expect(() => registry.get("nonexistent")).toThrow(
        "Service nonexistent not found",
      );
    });

    it("should throw when registering a duplicate service", () => {
      const registry = new AppRegistry();
      registry.register("auth", vi.fn());
      expect(() => registry.register("auth", vi.fn())).toThrow(
        "already registered",
      );
    });
  });
});
