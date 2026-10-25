# Rate Limiting Audit

**Date:** 2026-10-25
**Scope:** All rate limiting across the Node.js/Express monolith, Go auth service, AI service, and NGINX edge layer.
**Status:** Read-only audit — no code changed.

---

## Summary

Three separate rate limiting systems exist across two services (Node.js/Express monolith + Go auth service), plus a fourth AI-service limiter that duplicates two monolith limiters. **No rate limiting exists at the NGINX edge layer.**

---

## 1. Node.js/Express Monolith

File: `server/middleware/rateLimit.ts`

Five limiters defined; only **one** (`apiLimiter`) is actually applied.

| Limiter             | Applied?                                                         | Route(s)           | Limit        | Store                       | Key                        |
| ------------------- | ---------------------------------------------------------------- | ------------------ | ------------ | --------------------------- | -------------------------- |
| `apiLimiter`        | **Yes** — `app.use("/api/", apiLimiter)` (`server/routes.ts:55`) | All `/api/` routes | 100 req/min  | Redis + in-process fallback | user ID if authed, else IP |
| `authLimiter`       | **No** — defined, never used                                     | —                  | 10 req/15min | Redis                       | IP                         |
| `refreshLimiter`    | **No** — defined, never used                                     | —                  | 100 req/hr   | Redis                       | IP                         |
| `aiChatLimiter`     | **No** — shadowed by AI service copy                             | —                  | 30 req/min   | Redis                       | IP                         |
| `aiFreeTierLimiter` | **No** — shadowed by AI service copy                             | —                  | 10 req/min   | Redis                       | user ID                    |

**Critical gaps:**

- `authLimiter` and `refreshLimiter` are dead code — never attached to any route.
- Duplicate `aiChatLimiter`/`aiFreeTierLimiter` exist in both `server/middleware/rateLimit.ts` and `server/services/ai/rate-limit/rateLimit.ts`; the AI service imports its own copies, so the monolith's versions are never used.
- Anonymous traffic on `apiLimiter` is IP-keyed — all users behind one NAT share a single 100 req/min bucket.
- `apiLimiter` applies to all `/api/` routes indiscriminately, including health checks.

Redis failover: **fails open** — falls back to in-memory `MemoryStore` when Redis is down (`server/middleware/redisRateLimitStore.ts`).

---

## 2. AI Service

File: `server/services/ai/rate-limit/rateLimit.ts`

Both limiters use the **default in-memory `MemoryStore`** — not Redis-backed, not shared across replicas, not restart-surviving.

| Limiter             | Applied Route(s)                                                          | Limit      | Store                 | Key     |
| ------------------- | ------------------------------------------------------------------------- | ---------- | --------------------- | ------- |
| `aiChatLimiter`     | `POST /chat` (`aiRoutes.ts:301`), `POST /suggestions` (`aiRoutes.ts:609`) | 30 req/min | Memory (per-instance) | IP      |
| `aiFreeTierLimiter` | `POST /chat` — conditional, free-tier only (`aiRoutes.ts:362`)            | 10 req/min | Memory (per-instance) | user ID |

**Critical gaps:**

- Not Redis-backed — limits are per-instance, vanish on restart.
- BYOK users bypass `aiFreeTierLimiter` entirely — only `aiChatLimiter` (30/min, IP-keyed) applies.
- `aiChatLimiter` keys by IP only — no user-ID keying.
- **No rate limiting** on AI key-management routes: `POST /keys`, `POST /keys/test`, `DELETE /keys/{id}`, `POST /conversations`, `POST /conversations/:id/messages`, `POST /memories`, `PATCH /...`, `DELETE /...`.

---

## 3. Go Auth Service

File: `server/services/auth/internal/ratelimit/ratelimit.go`

Redis-backed sliding window via Lua script. **Fail-closed** (returns 503 if Redis is down). Applied per-route in `server.go`:

| Endpoint                         | Limit                                  | Window | Key                         | Source          |
| -------------------------------- | -------------------------------------- | ------ | --------------------------- | --------------- |
| `POST /auth/register`            | `LOGIN_RATE_LIMIT_PER_IP` (default 20) | 15 min | IP                          | `server.go:141` |
| `POST /auth/login`               | `LOGIN_RATE_LIMIT_PER_IP` (default 20) | 15 min | IP                          | `server.go:143` |
| `POST /auth/mfa/challenge`       | 10                                     | 15 min | IP                          | `server.go:145` |
| `POST /auth/forgot-password`     | 5                                      | 15 min | IP                          | `server.go:147` |
| `POST /auth/reset-password`      | 10                                     | 15 min | IP                          | `server.go:149` |
| `POST /auth/verify-email`        | 10                                     | 15 min | IP                          | `server.go:151` |
| `POST /auth/google/link`         | 10                                     | 15 min | IP                          | `server.go:158` |
| `POST /auth/resend-verification` | 3                                      | 15 min | user ID (if authed) else IP | `server.go:175` |

**Endpoints with NO rate limiting:**

- `GET /auth/csrf-token` (unauthenticated, unlimited — token harvesting vector)
- `GET /auth/google`, `GET /auth/google/callback` (OAuth — unlimited)
- `POST /auth/logout`, `POST /auth/logout-all`
- `GET /auth/session`, `GET /auth/me`
- `POST /auth/change-password`
- `POST /auth/mfa/enroll`, `POST /auth/mfa/activate`, `POST /auth/mfa/disable`
- `PATCH /user/preferences`
- `GET /auth/sessions`, `DELETE /auth/sessions/{idHash}`
- `POST /internal/introspect`, `GET /internal/stats/users`, `GET /internal/audit-search` (internal key only)

Plus account lockout (`lockout.go`) — Postgres-based, per-account, sliding 15-min window:

- 1–5 failures: allowed
- 6th failure: locked 15 min
- Each further failure: doubles (30m → 60m → … capped at 8 hours)

---

## 4. NGINX Edge Layer

**Zero rate limiting.** Neither `deploy/nginx.conf` nor `docker/nginx.conf` contains `limit_req_zone` or `limit_req` directives. All rate limiting is delegated to the application layer.

NGINX forwards `X-Real-IP` and `X-Forwarded-For` to both services. The monolith sets `trust proxy = 1`; the auth service uses `realIPMiddleware` with `TrustedProxies` (defaults to `127.0.0.1`, `::1`).

---

## 5. Redis Failover Behavior (Inconsistent)

| Service                            | Behavior when Redis down                                | Store                   |
| ---------------------------------- | ------------------------------------------------------- | ----------------------- |
| Monolith (`RedisRateLimitStore`)   | **Fails open** — falls back to in-memory `MemoryStore`  | Redis + memory fallback |
| Auth service (`ratelimit.Limiter`) | **Fails closed** — returns 503 `RATE_LIMIT_UNAVAILABLE` | Redis only              |

---

## 6. Environment Knobs

| Var                       | Default                  | Used by                     |
| ------------------------- | ------------------------ | --------------------------- |
| `API_RATE_LIMIT_MAX`      | 100                      | Monolith global API limiter |
| `LOGIN_RATE_LIMIT_PER_IP` | 20                       | Auth service login/register |
| `REDIS_URL`               | `redis://localhost:6379` | Monolith Redis client       |
| `AUTH_REDIS_URL`          | `redis://localhost:6379` | Auth service Redis client   |

Load-test rigs override both to very high values (`1000000` for API, `100000` for login) via `docker-compose.loadtest.yml`.

---

## 7. Test Mode

All limiters skip when `NODE_ENV === "test"`. Rate limiting is disabled in all test environments.

---

## Findings

| #   | Issue                                                                                                          | Severity | Location                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| 1   | `authLimiter` and `refreshLimiter` defined but never applied                                                   | High     | `server/middleware/rateLimit.ts:36,51`                                           |
| 2   | Duplicate `aiChatLimiter`/`aiFreeTierLimiter` in monolith vs AI service; AI service copies used                | Medium   | `server/middleware/rateLimit.ts` vs `server/services/ai/rate-limit/rateLimit.ts` |
| 3   | AI service limiters use in-memory store, not Redis/shared across replicas                                      | High     | `server/services/ai/rate-limit/rateLimit.ts`                                     |
| 4   | No NGINX edge rate limiting (`limit_req` absent)                                                               | High     | `deploy/nginx.conf`, `docker/nginx.conf`                                         |
| 5   | Many auth endpoints unlimited: CSRF token, OAuth, logout, change-password, MFA mgmt, session mgmt, preferences | High     | `server/services/auth/internal/httpapi/server.go:140-182`                        |
| 6   | Internal server-to-server endpoints unlimited (internal-key only)                                              | Medium   | `server.go:192-194`                                                              |
| 7   | AI key/conversation/message/memory routes unlimited                                                            | Medium   | `server/services/ai/routes/aiRoutes.ts`                                          |
| 8   | Fail-open (monolith) vs fail-closed (auth) inconsistency                                                       | Low      | `redisRateLimitStore.ts` vs `ratelimit.go`                                       |
| 9   | Anonymous traffic IP-keyed on global API limiter (NAT sharing)                                                 | Low      | `rateLimit.ts:29-30`                                                             |
