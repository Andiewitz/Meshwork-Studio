import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { requestIdMiddleware } from "@server/middleware/requestId";

vi.mock("@services/metrics/db/storage", () => ({
  getMetricsHistory: vi.fn(async () => []),
  getMetricsSummary: vi.fn(async () => ({ totalRequests: 1 })),
  cleanupOldSnapshots: vi.fn(async () => 0),
}));

vi.mock("../../../server/auth", async () => {
  const actual = await vi.importActual<typeof import("../../../server/auth")>(
    "../../../server/auth",
  );
  return {
    ...actual,
    csrfProtect: (_req: any, _res: any, next: any) => next(),
    // metricsRoutes imports requireAuth directly (not via registry);
    // read the per-app flag so parallel apps don't share state.
    requireAuth: (req: any, res: any, next: any) => {
      const flag = req.app.get("testAdmin");
      if (flag === undefined) return res.status(401).json({ message: "nope" });
      req.user = { id: "u1", isAdmin: flag };
      next();
    },
  };
});

async function buildApp(isAdmin: boolean | undefined) {
  const { registerMetricsRoutes } =
    await import("@services/metrics/routes/metricsRoutes");
  const app = express();
  app.set("testAdmin", isAdmin);
  app.use(requestIdMiddleware);
  app.use(express.json());
  registerMetricsRoutes(app);
  return app;
}

describe("admin metrics surface (lockdown: admins only, JSON not text)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("live aggregates serve JSON with error split + uptime, no exposition text", async () => {
    const app = await buildApp(true);
    const res = await request(app).get("/api/v1/metrics/live");
    expect(res.status).toBe(200);
    expect(res.body.totalRequests).toEqual(expect.any(Number));
    expect(res.body.requests5xx).toEqual(expect.any(Number));
    expect(res.body.requests4xx).toEqual(expect.any(Number));
    expect(res.body.topEndpoints).toEqual(expect.any(Array));
    expect(res.body.startedAt).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toContain("# HELP");
  });

  it("non-admins get 404 (route existence hidden), anonymous 401", async () => {
    const userApp = await buildApp(false);
    const anonApp = await buildApp(undefined);
    expect((await request(userApp).get("/api/v1/metrics/live")).status).toBe(
      404,
    );
    expect((await request(userApp).get("/api/v1/metrics/summary")).status).toBe(
      404,
    );
    expect((await request(anonApp).get("/api/v1/metrics/live")).status).toBe(
      401,
    );
  });

  it("audit-lookup validates input and degrades to 503 without Go", async () => {
    const app = await buildApp(true);
    const bad = await request(app).get(
      "/api/v1/metrics/audit-lookup?requestId=***",
    );
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("VALIDATION_FAILED");
    // No auth service in tests → internal call fails closed, never 500s raw.
    const res = await request(app).get(
      "/api/v1/metrics/audit-lookup?requestId=7c77",
    );
    expect([200, 503]).toContain(res.status);
    if (res.status === 503) expect(res.body.code).toBe("AUDIT_UNAVAILABLE");
  });
});
