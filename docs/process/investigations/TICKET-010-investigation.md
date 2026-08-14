# Investigation: TICKET-010 (Test Coverage Analysis)

## Findings

I conducted an extensive test coverage calculation across the entire monolith using Vitest (`npx vitest run --coverage`).

1. **Current Coverage Stats**:
   - The current repository runs exactly **55 tests**.
   - These tests are localized almost _entirely_ to two files: `tests/integration/auth/lockout-routes.test.ts` and `tests/unit/auth/lockout.test.ts`.
   - **Result**: The Account Lockout logic has fantastic, enterprise-grade coverage.
   - **Vulnerability**: Every other feature in the application (including Workspace CRUD, Canvas Math, and AI parsing) has absolutely **0% test coverage**.

2. **Critical Un-Tested Paths**:
   - **Canvas Math**: The utility functions inside `client/src/features/workspace/utils/containment.ts` calculate complex spatial boundaries when dragging architectures. A refactor here could easily break dragging logic invisibly.
   - **Workspace Authorization**: While the code manually checks `if (existing.userId !== userId)`, there are zero API test assertions guaranteeing that this IDOR protection isn't accidentally deleted or bypassed in the future.
   - **Database Inserts**: Zod schemas are used during `POST`, but testing doesn't exist for malformed database injects.

3. **Missing Tooling for Enterprise Standard**:
   - Vitest handles Unit/Integration perfectly, but this is a highly visual, drag-and-drop SPA (Single Page Application). You cannot fully test an interactive Canvas with purely Node-based Unit tests. It requires an End-to-End (E2E) browser driver.

## Questions Answered

- **What test coverage exists?** Strong coverage on Auth Lockouts. Zero coverage elsewhere.
- **Do existing tests pass?** Yes, all 55 tests pass phenomenally in under 500ms.
- **What critical functionality is untested?** ReactFlow canvas component and Auth routing IDOR guards.
