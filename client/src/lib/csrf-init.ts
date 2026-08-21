import { useEffect } from "react";
import { storeCsrfToken } from "./secure-fetch";

/**
 * Fetches a fresh CSRF token from the server and stores it in sessionStorage.
 * Called on cold app mount AND after every login so the token is always in
 * sync with the current server session (prevents stale-token 403s after
 * server restarts).
 */
export async function refreshCsrfToken(): Promise<void> {
  try {
    const response = await fetch("/api/v1/csrf-token", {
      credentials: "include",
    });
    if (response.ok) {
      const data = await response.json();
      if (data.csrfToken) {
        storeCsrfToken(data.csrfToken);
      }
    }
  } catch (error) {
    console.error("[CSRF] Failed to refresh token:", error);
  }
}

/**
 * Initialize CSRF token on app load.
 * Should be called once in App.tsx or a layout component.
 */
export function useCsrfTokenInitializer() {
  useEffect(() => {
    refreshCsrfToken();
  }, []);
}
