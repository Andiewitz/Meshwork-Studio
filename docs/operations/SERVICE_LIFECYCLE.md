# Service lifecycle and readiness

The Node document server requires Workspace and Team database migrations at boot.
AI and Metrics are optional: if their database configuration, migration, or
startup fails, document routes still start and those capabilities return a
service-unavailable response. Fix the cause and restart the process to retry.
A core migration failure stops startup.

`/live` is process liveness. `/ready` is ready only after application startup,
Workspace SQL, configured Redis, and an active DynamoDB Canvas table respond.
Its existing response format is unchanged. A key-protected
`/internal/v1/capabilities` endpoint reports AI, Metrics, and Canvas status;
AI and Metrics reflect startup plus their current database probe, not the health
of external AI vendors. Keep `/internal/*` inaccessible through the public proxy.
Canvas readiness requires `dynamodb:DescribeTable` permission. If Canvas uses S3
for overflow, readiness does not validate S3 permissions or existing objects.

Each schema migration session holds a PostgreSQL advisory lock while inspecting
and applying migrations. The lock covers the database (including shared schema
history), serializing other versions of this runner on that database. Older app
versions which do not acquire the lock are not coordinated; do not run old and
new migration runners concurrently. A broken connection is discarded if its
lock cannot be released.

On SIGTERM/SIGINT the server marks itself unready, rejects new work, closes
WebSockets, stops outbox claims, and waits for active HTTP requests and outbox
work before closing collectors, database pools, Redis, Canvas clients, and the
metrics listener. The process exits unsuccessfully after 15 seconds if draining
has not finished. Slow work must be retried by its caller or durable queue.
The current automated checks exercise the migration and drain logic with mocks
and a local HTTP server; concurrent PostgreSQL runners, real DynamoDB/S3, and
an actual deployment SIGTERM still require infrastructure-backed verification.

## Jenkos database configuration

Jenkos uses exactly one logical database at runtime: `JENKOS_DATABASE_URL` when
set, otherwise `AI_DATABASE_URL`. Backup tooling follows the same precedence.
Compose currently provisions both database names, but the runtime does not merge
them. Before removing either URL or database, inventory where real data and
backups reside and test restoration. Do not drop a database automatically.
If rolling back, restore the previous application version and its original
configuration together; the older migration runner does not honor the new lock.
