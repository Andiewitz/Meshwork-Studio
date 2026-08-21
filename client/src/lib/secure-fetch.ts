const rawApiUrl = (import.meta.env.VITE_API_URL as string) || "";
const API_BASE_URL = rawApiUrl.includes("railway") ? "" : rawApiUrl;

function getApiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}${path}`;
}

/**
 * Enhanced fetch function that automatically includes CSRF token
 *
 * This wraps the native fetch API to automatically add:
 * - X-CSRF-Token header for state-changing requests
 * - Automatic CSRF token refresh and retry on 403
 *
 * Usage is identical to fetch():
 * ```tsx
 * const response = await secureFetch('/api/v1/workspaces', {
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
  const requestUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  const requestInit: RequestInit = { ...init, credentials: "include" };

  // Only add CSRF token for state-changing requests
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const headers = new Headers(requestInit.headers);
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
    requestInit.headers = headers;
  }

  let response = await fetch(input, requestInit);

  // Automatic CSRF Token Refresh
  // If the request fails with 403 (CSRF validation failure after server restart),
  // fetch a fresh CSRF token and retry the original request once.
  if (
    response.status === 403 &&
    !requestUrl.includes("/api/v1/csrf-token") &&
    !["GET", "HEAD", "OPTIONS"].includes(method)
  ) {
    try {
      const csrfEndpoint = getApiUrl("/api/v1/csrf-token");
      const csrfResponse = await fetch(csrfEndpoint, {
        credentials: "include",
      });
      if (csrfResponse.ok) {
        const data = (await csrfResponse.json()) as { csrfToken?: string };
        if (data.csrfToken) {
          storeCsrfToken(data.csrfToken);
          // Rebuild headers with the new token and retry
          const retryInit = { ...requestInit };
          const retryHeaders = new Headers(retryInit.headers);
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
