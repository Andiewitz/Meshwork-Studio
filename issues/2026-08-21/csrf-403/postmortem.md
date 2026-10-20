# Post-Mortem: Stale CSRF Token → Persistent 403 After Server Restart

**Date**: 2026-08-21
**Severity**: Medium — all state-changing API calls broken until browser hard-refresh
**Status**: ✅ Fixed & Deployed

---

## Summary

After restarting the EC2 instance, users experienced persistent `403 Forbidden` errors on all workspace operations (create, save, rename) and `[Presence] Server error: Unauthorized` on the WebSocket — even after logging out and back in. Re-logging in did not fix it.

---

## Timeline

| Time (SGT) | Event                                                                        |
| ---------- | ---------------------------------------------------------------------------- |
| ~21:26     | User restarts EC2 to resume work                                             |
| ~21:30     | Reports 403s on workspace create and Presence Unauthorized errors            |
| ~21:31     | User tries logging out and back in — 403s persist                            |
| ~21:32     | Root cause identified: stale CSRF cookie/token mismatch after server restart |
| ~21:48     | Fix implemented and deployed                                                 |

---

## Root Cause

The app uses `csurf` (cookie-based CSRF protection). On every server cold start:

1. `csurf` generates a **new CSRF signing secret** — it is not persisted to disk or Redis
2. The browser retains the **old `_csrf` cookie** from the previous server session
3. On login, `csrf-init.ts` fetches a new CSRF token — but only once, **on cold app mount** (`useEffect(fn, [])`)
4. If the user was already in the browser tab (no full page reload), the `useEffect` does not re-run
5. All subsequent `POST` requests send the **old `X-CSRF-Token`** header against the **new server secret** → **mismatch → 403**

Re-logging in did **not** fix it because the CSRF cookie is entirely separate from the auth session cookie. The login flow only refreshed the auth cookie — the stale CSRF token remained in `sessionStorage` untouched.

---

## Affected Code (Before Fix)

### `client/src/lib/csrf-init.ts`

Only fetched CSRF token once on app mount. No export for on-demand refresh.

```ts
// ❌ Only runs once on cold mount, never re-fetched after login
export function useCsrfTokenInitializer() {
  useEffect(() => {
    initializeCsrfToken();
  }, []);
}
```

### `client/src/lib/secure-fetch.ts`

Had 401 auto-retry with JWT refresh but no 403 handling.

```ts
// ❌ 403 from CSRF failure returned to caller as-is, no recovery
if (response.status === 401 && ...) {
  // JWT refresh + retry
}
return response; // 403 falls through silently
```

### `client/src/pages/AuthPage.tsx` & `AuthModal.tsx`

Login success handler did not refresh the CSRF token after authentication.

```ts
// ❌ Login succeeds but CSRF token stays stale
queryClient.setQueryData(["/api/v1/auth/me"], data.user);
```

---

## Fix Applied

### 1. `csrf-init.ts` — Export `refreshCsrfToken()` for on-demand use

```ts
export async function refreshCsrfToken(): Promise<void> {
  const response = await fetch("/api/v1/csrf-token", {
    credentials: "include",
  });
  if (response.ok) {
    const data = await response.json();
    if (data.csrfToken) storeCsrfToken(data.csrfToken);
  }
}
```

### 2. `secure-fetch.ts` — Auto-retry on 403 with a fresh CSRF token

```ts
if (response.status === 403 && !urlString.includes("/api/v1/csrf-token") && ...) {
  const csrfResponse = await fetch("/api/v1/csrf-token", { credentials: "include" });
  if (csrfResponse.ok) {
    storeCsrfToken(data.csrfToken);
    response = await fetch(input, retryInit); // retry with new token
  }
}
```

### 3. `AuthPage.tsx` & `AuthModal.tsx` — Refresh CSRF immediately after login

```ts
await refreshCsrfToken(); // syncs token with new server session
queryClient.setQueryData(["/api/v1/auth/me"], data.user);
```

---

## Why Re-Login Didn't Help (Before Fix)

```
Server restarts
  → new CSRF secret generated (ephemeral, not persisted)
  → browser still holds old _csrf cookie + old token in sessionStorage

User logs out + logs back in
  → new auth cookie ✅
  → CSRF token NOT re-fetched ❌ (useEffect only ran on first mount)
  → all POSTs still send old X-CSRF-Token → server rejects → 403
```

---

## Prevention Going Forward

| Layer             | Mechanism                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------- |
| **On login**      | `refreshCsrfToken()` called in both `AuthPage` and `AuthModal`                            |
| **On any 403**    | `secureFetch` auto-fetches fresh token and retries transparently                          |
| **On cold mount** | `useCsrfTokenInitializer()` still runs for first page load                                |
| **Future**        | Consider persisting the CSRF secret to Redis so restarts don't invalidate existing tokens |

---

## Files Changed

| File                                       | Change                                            |
| ------------------------------------------ | ------------------------------------------------- |
| `client/src/lib/csrf-init.ts`              | Exported `refreshCsrfToken()` standalone function |
| `client/src/lib/secure-fetch.ts`           | Added 403 auto-retry with CSRF token refresh      |
| `client/src/pages/AuthPage.tsx`            | Call `refreshCsrfToken()` on login success        |
| `client/src/components/auth/AuthModal.tsx` | Call `refreshCsrfToken()` on login success        |
