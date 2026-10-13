import { describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { requestIdMiddleware } from "@server/middleware/requestId";
import { requireAuth } from "../../../server/auth/middleware";

function buildApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use(cookieParser());
  app.use(requireAuth);
  app.get("/probe", (req, res) => res.json({ ok: true, user: req.user }));
  return app;
}

describe("requireAuth 401 codes (regression: misleading toasts)", () => {
  it("NO_SESSION when the browser sent no credentials at all", async () => {
    const res = await request(buildApp()).get("/probe");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("NO_SESSION");
    expect(res.body.message).toBe("Authentication required");
    expect(res.body.requestId).toMatch(/^req-[0-9a-f]{24}$/);
  });

  it("SESSION_EXPIRED when credentials exist but are rejected", async () => {
    // Garbage session cookie: no live auth service in tests, so the
    // introspect fallback fails closed exactly like a dead session.
    const res = await request(buildApp())
      .get("/probe")
      .set("Cookie", "__Host-meshwork_session=dead-token-value");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_EXPIRED");
    expect(res.body.message).toContain("log in again");
  });
});
