# Observability and Incident Response

Meshwork Studio exposes health signals, Prometheus metrics, structured process
logs, and application metrics history. This document describes how to use them;
it does not claim that an external scraper, dashboard, or alert destination has
already been configured.

## Health signals

| Endpoint                            | Purpose                                                | Expected result                                                            |
| ----------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `GET /health`                       | Liveness plus Node dependency health                   | `200` and `status: healthy`; `503` when a required dependency is degraded. |
| `GET /ready`                        | Readiness for traffic after application initialization | `200` only after startup and required dependency checks pass.              |
| `GET http://127.0.0.1:8081/healthz` | Go auth service liveness                               | `200` when the auth process is healthy.                                    |
| `GET http://127.0.0.1:8081/readyz`  | Go auth service readiness                              | `200` after auth dependencies and migrations are ready.                    |

Use `/ready` to gate a deploy. A `200 /health` does not prove that an
authenticated browser session, canvas write, or external email provider works.

## Metrics

The Node monolith serves Prometheus output at `/metrics` only when
`METRICS_BEARER_TOKEN` is configured and the request supplies
`Authorization: Bearer <token>`. Otherwise it deliberately returns `404`.
The Go auth process exposes Prometheus metrics on loopback port `9091`; do not
route either metrics surface publicly without network and token controls.

Authenticated users can access stored application history through:

| Endpoint                             | Access       | Purpose                                                |
| ------------------------------------ | ------------ | ------------------------------------------------------ |
| `GET /api/v1/metrics/history?limit=` | Session      | Recent stored snapshots; limit is capped at 1440.      |
| `GET /api/v1/metrics/summary`        | Session      | Latest snapshot and aggregates.                        |
| `POST /api/v1/metrics/cleanup`       | Admin + CSRF | Destructively removes snapshots older than seven days. |

## Log sources

| Source              | Command                                                   | Use it for                                                    |
| ------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| Node monolith       | `pm2 logs meshwork`                                       | Request failures, dependency checks, canvas and route errors. |
| Go auth             | `pm2 logs meshwork-auth`                                  | Login, session, MFA, OAuth, and auth readiness errors.        |
| NGINX               | System NGINX access/error logs                            | Upstream routing, TLS, and 4xx/5xx spikes.                    |
| Backup timer        | `journalctl -u meshwork-backup.service -n 100 --no-pager` | Archive success or failure.                                   |
| Docker dependencies | `docker compose logs --tail=100 <service>`                | Postgres, Redis, or local-development DynamoDB failures.      |

Keep request IDs, workspace IDs, and error codes in incident notes. Never paste
cookies, bearer tokens, passwords, assertion keys, or raw environment files.

## First response guide

| Symptom                      | Check                                                 | Safe first action                                                                                   |
| ---------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/ready` is `503`            | `pm2 logs meshwork`, Postgres/Redis availability      | Restore the failed dependency or roll back the last deploy; do not repeatedly restart blindly.      |
| Auth login fails             | `meshwork-auth` health and logs, CSRF origin          | Confirm the Go service is reachable and public URL/origin configuration matches the browser origin. |
| Canvas save returns `409`    | Response revision and browser cache                   | Reload the durable canvas, merge/retry from the current revision.                                   |
| Canvas save returns `503`    | Canvas route logs and DynamoDB health                 | Keep local cache; retry after the write lock or dependency failure clears.                          |
| Canvas copy is `failed`      | Workspace copy state and worker logs                  | Fix the underlying failure, then use the authorized retry endpoint.                                 |
| Sudden `403` on owner access | Workspace `userId`, auth identity, team resolver logs | Verify direct ownership before changing roles or disabling authorization.                           |
| High error or latency rate   | NGINX + process logs, dependency metrics              | Identify the failing upstream before scaling or restarting.                                         |

## Minimum alert policy

Before relying on the service in production, configure an external destination
for these conditions:

1. `/ready` remains non-`200` beyond the agreed deployment window.
2. Node, auth, NGINX, or backup service repeatedly exits or restarts.
3. Backup completion manifest is missing or the backup timer exits non-zero.
4. DynamoDB throttling, canvas write failures, or sustained 5xx responses rise.
5. Disk, memory, CPU, and database connection use approach the `t3.small`
   capacity limit.

Define actual thresholds from measured baseline traffic. Record the alert owner,
destination, and tested escalation path with the production deployment record.
