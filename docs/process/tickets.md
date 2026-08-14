# Developer Tickets — Meshwork Studio Core Updates

This document contains actionable, structured tickets for the issues and improvements identified in the audit report.

---

## [TICKET-01] Implement Real API Key Verification on Test Route

- **Status**: Done
- **Priority**: High
- **Component**: Backend (AI Module)

### Description

The endpoint `POST /api/ai/keys/test` currently only validates key formats (e.g., checking if an OpenAI key starts with `sk-`). It does not verify the key against the actual provider, returning `valid: true` prematurely. We need to implement real verification calls to the corresponding providers.

### Technical Details & Files to Modify

- **File**: [server/modules/ai/routes.ts](file:///c:/Users/VMedia/Desktop/PROJECTS/Meshwork%20Studio/server/modules/ai/routes.ts)
  - Modify `/keys/test` route handler to import and invoke validation helpers based on the chosen `provider`.
- **Files**:
  - Use `validateOpenAIKey` from [server/modules/ai/providers/openai.ts](file:///c:/Users/VMedia/Desktop/PROJECTS/Meshwork%20Studio/server/modules/ai/providers/openai.ts).
  - Use `validateAnthropicKey` from [server/modules/ai/providers/anthropic.ts](file:///c:/Users/VMedia/Desktop/PROJECTS/Meshwork%20Studio/server/modules/ai/providers/anthropic.ts).
  - Implement and call `validateOpenRouterKey` in [server/modules/ai/providers/openrouter.ts](file:///c:/Users/VMedia/Desktop/PROJECTS/Meshwork%20Studio/server/modules/ai/providers/openrouter.ts).

### Acceptance Criteria

- [x] Submitting a request to `/api/ai/keys/test` with a syntactically correct but invalid API key returns `valid: false` and a user-friendly error payload.
- [x] Submitting a request with a valid working key returns `valid: true`.
- [x] OpenAI, Anthropic, and OpenRouter validation are fully integrated.

### Completion Notes

Implemented real provider validation calls in `/keys/test`. The endpoint now calls `validateOpenAIKey`, `validateAnthropicKey`, or `validateOpenRouterKey` to verify the key against the actual provider API before returning `valid: true/false`.

---

## [TICKET-02] Implement OpenRouter Validation and Dynamic Header Configuration

- **Status**: Done
- **Priority**: Medium
- **Component**: Backend (AI Module / OpenRouter)

### Description

OpenRouter integration lacks a key validation function. Additionally, `openrouter.ts` hardcodes the `HTTP-Referer` header to `"http://localhost:5173"`, which is inaccurate for staging and production deployments.

### Technical Details & Files to Modify

- **File**: [server/modules/ai/providers/openrouter.ts](file:///c:/Users/VMedia/Desktop/PROJECTS/Meshwork%20Studio/server/modules/ai/providers/openrouter.ts)
  - Implement `validateOpenRouterKey(apiKey: string): Promise<boolean>` by making a lightweight request to `https://openrouter.ai/api/v1/auth/key` (which returns quota and key details).
  - Retrieve the application URL dynamically using `process.env.APP_URL` or fallback to localhost, passing it into the `HTTP-Referer` header configuration.

### Acceptance Criteria

- [x] `validateOpenRouterKey` successfully parses keys and flags invalid ones.
- [x] HTTP requests to OpenRouter include dynamic referer URLs matching the deployed environment.

### Completion Notes

Implemented `validateOpenRouterKey` using `https://openrouter.ai/api/v1/auth/key`. Replaced hardcoded `http://localhost:5173` referer with dynamic `getAppUrl()` helper that reads `APP_URL` or `FRONTEND_URL` env vars.

---

## [TICKET-03] Distributed Lockout Storage Strategy (Production Hardening)

- **Status**: Todo
- **Priority**: Medium
- **Component**: Backend (Auth Module)

### Description

Brute force protection currently utilizes an in-memory Map (`inMemoryLoginAttempts`) when PostgreSQL is not configured or in development fallback. While fine for single-node development, this approach is vulnerable under multi-container production scaling, as lockout state will not be shared across container nodes.

### Technical Details & Files to Modify

- **File**: [server/modules/auth/lockout.ts](file:///c:/Users/VMedia/Desktop/PROJECTS/Meshwork%20Studio/server/modules/auth/lockout.ts)
  - Replace the memory-backed `inMemoryLoginAttempts` Map with an active database constraint check, or support a Redis client adapter when horizontal scaling is active.

### Acceptance Criteria

- [ ] In production, lockout state is stored centrally in a database or distributed cache.
- [ ] Multiple web application instances read and enforce the same rate-limit lockout values.

---

## [TICKET-04] Configurable Local CSRF Verification Toggle

- **Status**: Done
- **Priority**: Low
- **Component**: Backend (Security Middleware)

### Description

CSRF protection middleware is automatically bypassed when `process.env.NODE_ENV === "development"`. This prevents local testing of CSRF token handshakes, making it easy for integration/configuration mistakes to slip into production.

### Technical Details & Files to Modify

- **File**: [server/modules/auth/routes.ts](file:///c:/Users/VMedia/Desktop/PROJECTS/Meshwork%20Studio/server/modules/auth/routes.ts)
  - Replace hardcoded `NODE_ENV === "production"` checks for `csrfProtection` with a configuration flag, e.g., `process.env.ENABLE_CSRF === "true" || process.env.NODE_ENV === "production"`.
- **File**: [server/modules/ai/routes.ts](file:///c:/Users/VMedia/Desktop/PROJECTS/Meshwork%20Studio/server/modules/ai/routes.ts)
  - Same `ENABLE_CSRF` flag applied to all AI state-changing endpoints.

### Acceptance Criteria

- [x] Setting `ENABLE_CSRF=true` in `.env` triggers active CSRF token verification locally in development mode.
- [x] Bypasses remain the default behavior if the flag is omitted in local development to avoid breaking quick starts.

### Completion Notes

Replaced hardcoded `NODE_ENV === "production"` checks with `process.env.ENABLE_CSRF === "true" || process.env.NODE_ENV === "production"` in both auth and AI route files. A single `conditionalCsrf` middleware is now shared across all state-changing endpoints.

---

## [TICKET-05] Core E2E Flow Test Implementation

- **Status**: Todo
- **Priority**: Medium
- **Component**: Testing (E2E Playwright)

### Description

Current Playwright tests only verify that the login page mounts and resolves without raw Vite build exceptions. No actual E2E verification of user interaction is present.

### Technical Details & Files to Modify

- **File**: [tests/e2e/canvas.spec.ts](file:///c:/Users/VMedia/Desktop/PROJECTS/Meshwork%20Studio/tests/e2e/canvas.spec.ts)
  - Add E2E tests checking signup, login, navigation to dashboard.
  - Implement canvas tests validating that a workspace can be created, nodes can be added, connected, and moved.

### Acceptance Criteria

- [ ] Tests run successfully inside CI pipeline (`npm run test:e2e`).
- [ ] Workspace creation and canvas updates are validated against simulated user actions.

---

## [TICKET-06] Integration Tests for AI Provider endpoints

- **Status**: Todo
- **Priority**: Low
- **Component**: Testing (Integration / AI)

### Description

The project contains unit tests for encryption and integration tests for AI chat, but lacks integration tests validating key registration, toggling active states, deleting keys, or handling API validation errors.

### Technical Details & Files to Modify

- **New File**: `tests/integration/ai/keys.test.ts`
  - Create integration tests using Supertest to mock and request routes:
    - `GET /api/ai/keys`
    - `POST /api/ai/keys`
    - `DELETE /api/ai/keys/:id`
    - `POST /api/ai/keys/:id/toggle`
    - `POST /api/ai/keys/test`

### Acceptance Criteria

- [ ] Integration tests run and pass under `npm run test`.
- [ ] Endpoint input constraints, auth validation, and database updates are covered.
