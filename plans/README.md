# Implementation plans

This folder holds focused audits and actionable implementation plans. A plan is
a proposal until its tasks are implemented and its acceptance checks pass.

| Plan                                                        | Status                    | Scope                                                                                                      |
| ----------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Codebase reliability audit](CODEBASE-RELIABILITY-AUDIT.md) | Draft, audited 2026-09-08 | Data safety, auth, failure handling, observability, backups, recovery, t3.small capacity, and cost         |
| [CI/CD audit and repair plan](CI-CD-AUDIT.md)               | Draft, audited 2026-09-06 | GitHub Actions, artifact packaging, EC2 deployment, tests, release automation, recovery, and pipeline cost |

The root [PLAN.md](../PLAN.md) remains the broad cleanup history. The codebase
reliability audit is the current prioritized implementation backlog; the CI/CD
plan expands its pipeline and deployment findings.
