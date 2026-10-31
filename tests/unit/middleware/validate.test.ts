import { describe, it, expect, vi } from "vitest";
import { validate } from "../../../server/middleware/validate";
import { z } from "zod";

describe("Validation Middleware", () => {
  it("should pass when body matches schema", () => {
    const schema = z.object({ name: z.string() });
    const middleware = validate({ body: schema });

    const req = { body: { name: "Test" } } as any;
    const res = {} as any;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: "Test" });
  });

  it("should fail when body does not match schema", () => {
    const schema = z.object({ name: z.string() });
    const middleware = validate({ body: schema });

    const req = { body: { age: 25 } } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "VALIDATION_FAILED",
        message: expect.stringContaining("name: Required"),
        issues: expect.arrayContaining([
          expect.objectContaining({
            path: "name",
            message: "Required",
          }),
        ]),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should validate query parameters", () => {
    const schema = z.object({ id: z.string() });
    const middleware = validate({ query: schema });

    const req = { query: { id: "123" } } as any;
    const res = {} as any;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.query).toEqual({ id: "123" });
  });

  it("should validate path parameters", () => {
    const schema = z.object({ userId: z.string() });
    const middleware = validate({ params: schema });

    const req = { params: { userId: "u1" } } as any;
    const res = {} as any;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.params).toEqual({ userId: "u1" });
  });

  it("should call next with error if non-Zod error occurs", () => {
    const brokenSchema = {
      parse: () => {
        throw new Error("Database offline");
      },
    } as any;
    const middleware = validate({ body: brokenSchema });

    const req = { body: {} } as any;
    const res = {} as any;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
