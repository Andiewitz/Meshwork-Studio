import { useQueryClient } from "@tanstack/react-query";

/**
 * Helper to get CSRF token from query cache
 */
function getCsrfTokenFromCache(): string {
  try {
    const queryClient = useQueryClient();
    return queryClient.getQueryData(["csrf-token"])! || "";
  } catch {
    return "";
  }
}

/**
 * Enhanced fetch function that automatically includes CSRF token
 *
 * This wraps the native fetch API to automatically add:
 * - X-CSRF-Token header for state-changing requests
 * - Proper error handling
 *
 * Usage is identical to fetch():
 * ```tsx
 * const response = await secureFetch('/api/v1/auth/register', {
 *   method: 'POST',
 *   body: JSON.stringify(data),
 * });
 * ```
 */
export async function secureFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();

  // Only add CSRF token for state-changing requests
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = getCsrfToken();

    // Initialize headers if not present
    if (!init) {
      init = {};
    }
    if (!init.headers) {
      init.headers = {};
    }

    // Ensure headers is a plain object (can be HeadersInit)
    const headers = new Headers(init.headers);

    // Add CSRF token
    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }

    init.headers = headers;
  }

  let response = await fetch(input, init);

  // Automatic JWT Token Refresh
  // If the request fails with 401 and it's not the refresh endpoint itself,
  // we try to use the refresh_token cookie to get a new access_token cookie.
  const urlString = input.toString();
  if (
    response.status === 401 &&
    !urlString.includes("/api/v1/auth/refresh") &&
    !urlString.includes("/api/v1/auth/login") &&
    !urlString.includes("/api/v1/auth/logout")
  ) {
    try {
      const refreshResponse = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Required to send and receive the HttpOnly cookies
        credentials: "include",
      });

      if (refreshResponse.ok) {
        // Refresh succeeded, the new access_token cookie is now set.
        // Retry the original request!
        response = await fetch(input, init);
      }
    } catch (refreshErr) {
      console.warn("Token refresh failed:", refreshErr);
    }
  }

  // Automatic CSRF Token Refresh
  // If the request fails with 403 (CSRF validation failure after server restart),
  // fetch a fresh CSRF token and retry the original request once.
  if (
    response.status === 403 &&
    !urlString.includes("/api/v1/csrf-token") &&
    !["GET", "HEAD", "OPTIONS"].includes(method)
  ) {
    try {
      const csrfResponse = await fetch("/api/v1/csrf-token", {
        credentials: "include",
      });
      if (csrfResponse.ok) {
        const data = await csrfResponse.json();
        if (data.csrfToken) {
          storeCsrfToken(data.csrfToken);
          // Rebuild headers with the new token
          const retryInit = { ...init };
          const retryHeaders = new Headers(init?.headers);
          retryHeaders.set("X-CSRF-Token", data.csrfToken);
          retryInit.headers = retryHeaders;
          response = await fetch(input, retryInit);
        }
      }
    } catch (csrfErr) {
      console.warn("[CSRF] Token refresh failed:", csrfErr);
    }
  }

  return response;
}

/**
 * Get CSRF token from sessionStorage
 */
function getCsrfToken(): string {
  if (typeof window !== "undefined") {
    const stored = sessionStorage.getItem("csrfToken");
    if (stored) {
      return stored;
    }
  }
  return "";
}

/**
 * Store CSRF token in session storage
 */
export function storeCsrfToken(token: string): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem("csrfToken", token);
  }
}

/**
 * Clear CSRF token
 */
export function clearCsrfToken(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("csrfToken");
  }
}
