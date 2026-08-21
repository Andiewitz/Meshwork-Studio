import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { secureFetch } from "../lib/secure-fetch";
import type { User } from "@shared/schema";

// ─── URL helper ──────────────────────────────────────────────────────────────

const rawApiUrl = (import.meta.env.VITE_API_URL as string) || "";
const API_BASE_URL = rawApiUrl.includes("railway") ? "" : rawApiUrl;

function getApiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}${path}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null | undefined; // undefined = still loading
  isLoading: boolean;
  isAuthenticated: boolean;
  isRedirecting: boolean;
  accessTokenExpiresAt: string | null;
}

interface AuthContextValue extends AuthState {
  logout: () => void;
  isLoggingOut: boolean;
  updatePreferences: (data: {
    hasNotifiedTeam?: boolean;
    readNotificationIds?: number[];
  }) => Promise<User>;
  isUpdatingPreferences: boolean;
  /** Called by use-presence when the WS sends an Unauthorized error */
  bootToLogin: () => void;
  /** Called by AuthPage after a successful login/register API response */
  notifyLoginSuccess: (user: User, accessTokenExpiresAt: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Shared boot function — one exit door ─────────────────────────────────────

/**
 * Hard-navigates to /login?reason=session_expired.
 * This is the single place in the entire codebase that redirects on session
 * expiry. Exported so use-presence.ts can call it without an event bus.
 */
export function bootToLogin(): void {
  const path = window.location.pathname;
  const isAlreadyOnAuth =
    path.startsWith("/login") || path.startsWith("/register");
  // If already on a public page, redirect to /home after login.
  // Otherwise, carry the current path so the user lands back where they were.
  const redirectTarget = isAlreadyOnAuth ? "/home" : path;
  window.location.href = `/login?reason=session_expired&redirect=${encodeURIComponent(redirectTarget)}`;
}

// ─── Dev mock user ────────────────────────────────────────────────────────────

const DEV_MOCK_USER: User = {
  id: "mock-id-1",
  email: "architect@meshwork.dev",
  firstName: "Andrei",
  lastName: "Architect",
  profileImageUrl:
    // eslint-disable-next-line no-secrets/no-secrets
    "https://lh3.googleusercontent.com/aida-public/AB6AXuC-JTdi7K7guBlCoOvJJUVsjo1JHj0Ok51Bw9bfewYZRrdCNKm96Vq8Esf03yMGfFjz-Nx1o88diz_-CgrcFlaEuF133QGW6enP8CTOPkZJl0ySRO6ZMe-AtabFmhTdW3EhkAYHkBTt7E6x4Inv5fP6wfSJwJOdn4hFT-PbOCoTdUy5TodHgkAX8Y2V5W259KvjJ4pWnlGmcbEbhGUHJAAa1jiqDuRbbhBIC38ALVGuHswMP4FGj74VLcVH-mj5E5IbO9VuDZn8Vzhf",
  passwordHash: null,
  authProvider: "email",
  hasNotifiedTeam: false,
  readNotificationIds: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── AuthProvider ─────────────────────────────────────────────────────────────

/**
 * AuthProvider owns all auth state and the proactive silent-refresh timer.
 *
 * Strategy:
 * 1. On mount: fetch /auth/me once to check existing session.
 *    - Server returns { user, accessTokenExpiresAt } when the session is valid.
 *    - 401 → user is null (not logged in), no refresh attempt.
 * 2. On successful session check or login: schedule a refresh timer to fire
 *    60 seconds before the access token expires.
 * 3. The timer calls /auth/refresh:
 *    - Success → update accessTokenExpiresAt, reschedule the next timer.
 *    - Failure → bootToLogin() — the one and only kick-out.
 * 4. On visibilitychange (tab focus back): if token expires within 90s, refresh
 *    immediately rather than waiting for the timer.
 * 5. On logout: cancel the timer, clear state, navigate to /.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [accessTokenExpiresAt, setAccessTokenExpiresAt] = useState<
    string | null
  >(null);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRefreshingRef = useRef(false);
  const refreshRetryCountRef = useRef(0);

  // ── Schedule the next silent refresh ──────────────────────────────────────

  const scheduleRefresh = useCallback((expiresAtIso: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const expiresAt = new Date(expiresAtIso).getTime();
    // Refresh 60 seconds before expiry; clamp to at least 0ms (fire immediately
    // if we're already past the refresh window).
    const msUntilRefresh = Math.max(expiresAt - Date.now() - 60_000, 0);

    refreshTimerRef.current = setTimeout(async () => {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      try {
        const res = await fetch(getApiUrl("/api/v1/auth/refresh"), {
          method: "POST",
          credentials: "include",
        });

        if (res.ok) {
          refreshRetryCountRef.current = 0;
          const data = (await res.json()) as { accessTokenExpiresAt: string };
          setAccessTokenExpiresAt(data.accessTokenExpiresAt);
          scheduleRefresh(data.accessTokenExpiresAt);
        } else {
          // Explicit 401/403: Refresh token is expired or revoked → boot the user
          bootToLogin();
        }
      } catch {
        // Transient network failure — retry up to 3 times before giving up
        const retries = refreshRetryCountRef.current;
        if (retries < 3) {
          refreshRetryCountRef.current += 1;
          const backoffDelay = Math.min(10_000 * 2 ** retries, 60_000);
          refreshTimerRef.current = setTimeout(() => {
            scheduleRefresh(new Date(Date.now()).toISOString());
          }, backoffDelay);
        } else {
          bootToLogin();
        }
      } finally {
        isRefreshingRef.current = false;
      }
    }, msUntilRefresh);
  }, []);

  // ── Tab visibility: refresh eagerly on focus if token is close to expiry ──

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!accessTokenExpiresAt) return;

      const msLeft = new Date(accessTokenExpiresAt).getTime() - Date.now();
      // If less than 90s remaining, skip the timer and refresh now
      if (msLeft < 90_000) {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        scheduleRefresh(new Date(Date.now()).toISOString()); // fires in 0ms
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [accessTokenExpiresAt, scheduleRefresh]);

  // ── Initial session check on mount ────────────────────────────────────────

  useEffect(() => {
    // Dev bypass: skip the real API call
    if (import.meta.env.DEV) {
      setUser(DEV_MOCK_USER);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(getApiUrl("/api/v1/auth/me"), {
          credentials: "include",
        });

        if (cancelled) return;

        if (res.ok) {
          const data = (await res.json()) as User & {
            accessTokenExpiresAt?: string;
          };
          setUser(data);
          // The /auth/me endpoint doesn't return accessTokenExpiresAt (it's
          // protected by the existing access token, so it IS still valid).
          // Schedule a conservative refresh: assume the token was freshly minted
          // and fire 14 minutes from now (worst-case: token was issued just now,
          // expires in 15m, we refresh at 14m = 1m before). In practice the
          // timer will fire once and then reschedule precisely from the refresh
          // response's accessTokenExpiresAt field.
          const conservativeExpiry = new Date(
            Date.now() + 14 * 60 * 1000,
          ).toISOString();
          setAccessTokenExpiresAt(conservativeExpiry);
          scheduleRefresh(conservativeExpiry);
        } else if (res.status === 401) {
          // No valid session — not an error, just not logged in
          setUser(null);
        } else {
          setUser(null);
        }
      } catch {
        if (!cancelled) setUser(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scheduleRefresh]);

  // ── Cleanup timer on unmount ───────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await secureFetch(getApiUrl("/api/v1/auth/logout"), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Logout failed");
    },
    onSuccess: () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      setUser(null);
      setAccessTokenExpiresAt(null);
      queryClient.clear();
      setIsRedirecting(true);
    },
  });

  // ── Update preferences ────────────────────────────────────────────────────

  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: {
      hasNotifiedTeam?: boolean;
      readNotificationIds?: number[];
    }) => {
      const res = await secureFetch(getApiUrl("/api/v1/user/preferences"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Update preferences failed: ${text}`);
      }
      return res.json() as Promise<User>;
    },
    onSuccess: (updatedData) => {
      setUser((prev) => (prev ? { ...prev, ...updatedData } : prev));
    },
  });

  // ── Public API consumed by login/register forms ───────────────────────────

  /**
   * Called by AuthPage after a successful login or register API call.
   * Sets the user and schedules the first refresh timer.
   */
  const notifyLoginSuccess = useCallback(
    (newUser: User, expiresAtIso: string) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      queryClient.clear(); // clear any stale data from a previous session
      setUser(newUser);
      setAccessTokenExpiresAt(expiresAtIso);
      scheduleRefresh(expiresAtIso);
    },
    [queryClient, scheduleRefresh],
  );

  const value: AuthContextValue = {
    user,
    isLoading: user === undefined,
    isAuthenticated: !!user,
    isRedirecting,
    accessTokenExpiresAt,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    updatePreferences: updatePreferencesMutation.mutateAsync,
    isUpdatingPreferences: updatePreferencesMutation.isPending,
    bootToLogin,
    notifyLoginSuccess,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}

// ─── Logout helper (kept for backward compat) ─────────────────────────────────

/** @deprecated — call useAuth().logout() directly */
export { AuthProvider as default };
