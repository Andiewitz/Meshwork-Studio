# Implementation Plan: TICKET-010 (Enterprise Testing Strategy)

## Decision & Strategy

The application requires an **Enterprise-Grade Testing Pyramid**. Since we just successfully executed rigorous security refactors (Tickets 001, 002), we need automated assertions guaranteeing these fixes never regress.

Our strategy dictates building three distinct suites:

1.  **Pure Unit Tests** for deterministic, fast algorithmic checks.
2.  **API Integration Tests** (using `supertest` or native `fetch` with an isolated testing database).
3.  **End-to-End Visual Automation** (Playwright) to actually drive the Canvas interactions.

## Exact Implementation: What We Will Test First

### 1. Test the Workspace Routing Strictness (Integration)

Because we just cleaned up the Express `req.user` typings inside `server/modules/workspace/routes.ts` (Ticket 002), we will write a Vitest Integration test suite specifically for `workspace.routes.test.ts`.

**Testing Scenario (IDOR Verification):**

```typescript
it("should return 401 Unauthorized if User A attempts to PUT to User B's Workspace", async () => {
  const workspaceOwnedByB = await db
    .insert(workspaces)
    .values({ userId: "b_id", title: "Test" });

  // Simulating User A logging in:
  const agent = simulateLogin("a_id");

  const response = await agent
    .put(`/api/workspaces/${workspaceOwnedByB.id}`)
    .send({ title: "Hacked!" });

  expect(response.status).toBe(401);
  expect(response.body.message).toBe("Unauthorized");
});
```

### 2. Test Zod Injection Mitigation (Integration)

Recently, we wrapped `server/modules/workspace/routes.ts` PUT calls in Zod schema parsers. The tests will intentionally pass malformed blobs to the server.

- **Assertion**: Ensure the server returns a 400 Bad Request instead of throwing an unhandled database exception.

### 3. Test the Bounding Box Math (Unit)

The utility `client/src/features/workspace/utils/containment.ts` has pure javascript functions like `calculateContainment(node, nodes)`.

- **Assertion**: Manually configure two ReactFlow Object Nodes with distinct X/Y coordinates, overlapping them intentionally. We will assert that the `parentId` correctly snaps to the target.

### 4. End-to-End Visual Sandbox (Playwright)

Because the core application is a visual IDE, mocking responses in Vitest misses the real value.
We will install Playwright (`npm init playwright@latest`) and write a single MVP browser script:

- Open Chromium, navigate to localhost.
- Log in realistically.
- Click the "Library" to open a diagram.
- Assert the `<canvas>` DOM element renders successfully without crashing into the new 404 Error boundary.

## Priority Order Execution

If APPROVED, I will execute these in sequential stages:
A) Integration Setup (`supertest` + Drizzle SQLite in-memory or Postgres Docker).
B) Write IDOR Auth Tests for Workspaces.
C) Write Unit Tests for Canvas Containment Math.
D) Configure Playwright for the E2E Sanity Check.
