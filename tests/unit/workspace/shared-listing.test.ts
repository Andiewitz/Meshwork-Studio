import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { select } = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@services/workspace/db/connection", () => ({
  db: { select },
  pool: {},
}));
import { WorkspaceDatabaseStorage } from "@services/workspace/db/storage";
import { fetchWorkspaceOwners } from "@services/team/db/ownership-client";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv("INTERNAL_API_KEY", "node-key");
  vi.stubEnv("TEAM_SERVICE_URL", "http://team:5000");
  vi.stubEnv("WORKSPACE_SERVICE_URL", "http://workspace:5000");
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  fetchMock.mockReset();
});

describe("workspace listing dependency semantics", () => {
  it("accepts a genuinely empty shared list and still returns owned workspaces", async () => {
    fetchMock.mockResolvedValue(Response.json({ workspaceIds: [] }));
    const owned = [{ id: "owned", userId: "user", title: "Project" }];
    select.mockReturnValue({
      from: () => ({ where: () => ({ orderBy: async () => owned }) }),
    });
    await expect(
      new WorkspaceDatabaseStorage().getWorkspaces("user", null, "aabb-ccdd"),
    ).resolves.toEqual(owned);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://team:5000/internal/v1/team/users/user/shared-workspace-ids",
      expect.objectContaining({
        headers: { "X-Internal-Key": "node-key", "X-Request-Id": "aabb-ccdd" },
      }),
    );
  });

  it.each(["offline", "invalid"])(
    "does not return a misleading partial list when sharing is %s",
    async (failure) => {
      fetchMock.mockResolvedValue(
        failure === "offline"
          ? new Response("", { status: 503 })
          : Response.json({ workspaces: [] }),
      );
      await expect(
        new WorkspaceDatabaseStorage().getWorkspaces("user"),
      ).rejects.toMatchObject({ status: 503, service: "team" });
      expect(select).not.toHaveBeenCalled();
    },
  );

  it("does not treat an unavailable ownership source as missing ownership", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(
      fetchWorkspaceOwners(["project"], "aabb-ccdd"),
    ).rejects.toMatchObject({ status: 503, service: "workspace" });
  });
});
