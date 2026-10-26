import { describe, expect, it, vi } from "vitest";
import {
  createWorkspaceSummaryReader,
  getWorkspaceSummary,
} from "@services/workspace/public";
import { createTeamWorkspaceAccess } from "@services/team/public";
import { workspaceAccess } from "@server/lib/team-access";
import { copyWorkspaceCanvas } from "@services/canvas/copy-workspace";
import type {
  WorkspaceSummary,
  WorkspaceSummaryReader,
} from "@services/workspace/public";

describe("framework-free module capabilities", () => {
  it("projects a fresh summary without private repository fields or mutations", async () => {
    const row = {
      id: "ws",
      userId: "owner",
      canvasCopyStatus: "copying" as const,
      title: "Private",
      canvasCopySourceId: "secret",
    };
    const getWorkspace = vi.fn(async () => row);
    const reader = createWorkspaceSummaryReader({ getWorkspace });
    const result = await reader.lookup("ws");
    expect(getWorkspace).toHaveBeenCalledWith("ws");
    expect(Object.keys(reader)).toEqual(["lookup"]);
    expect(result).toEqual({
      status: "found",
      value: { id: "ws", userId: "owner", canvasCopyStatus: "copying" },
    });
    if (result.status === "found") expect(result.value).not.toBe(row);
  });

  it("distinguishes a missing workspace from an unavailable source", async () => {
    const cause = new Error("workspace database offline");
    const getWorkspace = vi
      .fn<() => Promise<WorkspaceSummary | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(cause);
    const reader = createWorkspaceSummaryReader({ getWorkspace });
    expect(await reader.lookup("missing")).toEqual({ status: "missing" });
    expect(await reader.lookup("offline")).toEqual({
      status: "unavailable",
      cause,
    });
    await expect(getWorkspaceSummary(reader, "offline")).rejects.toBe(cause);
  });

  it.each([true, false])(
    "keeps access %s explicit and preserves argument order",
    async (allowed) => {
      const canAccessWorkspace = vi.fn(async () => allowed);
      const getWorkspaceRole = vi.fn(async () => "editor" as const);
      const access = createTeamWorkspaceAccess({
        canAccessWorkspace,
        getWorkspaceRole,
      });
      expect(await access.checkAccess("user", "ws")).toEqual({
        status: allowed ? "allowed" : "denied",
      });
      expect(
        await workspaceAccess(access).canAccessWorkspace("user", "ws"),
      ).toBe(allowed);
      expect(canAccessWorkspace).toHaveBeenCalledWith("user", "ws");
      expect(getWorkspaceRole).not.toHaveBeenCalled();
      expect(Object.keys(access).sort()).toEqual(["checkAccess", "lookupRole"]);
    },
  );

  it("preserves roles without inferring them from read access", async () => {
    const getWorkspaceRole = vi.fn(async () => "viewer" as const);
    const canAccessWorkspace = vi.fn(async () => false);
    const access = createTeamWorkspaceAccess({
      canAccessWorkspace,
      getWorkspaceRole,
    });
    expect(await access.lookupRole("ws", "user")).toEqual({
      status: "found",
      value: "viewer",
    });
    expect(await workspaceAccess(access).getWorkspaceRole("ws", "user")).toBe(
      "viewer",
    );
    expect(getWorkspaceRole).toHaveBeenCalledWith("ws", "user");
    expect(canAccessWorkspace).not.toHaveBeenCalled();
  });

  it("represents no membership as missing, not a dependency error", async () => {
    const access = createTeamWorkspaceAccess({
      canAccessWorkspace: async () => false,
      getWorkspaceRole: async () => null,
    });
    expect(await access.lookupRole("ws", "user")).toEqual({
      status: "missing",
    });
    expect(
      await workspaceAccess(access).getWorkspaceRole("ws", "user"),
    ).toBeNull();
  });

  it("does not turn access/role outages into denial or an empty role", async () => {
    const cause = new Error("Team unavailable");
    const access = createTeamWorkspaceAccess({
      canAccessWorkspace: async () => {
        throw cause;
      },
      getWorkspaceRole: async () => {
        throw cause;
      },
    });
    expect(await access.checkAccess("user", "ws")).toEqual({
      status: "unavailable",
      cause,
    });
    expect(await access.lookupRole("ws", "user")).toEqual({
      status: "unavailable",
      cause,
    });
    await expect(
      workspaceAccess(access).canAccessWorkspace("user", "ws"),
    ).rejects.toBe(cause);
    await expect(
      workspaceAccess(access).getWorkspaceRole("ws", "user"),
    ).rejects.toBe(cause);
  });
});

describe("copy workspace canvas use case (no Express or database)", () => {
  it.each(["ready", "failed", "missing"] as const)(
    "acknowledges an obsolete %s destination without writing",
    async (state) => {
      const workspaces: WorkspaceSummaryReader = {
        lookup: async () =>
          state === "missing"
            ? { status: "missing" }
            : {
                status: "found",
                value: {
                  id: "target",
                  userId: "owner",
                  canvasCopyStatus: state,
                },
              },
      };
      const duplicateCanvas = vi.fn();
      expect(
        await copyWorkspaceCanvas(
          workspaces,
          { duplicateCanvas },
          "source",
          "target",
          "op",
        ),
      ).toBe("obsolete");
      expect(duplicateCanvas).not.toHaveBeenCalled();
    },
  );

  it("retries an unavailable Workspace rather than acknowledging missing data", async () => {
    const cause = new Error("offline");
    const workspaces: WorkspaceSummaryReader = {
      lookup: async () => ({ status: "unavailable", cause }),
    };
    const duplicateCanvas = vi.fn();
    await expect(
      copyWorkspaceCanvas(
        workspaces,
        { duplicateCanvas },
        "src",
        "target",
        "op",
      ),
    ).rejects.toBe(cause);
    expect(duplicateCanvas).not.toHaveBeenCalled();
  });

  it("awaits document persistence, forwarding the stable operation ID", async () => {
    const lookup = vi.fn<WorkspaceSummaryReader["lookup"]>(async () => ({
      status: "found",
      value: { id: "target", userId: "owner", canvasCopyStatus: "copying" },
    }));
    let finish!: () => void;
    const duplicateCanvas = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const settled = vi.fn();
    const run = copyWorkspaceCanvas(
      { lookup },
      { duplicateCanvas },
      "src",
      "target",
      "op",
    ).then(settled);
    await Promise.resolve();
    expect(lookup).toHaveBeenCalledWith("target");
    expect(duplicateCanvas).toHaveBeenCalledWith("src", "target", "op");
    expect(settled).not.toHaveBeenCalled();
    finish();
    await run;
    expect(settled).toHaveBeenCalledWith("completed");
  });

  it("does not acknowledge a failed or conflicting document write", async () => {
    const cause = new Error("copy locked");
    const workspaces: WorkspaceSummaryReader = {
      lookup: async () => ({
        status: "found",
        value: { id: "target", userId: "owner", canvasCopyStatus: "copying" },
      }),
    };
    await expect(
      copyWorkspaceCanvas(
        workspaces,
        {
          duplicateCanvas: async () => {
            throw cause;
          },
        },
        "src",
        "target",
        "op",
      ),
    ).rejects.toBe(cause);
  });
});
