# Test effectiveness audit

This is a targeted audit of test configuration and representative AI, canvas,
metrics, security, deployment, and system tests; it is not a line-by-line review
of every test or proof that the deployed application works.

## Findings and priorities

1. **AI provider contract (fixed locally).** The resolver test expected an
   OpenRouter key to be sent to Gemini. The route integration test mocked the
   Gemini adapter, so it could not catch the wrong provider/key combination.
   The corrected tests assert the provider and key, and a new network-boundary
   test runs the real adapter with simulated upstream responses. It verifies a
   free OpenRouter model, tool forwarding, Gemini settings and failure handling.
   It does not contact a provider or verify production credentials and quotas.
2. **Empty AI output (fixed locally).** The editor converted an empty answer
   into “Architecture analyzed.” A test now requires an actionable failure
   instead of that false success. The Gemini output limit and thinking level
   were adjusted, but a real model can still return an unusable answer.
3. **AI rate limits (open).** Both chat limiters skip all requests when
   `NODE_ENV=test`; standard tests therefore cannot demonstrate that the
   limits, per-user isolation, or 429 responses work. Test the actual middleware
   with an isolated in-memory store and a testable clock without disabling it.
4. **Deployed AI flow (open).** The production smoke test covers readiness,
   anonymous authorization and login rendering; it does not sign in, send an
   AI prompt, or verify a canvas change. Add an opt-in authenticated smoke test
   using a disposable account and a controlled provider with predictable tool
   output. A separate manually authorized provider check is needed to validate
   real keys, model availability, and quotas.
5. **Metrics aggregate assertions (open).** The live dashboard test checks
   field types and access control, but a wrong numeric value could pass. Add
   controlled traffic with known status codes and endpoint counts, and check
   exact aggregates and isolation. Domain count tests already assert distinct
   values, missing dependencies, and genuine zeros.
6. **Deployment artifact checks (open).** The Docker artifact contract test
   checks literal source strings, including a hard-coded base image. It can
   fail on a harmless version update or pass while a build is unusable. Keep
   critical input checks, but rely on a real clean image build and startup
   check for deployability.
7. **Infrastructure and recovery (open).** Fast Vitest intentionally excludes
   system tests, and mocks cannot establish DynamoDB transaction behavior,
   Redis replay behavior or AWS permissions. CI provisions local services;
   inspect actual CI outcomes and run infrastructure-backed tests after changes.
   The Redis replay test and DynamoDB tests have not been run on this machine.
   Real cross-service deletion with DynamoDB and S3 remains unverified.
8. **Client streaming (open).** `aiService.streamChat` parses each network
   chunk separately and ignores malformed JSON. There is no behavioral test for
   events split across chunks, provider errors or interrupted streams. Test
   those cases before relying on that streaming path; the editor agent currently
   uses non-streaming chat.
9. **User-visible model selection (open).** The editor sends Gemini model
   names, but the resolver only accepts its allowlist and may use OpenRouter
   as a fallback. A selection can therefore differ from the model actually
   used. Define an explicit provider/model contract and test the actual choice,
   without silently routing users to a paid model.

## Good examples to retain

Canvas tool tests check preservation of existing nodes and deletion of dependent
edges. Encryption tests check authentication-tag tampering, not merely that
ciphertext exists. Metrics domain tests distinguish failed dependencies from
real zero counts. These assertions express useful outcomes, although mocked
boundaries remain no substitute for infrastructure-backed checks.

## Review rule for future tests

State the observable user or security outcome first, choose inputs independently
of the implementation, and include a case that would fail if that outcome were
broken. Use mocks at real external boundaries, test failure paths, and label
what the test does not verify. Avoid asserting imported defaults or only checking
that a function was called when those values themselves are under test.
