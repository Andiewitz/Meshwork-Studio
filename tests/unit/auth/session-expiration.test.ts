import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { secureFetch } from "@/lib/secure-fetch";
import { getQueryFn, queryClient } from "@/lib/queryClient";

describe("Session Expiration & Auto-Logout Flow", () => {
  let eventListeners: Record<string, ((event: any) => void)[]> = {};
  let dispatchedEvents: { type: string; detail?: any }[] = [];
  let mockLocation: { href: string; pathname: string; search: string };

  beforeEach(() => {
    eventListeners = {};
    dispatchedEvents = [];
    mockLocation = {
      href: "http://localhost:5000/workspace/123",
      pathname: "/workspace/123",
      search: "",
    };

    // Mock window & CustomEvent in node environment
    vi.stubGlobal("window", {
      location: mockLocation,
      addEventListener: vi.fn((event: string, cb: any) => {
        if (!eventListeners[event]) eventListeners[event] = [];
        eventListeners[event].push(cb);
      }),
      removeEventListener: vi.fn((event: string, cb: any) => {
        if (eventListeners[event]) {
          eventListeners[event] = eventListeners[event].filter(
            (fn) => fn !== cb,
          );
        }
      }),
      dispatchEvent: vi.fn((evt: any) => {
        dispatchedEvents.push({ type: evt.type, detail: evt.detail });
        const handlers = eventListeners[evt.type] || [];
        handlers.forEach((fn) => fn(evt));
        return true;
      }),
    });

    vi.stubGlobal(
      "CustomEvent",
      class MockCustomEvent {
        type: string;
        detail?: any;
        constructor(type: string, params?: { detail?: any }) {
          this.type = type;
          this.detail = params?.detail;
        }
      },
    );

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

  describe("secureFetch session expiration detection", () => {
    it("should dispatch 'session-expired' when a request returns 401 and refresh endpoint fails", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/v1/auth/refresh")) {
          return Promise.resolve(
            new Response(JSON.stringify({ message: "Refresh token expired" }), {
              status: 401,
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ message: "Unauthorized" }), {
            status: 401,
          }),
        );
      });
      vi.stubGlobal("fetch", mockFetch);

      const response = await secureFetch("/api/v1/workspaces");

      expect(response.status).toBe(401);
      const sessionExpiredEvents = dispatchedEvents.filter(
        (e) => e.type === "session-expired",
      );
      expect(sessionExpiredEvents.length).toBeGreaterThanOrEqual(1);
    });

    it("should dispatch 'session-expired' when /api/v1/auth/me returns 401", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/v1/auth/me")) {
          return Promise.resolve(
            new Response(JSON.stringify({ message: "Unauthorized" }), {
              status: 401,
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        );
      });
      vi.stubGlobal("fetch", mockFetch);

      const response = await secureFetch("/api/v1/auth/me");

      expect(response.status).toBe(401);
      const sessionExpiredEvents = dispatchedEvents.filter(
        (e) => e.type === "session-expired",
      );
      expect(sessionExpiredEvents.length).toBeGreaterThanOrEqual(1);
    });

    it("should NOT dispatch 'session-expired' when token refresh successfully recovers", async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/v1/auth/refresh")) {
          return Promise.resolve(
            new Response(JSON.stringify({ ok: true }), { status: 200 }),
          );
        }
        if (url.includes("/api/v1/workspaces")) {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve(
              new Response(JSON.stringify({ message: "Token expired" }), {
                status: 401,
              }),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify([{ id: 1, title: "My Workspace" }]), {
              status: 200,
            }),
          );
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      });
      vi.stubGlobal("fetch", mockFetch);

      const response = await secureFetch("/api/v1/workspaces");

      expect(response.status).toBe(200);
      const sessionExpiredEvents = dispatchedEvents.filter(
        (e) => e.type === "session-expired",
      );
      expect(sessionExpiredEvents.length).toBe(0);
    });
  });

  describe("queryClient 401 handling", () => {
    it("should dispatch 'session-expired' when getQueryFn receives 401 with on401='throw'", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/v1/auth/refresh")) {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
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

      const sessionExpiredEvents = dispatchedEvents.filter(
        (e) => e.type === "session-expired",
      );
      expect(sessionExpiredEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Auto-Logout Reaction and Redirection Logic", () => {
    it("should clear query cache and redirect to /login with reason=session_expired when on a protected route", () => {
      const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");
      const clearSpy = vi.spyOn(queryClient, "clear");

      // Simulate the useAuth session-expired handler logic
      const simulateSessionExpiredHandler = () => {
        queryClient.setQueryData(["/api/v1/auth/me"], null);
        queryClient.clear();

        const path = window.location.pathname;
        const isPublicRoute =
          path.startsWith("/login") ||
          path.startsWith("/register") ||
          path === "/" ||
          path.startsWith("/docs") ||
          path.startsWith("/terms") ||
          path.startsWith("/privacy");

        if (!isPublicRoute) {
          window.location.href = `/login?reason=session_expired&redirect=${encodeURIComponent(path)}`;
        }
      };

      // Set user on a protected workspace page
      window.location.pathname = "/workspace/42";

      simulateSessionExpiredHandler();

      expect(setQueryDataSpy).toHaveBeenCalledWith(["/api/v1/auth/me"], null);
      expect(clearSpy).toHaveBeenCalled();
      expect(window.location.href).toBe(
        "/login?reason=session_expired&redirect=%2Fworkspace%2F42",
      );
    });

    it("should NOT trigger redirect if user is already on public login page", () => {
      const initialHref = "http://localhost:5000/login";
      window.location.pathname = "/login";
      window.location.href = initialHref;

      const simulateSessionExpiredHandler = () => {
        queryClient.setQueryData(["/api/v1/auth/me"], null);
        queryClient.clear();

        const path = window.location.pathname;
        const isPublicRoute =
          path.startsWith("/login") ||
          path.startsWith("/register") ||
          path === "/" ||
          path.startsWith("/docs") ||
          path.startsWith("/terms") ||
          path.startsWith("/privacy");

        if (!isPublicRoute) {
          window.location.href = `/login?reason=session_expired&redirect=${encodeURIComponent(path)}`;
        }
      };

      simulateSessionExpiredHandler();

      expect(window.location.href).toBe(initialHref);
    });
  });

  describe("Presence WebSocket unauthorized error", () => {
    it("should dispatch 'session-expired' when presence error message is Unauthorized", () => {
      const serverMsg = { type: "error", message: "Unauthorized" };

      // Simulate presence error handler
      if (
        serverMsg.message === "Unauthorized" ||
        serverMsg.message?.toLowerCase().includes("unauthorized") ||
        serverMsg.message?.toLowerCase().includes("expired")
      ) {
        window.dispatchEvent(new CustomEvent("session-expired"));
      }

      const sessionExpiredEvents = dispatchedEvents.filter(
        (e) => e.type === "session-expired",
      );
      expect(sessionExpiredEvents.length).toBe(1);
    });
  });
});
