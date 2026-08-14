# Post-Mortem: UI Interaction Bugs & Infrastructure Issues

## Date: February 25-26, 2026

## Issues Investigated and Fixed

---

## February 26, 2026 Session

### 4. White Screen on Login Page

**The Problem:**
Login page displayed a blank white screen instead of the login form. This occurred after PC shutdown/restart.

**Root Cause:**
Multiple issues compounded:

1. **Stale Nginx cache**: After rebuild, frontend container served old `index.html` referencing non-existent JS chunks (e.g., `index-t9Tdg8vJ.js` not found)
2. **Missing wouter context**: `useLocation()` was called outside of `<Router>` context
3. **Docker bind mount staleness**: Nginx container didn't auto-pick up new assets from host

**The Fix:**

1. Wrapped app with `WouterRouter` in `App.tsx`:

```tsx
import { Router as WouterRouter } from "wouter";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter>
        {" "}
        // Added
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </WouterRouter>{" "}
      // Added
    </QueryClientProvider>
  );
}
```

2. Force container restart after builds to pick up new assets:

```bash
docker-compose restart emnesh-frontend
```

**Files Changed:** `client/src/App.tsx`

---

### 5. /api/login Serving index.html Instead of Login Page

**The Problem:**
Navigating to `/api/login` returned a white screen or backend API response instead of the frontend login page.

**Root Cause:**
Legacy links in the frontend pointed to `/api/login` instead of the correct frontend route `/auth/login`. Nginx had no rule to handle this legacy path, so it fell through to backend API or served HTML.

**The Fix:**
Added explicit Nginx redirect in `nginx.conf`:

```nginx
# Redirect old/broken /api/login to correct frontend route
location = /api/login {
    return 302 /auth/login;
}
```

Also updated all frontend links from `/api/login` to `/auth/login` in:

- `client/src/pages/Landing.tsx`
- `client/src/pages/AuthPage.tsx`
- `client/src/lib/auth-utils.ts`

**Files Changed:** `nginx.conf`, `client/src/pages/Landing.tsx`, `client/src/pages/AuthPage.tsx`, `client/src/lib/auth-utils.ts`

---

### 6. Brief 404 Flash Before Login Page

**The Problem:**
Navigating to `/auth` showed a 404 error briefly before redirecting to `/auth/login`.

**Root Cause:**
The frontend routing handled `/auth` as a catch-all redirect, but the redirect wasn't immediate. The `NotFound` route could trigger briefly.

**The Fix:**
Added explicit redirect route in `App.tsx` Router component:

```tsx
if (location.startsWith("/auth/") || location === "/auth") {
  return (
    <AnimatePresence mode="wait">
      <Switch location={location} key={location}>
        <Route path="/auth/login">
          <Login />
        </Route>
        <Route path="/auth/register">
          <Register />
        </Route>
        <Route path="/auth">
          <Redirect to="/auth/login" /> // Added
        </Route>
      </Switch>
    </AnimatePresence>
  );
}
```

**Files Changed:** `client/src/App.tsx`

---

### 7. Generic "Invalid" Error Messages

**The Problem:**
Authentication errors showed generic messages like "Invalid email or password" instead of specific feedback.

**Root Cause:**
Backend auth strategies and routes used vague error messages that didn't distinguish between "user not found" vs "wrong password" vs "social login account".

**The Fix:**
Updated auth module with specific error messages:

- `server/modules/auth/strategies/local.ts`: Separate "No account found with this email address" from "Incorrect password" from "This account uses social login"
- `server/modules/auth/authCore.ts`: Changed "Unauthorized" to "Session expired or not logged in"
- `server/modules/auth/routes.ts`: Added descriptive messages for registration failures, login failures, and user fetch failures
- `server/modules/auth/captcha.ts`: Improved CAPTCHA error messages

**Files Changed:** `server/modules/auth/strategies/local.ts`, `server/modules/auth/authCore.ts`, `server/modules/auth/routes.ts`, `server/modules/auth/captcha.ts`

---

### 8. CAPTCHA Not Production-Grade + Required for Login

**The Problem:**
CAPTCHA was basic and required for login, which is annoying for returning users.

**Root Cause:**

1. CAPTCHA middleware lacked replay protection, IP validation, proper error handling
2. CAPTCHA was applied to both login and registration

**The Fix:**

1. Made CAPTCHA production-grade:
   - Token deduplication (replay attack prevention)
   - IP-based validation
   - Token format validation and 5-minute expiration
   - reCAPTCHA v3 score threshold support
   - User-friendly error code mapping
   - Added `optionalCaptchaMiddleware` for dev mode

2. Removed CAPTCHA from login - now only required for registration:

```typescript
// Registration still requires CAPTCHA
app.post("/api/auth/register", captchaMiddleware, async (req, res) => {...});

// Login does NOT require CAPTCHA
app.post("/api/auth/login", (req, res, next) => {...});
```

**Files Changed:** `server/modules/auth/captcha.ts`, `server/modules/auth/routes.ts`

---

### 9. Awkward Page Transition Animations

**The Problem:**
Page transitions felt awkward with scale and blur effects.

**Root Cause:**
Framer Motion transitions used `scale: 0.99`, `filter: "blur(4px)"` which looked jarring and slow (0.4s duration).

**The Fix:**
Simplified to clean fade with subtle slide:

```tsx
const PageTransition = ({ children, className }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }} // Changed from scale+blur
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.2 }} // Changed from 0.4s
    className={cn("flex-1", className)}
  >
    {children}
  </motion.div>
);
```

**Files Changed:** `client/src/App.tsx`

---

## February 27, 2026 Session

### 10. Register Page Blank White Screen (Express Route Syntax)

**The Problem:**
Register page showed a completely blank white screen. Browser network tab showed 404 errors for CSS/JS assets with old hashes. Issue persisted across browsers (Edge, Chrome) and hard refreshes.

**Root Cause:**

1. **Invalid Express 4 route pattern**: `app.use("*", ...)` in `server/static.ts` threw an error on server startup: "path array should have only strings or regexps"
2. **Backend container crash**: Express failed to start, so nginx fell through to the backend which wasn't serving the SPA correctly
3. **Stale assets in backend image**: Even after fixing the route pattern, the backend image had old built files from Feb 26

**The Fix:**

1. Changed Express catch-all route to use regex pattern (Express 4 compatible):

```typescript
// Before (INVALID in Express 4):
app.use("*", (_req, res) => {
  res.sendFile(path.resolve(distPath, "index.html"));
});

// After (WORKING):
app.get(/.*/, (_req, res) => {
  res.sendFile(path.resolve(distPath, "index.html"));
});
```

2. Rebuilt Docker image with no cache to get fresh assets:

```bash
docker-compose build --no-cache emnesh-backend
docker-compose up -d emnesh-backend
```

**Files Changed:** `server/static.ts`

---

## Key Takeaways (Updated)

1. **Event handling in React requires specificity** - Always check which mouse button triggered an action if you want different behaviors for left vs right clicks.

2. **Dialog components need careful configuration** - Radix UI dialogs have multiple interaction points that can trigger closing; understand `onPointerDownOutside` and `onInteractOutside` when you need to prevent accidental closes.

3. **Event bubbling is easy to miss** - When inline editing inputs are children of clickable elements, always use `stopPropagation()` to prevent parent handlers from firing.

4. **Consistency across components** - The `WorkspaceCard` had proper event handling that `FeaturedCard` lacked. When components share similar functionality, ensure they share similar event handling patterns.

5. **Docker volume staleness** - Bind-mounted volumes don't auto-update when host files change. Always restart containers after frontend builds to serve fresh assets.

6. **Router context is critical** - `wouter`'s `useLocation()` must be inside `<Router>` context. Wrap root App with router provider.

7. **Nginx location order matters** - Specific redirects (`location = /api/login`) should come before catch-all fallbacks. Use exact matches (`=`) for redirects.

8. **Frontend links must match routes** - Legacy `/api/*` paths won't work with Nginx SPA setup. Update all client-side links to use frontend routes (`/auth/*`).

9. **Security should be specific** - Generic error messages help attackers. Distinguish between "user not found" and "wrong password" at the backend level.

10. **CAPTCHA UX matters** - Only require CAPTCHA for high-risk actions (registration), not for returning users (login). Implement replay protection and proper error handling.

11. **Animations should be invisible** - If users notice the transition, it's too flashy. Subtle fades + small movements beat scale/blur effects.

12. **Express 4 route syntax matters** - `app.use("*")` is invalid; use `app.get(/.*/)` for catch-all SPA routes. Always check server logs when routes fail silently.

13. **Type coercion across stack boundaries silently breaks things** - JavaScript booleans sent to a Postgres `INTEGER` column don't get coerced — they throw a runtime error. Always normalize types at the API boundary.

14. **Dark mode is a design decision, not a CSS filter** - Simple black↔white inversion produces harsh white shadows and loses brand identity. Treat dark mode as a distinct palette: warm off-whites, brand-consistent accent colors, intentional shadow colors.

---

## April 5, 2026 Session

### 11. `animated: false` — Postgres Integer Crash

**The Problem:**
Saving a canvas diagram in the workspace would occasionally fail with a 500 error. Server logs showed:

```
invalid input syntax for type integer: "false"
```

**Root Cause:**
The `edges` table in PostgreSQL stores the `animated` property as `INTEGER` (0 or 1). React Flow sets `edge.animated` as a JavaScript boolean (`true` / `false`). When edges were synced to the API, the boolean was serialized as the string `"false"`, which Postgres immediately rejected for an integer column.

The mismatch had always existed in the schema but wasn't triggered until animated edges (set during "simulate" mode) were synced to the database.

**The Fix:**
Normalize `edge.animated` to an integer before the API request in `use-canvas.ts`:

```typescript
const normalizedEdges = edges.map((edge) => ({
  ...edge,
  animated: edge.animated ? 1 : 0,
}));
const res = await apiRequest("POST", url, { nodes, edges: normalizedEdges });
```

**Files Changed:** `client/src/hooks/use-canvas.ts`

---

### 12. Dark Mode Inversion — Brand Identity & Visual Quality

**The Problem:**
Dark mode looked visually cheap. Specific issues:

- Primary accent color switched from `#FF3D00` (brand orange-red) to a random purple (`#8B5CF6`) — no design reason
- Neo-brutalist box shadows used pure white (`rgba(255, 255, 255, 1)`) which looked fluorescent and harsh
- All borders were pure white, further increasing the harsh contrast

**Root Cause:**
The `.dark` CSS class block in `index.css` had been written as a simple inversion: swap all black values to white and pick an arbitrary purple for the primary. This is the "lazy" approach that doesn't consider the aesthetics of the light-on-dark rendering.

**The Fix:**
Redesigned dark mode as a distinct palette:

| Property   | Before                      | After                                      |
| ---------- | --------------------------- | ------------------------------------------ |
| Primary    | Purple `262 83% 65%`        | Brand red `#FF3D00` (unchanged from light) |
| Background | Pure black `#0D0D0D`        | Deep charcoal `#121212`                    |
| Foreground | Pure white                  | Warm off-white `#EBEBEA`                   |
| Borders    | Pure white                  | Warm off-white `#CECECB`                   |
| Shadows    | White `rgba(255,255,255,1)` | Brand red `rgba(255,61,0,0.7)`             |

**Files Changed:** `client/src/index.css`
