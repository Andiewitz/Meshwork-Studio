import { describe, expect, it, vi } from "vitest";
import {
  errorBody,
  isPublicCode,
  resolvePublicCode,
} from "@server/lib/errorEnvelope";
import { requestIdMiddleware } from "@server/middleware/requestId";

describe("error envelope (additive: message text never changes)", () => {
  it("keeps message first and always carries a requestId", () => {
    const body = errorBody("Dial failed", "req-abc");
    expect(body.message).toBe("Dial failed");
    expect(body.requestId).toBe("req-abc");
    expect(body.code).toBeUndefined();
  });

  it("maps pg codes to public tokens, never leaks driver codes", () => {
    expect(resolvePublicCode("23505")).toEqual({
      status: 400,
      code: "DUPLICATE_VALUE",
    });
    expect(resolvePublicCode("23503")).toEqual({
      status: 400,
      code: "REFERENCE_NOT_FOUND",
    });
    expect(resolvePublicCode("22P02")).toEqual({
      status: 400,
      code: "INVALID_FORMAT",
    });
    expect(resolvePublicCode("UNAUTHENTICATED")).toEqual({
      code: "UNAUTHENTICATED",
    });
    // errno strings, pg codes with no mapping, non-strings: no public code
    expect(resolvePublicCode("ECONNREFUSED")).toEqual({});
    expect(resolvePublicCode("25P01")).toEqual({});
    expect(resolvePublicCode(undefined)).toEqual({});
  });

  it("rejects non-public code shapes", () => {
    expect(isPublicCode("RATE_LIMITED")).toBe(true);
    expect(isPublicCode("23505")).toBe(false);
    expect(isPublicCode("econnrefused")).toBe(false);
    expect(isPublicCode("")).toBe(false);
  });

  it("mints stable-format IDs and adopts inbound ones verbatim", async () => {
    const run = (headers: Record<string, string>) =>
      new Promise<{ id: string; echoed: string }>((resolve) => {
        const req = {
          get: (h: string) => headers[h.toLowerCase()],
        } as never;
        const res = {
          setHeader: (k: string, v: string) =>
            resolve({
              id: (req as { requestId: string }).requestId,
              echoed: `${k}=${v}`,
            }),
        } as never;
        requestIdMiddleware(req, res, () => {});
      });
    const minted = await run({});
    expect(minted.id).toMatch(/^req-[0-9a-f]{24}$/);
    expect(minted.echoed).toBe(`X-Request-Id=${minted.id}`);
    const adopted = await run({ "x-request-id": "req-from-upstream" });
    expect(adopted.id).toBe("req-from-upstream");
    expect(adopted.echoed).toBe("X-Request-Id=req-from-upstream");
  });

  it("ignores a stub transport (sanity: middleware calls next)", () => {
    const next = vi.fn();
    requestIdMiddleware(
      { get: () => undefined } as never,
      {
        setHeader: () => {},
      } as never,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
