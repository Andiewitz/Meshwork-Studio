# Test Suite Audit

## Changes applied

- Removed three live Gemini tests. They either passed with no assertion when no
  key was present or spent provider quota and accepted rate limits as success.
- Removed schema tests that only asserted imported table objects existed, plus
  an assertion duplicated by an exact array equality check.
- Moved mocked route/event checks from `integration/` to `unit/`; renamed the
  workspace storage test so its purpose matches its subject.
- Moved DynamoDB Local and WebSocket coverage to `system/`. The ordinary suite
  no longer reports them as skipped; CI runs them explicitly after its local
  DynamoDB service is ready.

## Current test tiers

| Tier        | Purpose                      | External dependency | Command                    |
| ----------- | ---------------------------- | ------------------- | -------------------------- |
| Unit        | Logic and mocked boundaries  | None                | `npm run test:unit`        |
| Integration | HTTP/service composition     | None                | `npm run test:integration` |
| System      | DynamoDB/WebSocket contracts | DynamoDB Local      | `npm run test:system`      |
| E2E         | Browser smoke journeys       | Full local stack    | `npm run test:e2e`         |

## Remaining work

1. Add deterministic provider-adapter tests for non-2xx, timeout, disconnect,
   and fragmented SSE bytes; no live provider key should be needed.
2. Replace broad `any`-heavy route mocks with shared typed fixtures.
3. Add a real PostgreSQL migration/outbox integration test; current outbox unit
   coverage proves delivery semantics but not SQL leasing/locking.
4. Track coverage per tier and raise the main-suite threshold from its current
   46% baseline through focused tests, not shallow existence assertions.
