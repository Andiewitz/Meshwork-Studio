import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { secureFetch } from "@/lib/secure-fetch";
import { getQueryFn } from "@/lib/queryClient";
import { bootToLogin } from "@/hooks/use-auth";

describe("Session Expiration & Auto-Logout Flow (Proactive Auth Architecture)", () => {
  let mockLocation: { href: string; pathname: string; search: string };

  beforeEach(() => {
    mockLocation = {
      href: "http://localhost:5000/workspace/123",
      pathname: "/workspace/123",
      search: "",
    };

    // Mock window in node environment
    vi.stubGlobal("window", {
      location: mockLocation,
    });

    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("bootToLogin exit door", () => {
    it("should redirect to /login with reason=session_expired and preserve current path on protected routes", () => {
      window.location.pathname = "/workspace/42";
      window.location.href = "http://localhost:5000/workspace/42";

      bootToLogin();

      expect(window.location.href).toBe(
        "/login?reason=session_expired&redirect=%2Fworkspace%2F42",
      );
    });

    it("should redirect to /login?reason=session_expired&redirect=/home when already on /login or /register", () => {
      window.location.pathname = "/login";
      window.location.href = "http://localhost:5000/login";

      bootToLogin();

      expect(window.location.href).toBe(
        "/login?reason=session_expired&redirect=%2Fhome",
      );
    });
  });

  describe("secureFetch behavior", () => {
    it("should return the Response directly without throwing or dispatching when 401 received", async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(
          new Response(JSON.stringify({ message: "Unauthorized" }), {
            status: 401,
          }),
        );
      });
      vi.stubGlobal("fetch", mockFetch);

      const response = await secureFetch("/api/v1/workspaces");

      expect(response.status).toBe(401);
    });
  });

  describe("queryClient 401 handling", () => {
    it("should throw error when getQueryFn receives 401 with on401='throw'", async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(
          new Response(JSON.stringify({ message: "Unauthorized" }), {
            status: 401,
          }),
        );
      });
      vi.stubGlobal("fetch", mockFetch);

      const queryFn = getQueryFn({ on401: "throw" });

      await expect(
        queryFn({
          queryKey: ["/api/v1/workspaces"],
          meta: undefined,
          signal: new AbortController().signal,
        } as any),
      ).rejects.toThrow();
    });

    it("should return null when getQueryFn receives 401 with on401='returnNull'", async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(
          new Response(JSON.stringify({ message: "Unauthorized" }), {
            status: 401,
          }),
        );
      });
      vi.stubGlobal("fetch", mockFetch);

      const queryFn = getQueryFn({ on401: "returnNull" });

      const result = await queryFn({
        queryKey: ["/api/v1/user/status"],
        meta: undefined,
        signal: new AbortController().signal,
      });

      expect(result).toBeNull();
    });
  });

  describe("Presence WebSocket unauthorized handling", () => {
    it("should invoke bootToLogin when presence error is Unauthorized", () => {
      window.location.pathname = "/workspace/99";
      window.location.href = "http://localhost:5000/workspace/99";

      const serverMsg = { type: "error", message: "Unauthorized" };

      // Simulate presence error handler
      if (
        serverMsg.message === "Unauthorized" ||
        serverMsg.message?.toLowerCase().includes("unauthorized") ||
        serverMsg.message?.toLowerCase().includes("expired")
      ) {
        bootToLogin();
      }

      expect(window.location.href).toBe(
        "/login?reason=session_expired&redirect=%2Fworkspace%2F99",
      );
    });
  });
});
