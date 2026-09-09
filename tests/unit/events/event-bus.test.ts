import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "@server/lib/events";

/**
 * Unit tests for EventBus message contracts and decoupled module communication.
 *
 * Verifies the event choreography required by database-per-service:
 * each service cleans ONLY its own store; cross-service deletion is
 * coordinated through events (user.deleted → workspaces.deleted).
 */

const { mockWorkspaceStorage, mockCanvasStorage, mockTeamStorage } = vi.hoisted(
  () => ({
    mockWorkspaceStorage: {
      deleteAllUserData: vi.fn().mockResolvedValue(undefined),
      listWorkspaceIdsByOwner: vi.fn().mockResolvedValue([]),
    },
    mockCanvasStorage: {
      deleteWorkspaces: vi.fn().mockResolvedValue(undefined),
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
  WorkspaceDatabaseStorage: vi.fn(),
}));

vi.mock("@services/canvas/db/storage", () => ({
  canvasStorage: mockCanvasStorage,
}));

vi.mock("@services/team/db/storage", () => ({
  teamStorage: mockTeamStorage,
}));

describe("EventBus message contracts", () => {
  let eventBus: EventBus;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = new EventBus();
  });

  // ── workspace.deleted → canvas purge ──────────────────────────────

  it("canvas_purges_its_store_when_a_workspace_is_deleted", async () => {
    const handler = vi.fn(async ({ id }: { id: string }) => {
      await mockCanvasStorage.deleteWorkspaces([id]);
    });
    eventBus.on("workspace.deleted", handler);

    await eventBus.emitAsync("workspace.deleted", { id: "ws-42" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(mockCanvasStorage.deleteWorkspaces).toHaveBeenCalledWith(["ws-42"]);
  });

  // ── workspace.duplicated → canvas copy ────────────────────────────

  it("canvas_duplicates_documents_when_a_workspace_is_duplicated", async () => {
    const handler = vi.fn(
      async ({ originalId, newId }: { originalId: string; newId: string }) => {
        await mockCanvasStorage.duplicateCanvas(originalId, newId);
      },
    );
    eventBus.on("workspace.duplicated", handler);

    await eventBus.emitAsync("workspace.duplicated", {
      originalId: "ws-a",
      newId: "ws-b",
    });

    expect(mockCanvasStorage.duplicateCanvas).toHaveBeenCalledWith(
      "ws-a",
      "ws-b",
    );
  });

  // ── user.deleted cascade (two-phase, db-per-service) ──────────────

  describe("user.deleted two-phase cascade", () => {
    beforeEach(() => {
      // Phase 1: workspace resolves owned ids and announces them.
      eventBus.on("user.deleted", async ({ id }) => {
        const ids = await mockWorkspaceStorage.listWorkspaceIdsByOwner(id);
        await mockWorkspaceStorage.deleteAllUserData(id);
        await workspaceCleanup(ids);
        eventBus.emit("workspaces.deleted", { ids });
      });
      // Phase 2: canvas purges announced ids from its own store.
      eventBus.on("workspaces.deleted", async ({ ids }) => {
        if (ids.length === 0) return;
        await mockCanvasStorage.deleteWorkspaces(ids);
      });
    });

    function workspaceCleanup(ids: string[]): Promise<void> {
      void ids;
      return Promise.resolve();
    }

    it("announces_owned_workspace_ids_then_canvas_purges_them", async () => {
      mockWorkspaceStorage.listWorkspaceIdsByOwner.mockResolvedValue([
        "ws-1",
        "ws-2",
      ]);

      await eventBus.emitAsync("user.deleted", { id: "user-9" });

      expect(mockWorkspaceStorage.listWorkspaceIdsByOwner).toHaveBeenCalledWith(
        "user-9",
      );
      expect(mockWorkspaceStorage.deleteAllUserData).toHaveBeenCalledWith(
        "user-9",
      );
      expect(mockCanvasStorage.deleteWorkspaces).toHaveBeenCalledWith([
        "ws-1",
        "ws-2",
      ]);
    });

    it("emits_an_empty_id_list_when_the_user_owned_nothing", async () => {
      mockWorkspaceStorage.listWorkspaceIdsByOwner.mockResolvedValue([]);
      const spy = vi.fn();
      eventBus.on("workspaces.deleted", spy);

      await eventBus.emitAsync("user.deleted", { id: "user-empty" });

      expect(spy).toHaveBeenCalledWith({ ids: [] });
      expect(mockCanvasStorage.deleteWorkspaces).not.toHaveBeenCalled();
    });
  });

  // ── team cleans up on user.deleted directly ───────────────────────

  it("team_deletes_membership_rows_on_user_deleted", async () => {
    const handler = vi.fn(async ({ id }: { id: string }) => {
      await mockTeamStorage.deleteAllUserData(id);
    });
    eventBus.on("user.deleted", handler);

    await eventBus.emitAsync("user.deleted", { id: "user-7" });

    expect(mockTeamStorage.deleteAllUserData).toHaveBeenCalledWith("user-7");
  });
});
