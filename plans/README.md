# Implementation plans

Active plans live here. A plan is a proposal until its tasks are implemented
and its acceptance checks pass. Completed point-in-time audits are kept as
history in [`docs/archive/plans/`](../docs/archive/plans/).

| Plan                                                                | Status    | Scope                                                  |
| ------------------------------------------------------------------- | --------- | ------------------------------------------------------ |
| [Collaborators replacement plan](COLLABORATORS-REPLACEMENT-PLAN.md) | Active    | Team replacement, workspace collaborators              |
| [Load test — t3.small capacity](LOAD-TEST-T3-SMALL.md)              | Active    | k6 capacity testing on a 2 vCPU / 2 GiB envelope       |
| [AWS microservices wish list](AWS-MICROSERVICES-WISH.md)            | Wish list | Target AWS instance classes, gRPC seams, scaling path  |
| [Scale audit — 1M concurrent](SCALE-AUDIT-1M.md)                    | Audit     | Blockers, 1M arithmetic, staged roadmap, learning list |
| [AWS portfolio plan](AWS-PORTFOLIO-PLAN.md)                         | Implemented locally; AWS pending | Cognito, queued email, S3 backups, observability, and a minimal AWS budget      |
| [Service boundary audit](SERVICE-BOUNDARY-AUDIT.md)                 | Audited; improvements planned    | Module APIs, permissions, durable operations, lifecycle, and service extraction |
| [Technical debt and latency review](TECHNICAL-DEBT-LATENCY-2026-10-31.md) | Audit | Historical debt, realtime and query latency, and verification gaps |

Archived (implemented or superseded): codebase reliability, CI/CD, node system,
open-source readiness, test suite, and Q5 backup & recovery audits — see
[`docs/archive/plans/`](../docs/archive/plans/). The broad cleanup history is
[`docs/archive/PLAN.md`](../docs/archive/PLAN.md).
