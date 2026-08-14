# Testing Strategy

> How Meshwork Studio validates correctness across every layer of the stack.

## Table of Contents

1. [Philosophy](#philosophy)
2. [The Testing Pyramid](#the-testing-pyramid)
3. [Running Tests](#running-tests)
4. [Unit Tests](#unit-tests)
5. [Integration Tests](#integration-tests)
6. [End-to-End Tests](#end-to-end-tests)
7. [Type Safety as a Test](#type-safety-as-a-test)
8. [Writing New Tests](#writing-new-tests)

---

## Philosophy

We follow three rules:

1. **Test behavior, not implementation.** We don't care _how_ a function calculates containment — we care that dropping a node at `(150, 150)` inside a `500×500` container returns the correct parent ID.

2. **Every security boundary gets an integration test.** If a route checks ownership, there's a test proving that User A cannot touch User B's workspace.

3. **TypeScript is our first line of defense.** The project must pass `npm run check` with zero errors before any code is merged. This catches entire categories of bugs that other projects discover at runtime.

---

## The Testing Pyramid

```
          ┌─────────┐
          │   E2E   │  Playwright (browser)
          │  Tests  │  "Does the app actually render?"
          ├─────────┤
          │ Integr- │  Supertest (HTTP)
          │  ation  │  "Do the API routes protect data?"
          ├─────────┤
          │  Unit   │  Vitest (pure functions)
          │  Tests  │  "Is the math correct?"
          └─────────┘
```

| Layer           | Tool               | Speed  | What It Catches                              |
| --------------- | ------------------ | ------ | -------------------------------------------- |
| **Unit**        | Vitest             | ~50ms  | Algorithm bugs, math errors, edge cases      |
| **Integration** | Vitest + Supertest | ~200ms | Auth bypass, IDOR, validation failures       |
| **E2E**         | Playwright         | ~5s    | Blank screens, React crashes, broken routing |

---

## Running Tests

### All Tests (Recommended)

```bash
# Run the full suite
npm run test:run
```

### By Category

```bash
# Unit tests only
npx vitest run tests/unit

# Integration tests only
npx vitest run tests/integration

# Auth lockout tests specifically
npm run test:lockout

# E2E tests (requires dev server running)
npx playwright test
```

### With Coverage Report

```bash
npm run test:coverage
```

This generates an HTML report in `coverage/` showing exactly which lines of code are exercised by tests.

### Interactive Mode (Watch)

```bash
npm run test
```

This watches for file changes and re-runs affected tests automatically. Useful during development.

---

## Unit Tests

Unit tests validate **pure logic** — functions that take inputs and return outputs with no database, no network, no side effects.

### Canvas Containment Math

**File:** `tests/unit/workspace/containment.test.ts`

These tests verify the spatial logic that determines whether a dragged node lands inside a container (like a VPC or Kubernetes namespace).

| Test                                            | What It Proves                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| _Should snap a node inside a valid container_   | A node dropped at `(100, 100)` inside a `500×500` container correctly returns `parentId: "vpc-1"`      |
| _Should return undefined when outside_          | A node dropped at `(600, 600)` outside all containers returns no parent                                |
| _Should not reparent if already in that parent_ | Moving a node within its current parent doesn't trigger unnecessary state updates                      |
| _Should calculate global position_              | Converting from local `(50, 50)` inside a parent at `(200, 200)` correctly returns global `(250, 250)` |
| _Should return undefined with no parent_        | Nodes without parents have no global position to calculate                                             |

### Canvas Local Cache

**File:** `tests/unit/workspace/canvas-cache.test.ts`

These tests verify the localStorage persistence layer that acts as an offline-first fail-safe for unsaved canvas changes.

| Test                                             | What It Proves                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| _Should save canvas data with a timestamp_       | `saveCanvasToLocalCache` writes nodes, edges, and a Unix timestamp to localStorage |
| _Should retrieve correctly parsed canvas data_   | `getCanvasFromLocalCache` reads and correctly parses stored JSON                   |
| _Should return null if no cache exists_          | Returns `null` for an unknown workspace ID — no exception thrown                   |
| _Should clear only the specific workspace cache_ | `clearCanvasLocalCache(42)` removes workspace 42 but leaves workspace 99 intact    |
| _Should handle corrupt JSON gracefully_          | Returns `null` and fires `console.warn` instead of crashing the app                |

**Note on environment:** Vitest runs in a Node environment where `localStorage` doesn't exist. These tests use `vi.stubGlobal` to mock it:

```typescript
let mockStorage: Record<string, string> = {};

beforeEach(() => {
  mockStorage = {};
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key) => mockStorage[key] || null),
    setItem: vi.fn((key, value) => {
      mockStorage[key] = value;
    }),
    removeItem: vi.fn((key) => {
      delete mockStorage[key];
    }),
    clear: vi.fn(() => {
      mockStorage = {};
    }),
  });
  vi.clearAllMocks();
});
```

Use this same pattern in any future test that interacts with browser storage APIs.

### Auth Lockout Logic

**File:** `tests/unit/auth/lockout.test.ts`

These tests verify the brute-force protection math — lockout durations, attempt counting, and progressive delays. Extensive test cases cover every edge case of the lockout algorithm.

---

## Integration Tests

Integration tests spin up a real Express server (with mocked database calls) and fire actual HTTP requests using [Supertest](https://github.com/ladislav-zezula/supertest). They verify that the security boundaries actually work.

### Workspace Route Protection

**File:** `tests/integration/workspace/routes.test.ts`

| Test                                            | What It Proves                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| _IDOR: User A cannot modify User B's workspace_ | `PUT /api/workspaces/1` with `userId: "user_A"` against a workspace owned by `"user_B"` returns `401 Unauthorized` |
| _404 for missing workspaces_                    | Requesting a workspace that doesn't exist returns `404` instead of crashing                                        |
| _Zod validation rejects bad input_              | Sending a title longer than 16 characters returns `400 Bad Request` with a human-readable error                    |
| _Valid update succeeds_                         | Owner sending a valid title gets `200 OK` with the updated workspace                                               |

**How Mocking Works:**

```typescript
// We mock the database layer, not the routes
vi.mock("@server/modules/workspace/storage", () => ({
  workspaceStorage: {
    getWorkspace: (...args) => mockGetWorkspace(...args),
    updateWorkspace: (...args) => mockUpdateWorkspace(...args),
  },
}));

// We mock the auth middleware to inject test users
vi.mock("@server/modules/auth", () => ({
  AuthModule: {
    middleware: {
      isAuthenticated: (req, res, next) => {
        req.user = { id: req.headers["x-test-user-id"] };
        next();
      },
    },
  },
}));
```

This lets us test the **route logic** (ownership checks, Zod validation) without needing a real database or real authentication.

### Auth Lockout Routes

**File:** `tests/integration/auth/lockout-routes.test.ts`

Tests that verify the lockout system works correctly at the HTTP level — including progressive delays, lockout expiration, and attempt reset after successful login.

---

## End-to-End Tests

E2E tests use [Playwright](https://playwright.dev/) to launch a real browser and interact with the application the same way a user would.

### Configuration

**File:** `playwright.config.ts`

```typescript
{
  testDir: './tests/e2e',
  webServer: {
    command: 'npm run dev',      // Automatically starts the dev server
    url: 'http://localhost:5000',
    reuseExistingServer: true,   // Won't start a new one if already running
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
}
```

### Current Coverage

**File:** `tests/e2e/canvas.spec.ts`

| Test                                    | What It Proves                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| _Should render without runtime crashes_ | The app loads in Chromium without a white screen of death or React error boundaries firing |

This is a **smoke test** — it catches the catastrophic failures that unit and integration tests can't see (like a missing CSS import crashing the entire React tree).

---

## Type Safety as a Test

TypeScript itself is one of our most powerful testing tools. The project enforces strict mode with zero tolerance for errors:

```bash
npm run check   # Must exit with code 0
```

### What This Catches

- **Unsafe property access**: Every `req.user.id` call is backed by a global type declaration in `server/types/express.d.ts`
- **Schema mismatches**: If someone adds a column to the database schema but forgets to update the API response, TypeScript catches it at compile time
- **Import errors**: Path aliases (`@/`, `@server/`, `@shared/`) are validated against real file paths

### Configuration

The project uses a unified `tsconfig.json` that covers the entire monorepo:

```json
{
  "include": ["client/src/**/*", "shared/**/*", "server/**/*", "tests/**/*"],
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./client/src/*"],
      "@shared/*": ["./shared/*"],
      "@server/*": ["./server/*"]
    }
  }
}
```

---

## Writing New Tests

### Adding a Unit Test

1. Create `tests/unit/<module>/<name>.test.ts`
2. Import from `vitest` and the module under test
3. Use path aliases (`@/`, `@server/`, `@shared/`)

```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "@/utils/myFunction";

describe("myFunction", () => {
  it("should return the correct result", () => {
    expect(myFunction(2, 3)).toBe(5);
  });
});
```

### Adding an Integration Test

1. Create `tests/integration/<module>/<name>.test.ts`
2. Mock the storage layer and auth middleware
3. Use Supertest to fire HTTP requests

```typescript
import request from "supertest";
import express from "express";

const app = express();
app.use(express.json());
registerYourRoutes(app);

it("should return 401 for unauthorized access", async () => {
  const res = await request(app)
    .put("/api/your-route/1")
    .set("x-test-user-id", "wrong-user")
    .send({ title: "Hacked" });

  expect(res.status).toBe(401);
});
```

### Adding an E2E Test

1. Create `tests/e2e/<name>.spec.ts`
2. Use Playwright's `test` and `expect`
3. Start the dev server first (or let Playwright do it)

```typescript
import { test, expect } from "@playwright/test";

test("should show the login page", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.locator("h1")).toContainText("Login");
});
```
