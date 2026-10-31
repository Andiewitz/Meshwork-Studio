## Outcome

Make Meshwork's modules independently extractable while keeping the existing
single EC2 deployment affordable. Preserve Go identity as a separate service,
make Workspace the authority for document access, keep Canvas behind a narrow
document API, and prepare AI and Collaboration for independent deployment.

This tracks the 2026-10-26 service-boundary audit of main at
`bbfec7f501fc27ee3a9f13703e2b3c8ef16856c2`. The audit and AWS foundation changes
also exist locally and have not been pushed by this task. This issue does not
claim the planned refactors or AWS workers are deployed.

## Plan

1. Correct internal routing/auth-client failures and protect outbox delivery.
2. Introduce narrow module APIs and contracts with enforceable import rules.
3. Finish workspace collaborators and move realtime ownership out of Teams.
4. Define safe Canvas document operations and explicit module lifecycle.
5. Add cross-boundary telemetry and durable identity cleanup where applicable.
6. Extract AI on the same EC2; add a bounded Canvas AWS worker after its
   consistency and delivery gates pass. Realtime process extraction is optional.

## Implementation issues

- [ ] #50 — correct stats routing, identity credentials, and unavailable results (P1).
- [ ] #51 — replace repository registry access with narrow module APIs (P1).
- [ ] #52 — isolate public DTOs and enforce resolved module imports (P2).
- [ ] #53 — unify workspace permissions and decouple realtime from Teams (P1).
- [ ] #54 — require confirmed delivery and fence worker claims (P1).
- [ ] #55 — coordinate snapshot reads, copy retries, and deletion fencing (P1 before Canvas extraction).
- [ ] #56 — add module health, draining, and locked migrations (P2).
- [ ] #57 — define durable cross-domain account cleanup before exposing deletion (P2; prerequisite for account deletion).
- [ ] #58 — carry service and operation context across module boundaries (P2).
- [ ] #59 — extract Jenkos into an independently managed EC2 process (P3; extraction after foundations).
- [ ] #60 — execute durable document jobs through SQS and Lambda (P3; extraction after foundations).
- [ ] #61 — support independent collaboration deployment on the existing EC2 (P3; optional later extraction).

Each child issue links its prerequisites. SB identifiers map to the linked
GitHub issues; the native sub-issue hierarchy also tracks this work.

P1/P2/P3 describe implementation order, not security severity or a delivery date.

## Existing work to coordinate

- #48 owns Canvas storage/performance work. Its description reports local
  implementation with real AWS/load acceptance pending, while main still has
  the audited per-item implementation. Reconcile the implementing branch before
  changing Canvas storage. Extend its design/tests rather than creating a second
  competing persistence model.
- Continue the existing workspace collaborators replacement plan. Preserve its
  explicit team-grant cutover, backup, and rollback procedure.
- Reuse the locally implemented Cognito/SQS/SES, S3 backup, and CloudWatch
  foundation when landed; do not create parallel Terraform stacks.

## Architecture constraints

- Keep database ownership private to each domain; one PostgreSQL host is fine.
- Prefer typed local calls while modules share a process. HTTP and queues enter
  at real deployment/asynchronous boundaries.
- Keep NGINX as the single public origin and retain the existing EC2 initially.
- Do not add Aurora/RDS, NAT gateways, ALBs, Kubernetes, or an always-on managed
  runtime as part of this tracker.
- Preserve existing identities, sessions, document revisions, recovery paths,
  and authorization behavior through explicit migrations and rollback notes.
- Account deletion and optional later process extraction have their own release
  gates; they do not block landing the initial correctness fixes.

## Completion criteria

- [ ] Required modules consume only declared public contracts and capabilities.
- [ ] Workspace owns access decisions consistently across HTTP and WebSockets.
- [ ] Durable operations survive duplicate delivery, missing consumers, process
      interruption, and replay without false completion or data resurrection.
- [ ] Per-module health/draining and migration ownership are enforced and tested.
- [ ] Independently deployed modules retain usable telemetry and rollback paths.
- [ ] Every implemented stage documents verification evidence and any operator
      action required; optional/deferred work remains explicitly marked.

## Audit evidence

The audit ran 36 focused architecture/outbox/event/authz/metrics/WebSocket tests,
all passing. Memory-only diagnostics using actual code reproduced stats-route
shadowing, auth's wrong default stats URL, and outbox acknowledgment with zero
consumers. Concurrency findings are code-derived and need infrastructure-backed
tests. Passing the current suite does not establish extraction safety.
