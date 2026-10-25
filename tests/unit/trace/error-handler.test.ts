import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiErrorHandler,
  apiNotFoundHandler,
} from "@server/middleware/errorHandler";
import { requestIdMiddleware } from "@server/middleware/requestId";

function appUnderTest() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "1kb" }));

  app.post("/pg", () => {
    throw Object.assign(new Error("duplicate key"), { code: "23505" });
  });
  app.post("/status", () => {
    throw Object.assign(new Error("short and stout"), { status: 418 });
  });
  app.post("/boom", () => {
    throw new Error("internal detail that must not leak");
  });

  app.use("/api", apiNotFoundHandler);
  app.use(apiErrorHandler);
  return app;
}

describe("global error boundary (one envelope for every failure)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes malformed JSON into INVALID_JSON with a request ID", async () => {
    const res = await request(appUnderTest())
      .post("/boom")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_JSON");
    expect(res.body.requestId).toMatch(/^req-[0-9a-f]{24}$/);
    expect(res.headers["x-request-id"]).toBe(res.body.requestId);
  });

  it("normalizes oversized bodies into PAYLOAD_TOO_LARGE", async () => {
    const res = await request(appUnderTest())
      .post("/boom")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ blob: "x".repeat(2048) }));

    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(res.body.requestId).toBeTruthy();
  });

  it("maps pg unique violations to 409 DUPLICATE_VALUE, not a driver code", async () => {
    const res = await request(appUnderTest()).post("/pg").send({});

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DUPLICATE_VALUE");
    expect(res.body.message).toContain("unique value");
    expect(JSON.stringify(res.body)).not.toContain("23505");
  });

  it("keeps actionable messages on 4xx and derives a code from the status", async () => {
    const res = await request(appUnderTest()).post("/status").send({});

    expect(res.status).toBe(418);
    expect(res.body.message).toBe("short and stout");
    expect(res.body.code).toBeUndefined();
    expect(res.body.requestId).toBeTruthy();
  });

  it("hides 5xx internals in production but keeps code + request ID", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await request(appUnderTest()).post("/boom").send({});

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL");
    expect(res.body.message).toBe("An unexpected error occurred");
    expect(res.body.requestId).toBeTruthy();
  });

  it("returns JSON 404 for unmatched API paths (never the SPA shell)", async () => {
    const res = await request(appUnderTest()).get("/api/v1/nope");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body.code).toBe("NOT_FOUND");
    expect(res.body.requestId).toBeTruthy();
  });
});
