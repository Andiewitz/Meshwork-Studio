# Offline single-host account cleanup

This operator workflow prepares the durable Identity cleanup worker. It is for a
single application host only. Account deletion remains unavailable in the UI;
this is not a live self-service deletion workflow. The full Canvas cleanup has
not yet been verified against real DynamoDB/S3.

The operator must stop **all** Node app and Go identity processes, drain any
in-flight work, and keep them stopped throughout the fencing period. In Docker,
loopback checks inside a one-off container do not see other containers; the
operator must verify that all app and identity containers are stopped. This
includes background workers and other application instances. A closed local
port alone does not prove processes are stopped. Do not use this procedure for
multiple hosts or if the maximum lifetime of previously issued assertions is
unknown. Use a separately designed distributed fence for those cases.

Configure `AUTH_DATABASE_URL` for the Identity database. From
`server/services/auth`, prepare a cleanup with the Identity user ID:

```powershell
go run ./cmd/cleanupctl -action=prepare -user-id USER_ID -single-host-services-stopped
```

Record the operation ID printed by the command. The account is deactivated,
sessions are revoked in PostgreSQL, and the operation remains in `fencing`.
Keep all services stopped for at least the **longest lifetime ever configured
for any assertion that could still be valid**, plus one minute for clock skew.
If that lifetime is unknown, do not activate the cleanup. Repeating `prepare`
with `-operation-id` resets the waiting period.

While services are still stopped, activate the same operation. For example,
only when five minutes is known to cover all previously issued assertions:

```powershell
go run ./cmd/cleanupctl -action=activate -operation-id OPERATION_ID -assertion-max-age 5m -single-host-services-stopped
```

The command checks the local Node and Identity ports (defaults 5000 and 8081;
use `-node-port` and `-auth-port` for different ports), the elapsed time,
account state, and session revocation. It cannot verify other hosts, other
ports, process state after a listener has closed, or the historical assertion
lifetime: the operator's attestation covers those facts.

To process pending work after restarting services, set
`AUTH_CLEANUP_BRIDGE_URL` to the internal Node origin and
`AUTH_CLEANUP_BRIDGE_KEY` to Node's `INTERNAL_API_KEY` in the Identity service.
For Compose, an internal origin is `http://meshwork-backend:5000`; set the
bridge key to the same value as `INTERNAL_API_KEY` without putting it in logs.
The identity image includes `/app/cleanupctl` for an operator-run one-off
container. Do not run the tool in the same container as a live identity server.
Node must be able to call the Identity internal endpoint with
`AUTH_SERVICE_URL` and `AUTH_INTERNAL_KEY`. Do not route `/internal/*` through
public ingress. A missing service, failed Canvas cleanup, or unavailable bridge
keeps work pending for retry. Workspace must report Canvas completion before the
Identity worker removes the account. The worker retains Identity security audit
rows and the operation record; their retention period needs an explicit policy.

Inspect `account_cleanup_operations` and `account_cleanup_steps` in the Identity
database and the Workspace outbox when troubleshooting. `fencing` is not
claimable; `pending` retries; `completed` means the three service commands
returned completed receipts and the Identity transaction committed. These
records do not prove deletion from external backups or third-party providers.
