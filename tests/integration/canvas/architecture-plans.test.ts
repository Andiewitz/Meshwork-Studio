import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { ArchitectureArtifactStore } from "@services/canvas/db/architecture-artifacts";
vi.mock("../../../server/auth", () => ({
  csrfProtect: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
import { registerArchitectureArtifactRoutes } from "@services/canvas/routes/architectureArtifactRoutes";

const input = {
  prompt: "Plan an API",
  baseSnapshot: "{}",
  plan: {
    title: "API",
    summary: "A small API",
    assumptions: [],
    risks: [],
    components: [{ id: "api", type: "server", label: "API" }],
    connections: [],
  },
};
function app(store: ArchitectureArtifactStore) {
  const instance = express();
  instance.use(express.json());
  registerArchitectureArtifactRoutes(
    instance,
    {
      isAuthenticated: (req, _res, next) => {
        req.user = {
          id: String(req.headers["x-test-user"]),
        } as typeof req.user;
        next();
      },
      workspaces: {
        lookup: async (id) =>
          id === "missing"
            ? { status: "missing" }
            : { status: "found", value: { id, userId: "owner" } },
      },
      directAccess: {
        getAccess: async (_id, user) => ({
          status: "available",
          value:
            user === "editor" ? "edit" : user === "viewer" ? "view" : "none",
        }),
      },
    },
    store,
  );
  return instance;
}
describe("architecture plan authorization", () => {
  it("allows editors to save, viewers to read, and denies outsiders and viewer writes", async () => {
    const store: ArchitectureArtifactStore = {
      create: vi.fn(async (_id, value) => ({
        ...value,
        id: "plan",
        createdAt: "now",
        markdown: "plan",
      })),
      list: vi.fn(async () => []),
      get: vi.fn(async () => null),
      purge: vi.fn(async () => {}),
    };
    const server = app(store);
    const url = "/api/v1/workspaces/p/architecture-plans";
    expect(
      (await request(server).post(url).set("x-test-user", "editor").send(input))
        .status,
    ).toBe(201);
    expect(
      (await request(server).get(url).set("x-test-user", "viewer")).status,
    ).toBe(200);
    expect(
      (await request(server).post(url).set("x-test-user", "viewer").send(input))
        .status,
    ).toBe(403);
    expect(
      (await request(server).get(url).set("x-test-user", "stranger")).status,
    ).toBe(403);
    expect(
      (
        await request(server)
          .post(url)
          .set("x-test-user", "owner")
          .send({ ...input, plan: {} })
      ).status,
    ).toBe(400);
    expect(store.create).toHaveBeenCalledTimes(1);
  });
  it("reports storage failures without pretending a plan was saved", async () => {
    const store: ArchitectureArtifactStore = {
      create: vi.fn(async () => {
        throw new Error("private server detail");
      }),
      list: vi.fn(async () => []),
      get: vi.fn(async () => null),
      purge: vi.fn(async () => {}),
    };
    const response = await request(app(store))
      .post("/api/v1/workspaces/p/architecture-plans")
      .set("x-test-user", "owner")
      .send(input);
    expect(response.status).toBe(503);
    expect(response.body.message).not.toContain("private server detail");
  });
});
