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

describe("support IDs (quotable refs for users, greppable for support)", () => {
  it("derives XXXX-XXXX display form from request IDs", async () => {
    const { supportIdFrom } = await import("@/lib/error-utils");
    expect(supportIdFrom("req-7c778bb3b2d476bf24d89cef")).toBe("7C77-9CEF");
    expect(supportIdFrom("7c778bb3b2d476bf24d89cef")).toBe("7C77-9CEF");
    expect(supportIdFrom(undefined)).toBeUndefined();
    expect(supportIdFrom("garbage")).toBeUndefined();
    expect(supportIdFrom("req-short")).toBeUndefined();
  });

  it("appends the ref to toast text only when a request ID exists", async () => {
    const { formatUserErrorMessage, ApiError } =
      await import("@/lib/error-utils");
    const withId = new ApiError(500, "An unexpected error occurred", {
      code: "INTERNAL",
      requestId: "req-7c778bb3b2d476bf24d89cef",
    });
    expect(formatUserErrorMessage(withId)).toContain("(ref 7C77-9CEF)");
    const plain = new Error("boom");
    expect(formatUserErrorMessage(plain)).not.toContain("ref ");
  });
});

describe("payload-too-large detection (10MB upload vs 5mb limit)", () => {
  it("recognizes body-parser rejections and nothing else", async () => {
    const { isPayloadTooLarge } = await import("@server/lib/errorEnvelope");
    expect(isPayloadTooLarge({ type: "entity.too.large", status: 413 })).toBe(
      true,
    );
    expect(isPayloadTooLarge(new Error("boom"))).toBe(false);
    expect(isPayloadTooLarge({ code: "23505" })).toBe(false);
    expect(isPayloadTooLarge(undefined)).toBe(false);
  });

  it("tells the user plainly with a ref (not parser jargon)", async () => {
    const { formatUserErrorMessage, ApiError } =
      await import("@/lib/error-utils");
    const tooLarge = new ApiError(413, "request entity too large", {
      code: "PAYLOAD_TOO_LARGE",
      requestId: "req-aaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const text = formatUserErrorMessage(tooLarge);
    expect(text).not.toContain("entity");
    expect(text).toContain("(ref AAAA-AAAA)");
  });
});

describe("unprocessable imports (422 with guidance, not jargon)", () => {
  it("prefers the server's specific 422 text", async () => {
    const { formatUserErrorMessage, ApiError } =
      await import("@/lib/error-utils");
    const notCanvas = new ApiError(
      422,
      "That file doesn't look like a canvas — it needs a nodes list and an edges list.",
      { code: "NOT_A_CANVAS_FILE", requestId: "req-bbbbbbbbbbbbbbbbbbbbbbbb" },
    );
    const text = formatUserErrorMessage(notCanvas);
    expect(text).toContain("doesn't look like a canvas");
    expect(text).toContain("(ref BBBB-BBBB)");
  });
});

describe("session-expired guidance (regression: misleading 401 toast)", () => {
  it("tells expired sessions to log in again, not to retype passwords", async () => {
    const { formatUserErrorMessage, ApiError } =
      await import("@/lib/error-utils");
    const expired = new ApiError(401, "Session expired or invalid.", {
      code: "SESSION_EXPIRED",
      requestId: "req-cccccccccccccccccccccccc",
    });
    expect(formatUserErrorMessage(expired)).toContain(
      "Your session expired. Please log in again.",
    );
    const badPassword = new ApiError(401, "Password incorrect", {
      code: "INVALID_CREDENTIALS",
    });
    expect(formatUserErrorMessage(badPassword)).toContain(
      "Invalid email or password",
    );
  });
});
