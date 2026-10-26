import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  getIdentityStats,
  searchIdentityAudit,
} from "@server/auth/internal-client";
import { internalGet } from "@server/lib/internal";

const stats = {
  totalUsers: 19,
  newUsersToday: 2,
  activeUsers24h: 4,
  loginsToday: 6,
};
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("AUTH_INTERNAL_KEY", "identity-only-key");
  vi.stubEnv("INTERNAL_API_KEY", "different-node-key");
  vi.stubEnv("AUTH_SERVICE_URL", "");
  vi.stubEnv("TEAM_SERVICE_URL", "");
  vi.stubEnv("PORT", "5000");
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockReset();
});

describe("internal dependency clients", () => {
  it("uses Go's own default port/key and propagates the request ID", async () => {
    fetchMock.mockResolvedValue(Response.json(stats));
    await expect(getIdentityStats({ requestId: "aabb-1234" })).resolves.toEqual(
      stats,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8081/internal/stats/users",
      expect.objectContaining({
        headers: {
          "X-Internal-Key": "identity-only-key",
          "X-Request-Id": "aabb-1234",
        },
        redirect: "error",
      }),
    );
  });

  it("honors the Go URL override and validates a legitimate empty audit search", async () => {
    vi.stubEnv("AUTH_SERVICE_URL", "http://identity:8081/");
    fetchMock.mockResolvedValue(Response.json({ hits: [] }));
    await expect(
      searchIdentityAudit("ab-cd", { requestId: "trace" }),
    ).resolves.toEqual({ hits: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://identity:8081/internal/audit-search?request_id=ab-cd",
      expect.objectContaining({
        headers: {
          "X-Internal-Key": "identity-only-key",
          "X-Request-Id": "trace",
        },
      }),
    );
  });

  it("does not fall back to the Node credential when the auth key is absent", async () => {
    vi.stubEnv("AUTH_INTERNAL_KEY", "");
    await expect(getIdentityStats()).rejects.toMatchObject({
      status: 503,
      service: "auth",
      reason: "unconfigured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 500, 503])(
    "preserves upstream %i as a dependency failure without forwarding its body",
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response("secret upstream details", { status }),
      );
      await expect(getIdentityStats()).rejects.toMatchObject({
        status: 503,
        reason: "http",
        upstreamStatus: status,
      });
    },
  );

  it.each([
    {},
    { ...stats, totalUsers: "19" },
    { ...stats, totalUsers: -1 },
    { ...stats, totalUsers: 1.5 },
  ])("rejects a malformed stats response: %j", async (body) => {
    fetchMock.mockResolvedValue(Response.json(body));
    await expect(getIdentityStats()).rejects.toMatchObject({
      reason: "invalid_response",
    });
  });

  it("rejects invalid JSON and malformed audit hit objects", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not json"));
    await expect(getIdentityStats()).rejects.toMatchObject({
      reason: "invalid_response",
    });
    fetchMock.mockResolvedValueOnce(
      Response.json({ hits: [{ password: "never forward" }] }),
    );
    await expect(searchIdentityAudit("ab")).rejects.toMatchObject({
      reason: "invalid_response",
    });
  });

  it("sanitizes a transport failure", async () => {
    fetchMock.mockRejectedValue(new Error("credential=should-not-leak"));
    await expect(getIdentityStats()).rejects.toMatchObject({
      message: "auth dependency unavailable (transport)",
      reason: "transport",
    });
  });

  it("aborts a stalled fetch and clears its deadline", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const assertion = expect(
      getIdentityStats({ timeoutMs: 25 }),
    ).rejects.toMatchObject({ reason: "timeout" });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the deadline active through a stalled response body", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, init) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener("abort", () =>
                controller.error(new DOMException("aborted", "AbortError")),
              );
            },
          }),
        ),
      ),
    );
    const assertion = expect(
      getIdentityStats({ timeoutMs: 25 }),
    ).rejects.toMatchObject({ reason: "timeout" });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the Node key and namespaced path for domain calls", async () => {
    vi.stubEnv("PORT", "5100");
    fetchMock.mockResolvedValue(Response.json({ totalTeams: 7 }));
    await expect(
      internalGet(
        "team",
        "/internal/v1/team/stats",
        z.object({ totalTeams: z.number() }),
      ),
    ).resolves.toEqual({ totalTeams: 7 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:5100/internal/v1/team/stats",
      expect.objectContaining({
        headers: { "X-Internal-Key": "different-node-key" },
      }),
    );
  });
});
