# Test Suite

The test folders describe the dependency boundary, not just the code area.

- `unit/` — isolated logic, schemas, storage behavior, and route handlers with
  collaborators mocked.
- `integration/` — multiple application modules exercised through an HTTP or
  service boundary, without external cloud services.
- `system/` — real local infrastructure (DynamoDB Local and WebSocket server).
  These are deliberately excluded from the default Vitest include so a local
  run never reports infrastructure coverage as a skip.
- `e2e/` — Playwright browser journeys.

Commands:

- `npm run test:unit`
- `npm run test:integration`
- `npm run test:system` — requires DynamoDB Local on `127.0.0.1:8000`.
- `npm run test:run` — the fast unit and integration suite.
- `npm run test:e2e` — browser tests.

Do not put live vendor API checks in Vitest. They are non-deterministic, can
consume paid tokens, and can pass without performing an assertion when a key is
missing. Use a separately approved operational smoke check for them instead.
