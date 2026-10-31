import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { select } = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@services/workspace/db/connection", () => ({
  db: { select },
  pool: {},
}));
import { WorkspaceDatabaseStorage } from "@services/workspace/db/storage";
import { workspaceOwnershipHttp } from "@services/team/adapters/workspace-http";

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
  it("lists owned and direct collaborator workspaces without calling Team", async () => {
    const rows = [
      { id: "owned", userId: "user", title: "Project" },
      { id: "shared", userId: "other", title: "Shared" },
    ];
    select.mockReturnValue({
      from: () => ({ where: () => ({ orderBy: async () => rows }) }),
    });
    await expect(
      new WorkspaceDatabaseStorage().getWorkspaces("user", null, "aabb-ccdd"),
    ).resolves.toEqual(rows);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not treat an unavailable ownership source as missing ownership", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(
      workspaceOwnershipHttp.lookupOwners(["project"], "aabb-ccdd"),
    ).resolves.toMatchObject({
      status: "unavailable",
      cause: { status: 503, service: "workspace" },
    });
  });
});
