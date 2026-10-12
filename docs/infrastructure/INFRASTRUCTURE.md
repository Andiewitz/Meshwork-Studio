# Infrastructure Topology

This is the current architecture reference. For a deploy or incident, use the
operational runbooks rather than treating this page as a command manual.

## Supported production shape

Meshwork Studio currently targets one Ubuntu 22.04 EC2 `t3.small` instance in
`us-east-1`. It is intentionally a single-host deployment; the archived
Terraform material is not a supported ECS/Fargate deployment path.

[`deploy/ec2-user-data.sh`](../../deploy/ec2-user-data.sh) is a historical
Amazon Linux bootstrap example, not a bootstrap script for this Ubuntu profile.
Do not apply it to the production host without a reviewed OS-specific update.

```text
Internet
  -> NGINX (:80/:443, TLS and static assets)
      -> Go auth service (:8081)
      -> Node monolith (:5000)
          -> PostgreSQL domain databases
          -> Redis
          -> DynamoDB canvas table
```

NGINX proxies `/api/v1/auth/*` and `/api/v1/user/*` to the Go service. Other
`/api/*`, WebSocket, health, and readiness requests go to the Node monolith.
The exact NGINX root path is host-specific; validate it against the deployed
application directory before reloading NGINX.

## Data stores

| Store      | Purpose                                                   | Production boundary                                  |
| ---------- | --------------------------------------------------------- | ---------------------------------------------------- |
| PostgreSQL | Separate auth, workspace, team, AI, and metrics databases | Not publicly exposed; each service uses its own DSN. |
| Redis      | Auth/session support, rate limits, and WebSocket pub/sub  | Not publicly exposed.                                |
| DynamoDB   | Durable canvas nodes, edges, revision, and write lease    | App IAM is limited to the canvas table.              |

The repository's Docker Compose setup is the supported local stack. It is not
a production disaster-recovery plan. Production uses managed DynamoDB with
point-in-time recovery and an off-host backup archive.

## Runtime processes

| Process                     | Owner           | Health endpoint                 |
| --------------------------- | --------------- | ------------------------------- |
| `meshwork` PM2 process      | Node monolith   | `http://127.0.0.1:5000/ready`   |
| `meshwork-auth` PM2 process | Go auth service | `http://127.0.0.1:8081/healthz` |
| NGINX                       | System service  | `sudo nginx -t` before a reload |

Use `docker compose ps` on a repository-managed host instead of relying on
historical individual container names. A host that still has a split or legacy
container layout needs an explicit migration record before it is changed.

## Configuration and access

The authoritative variable inventory and rotation impact are in
[`SECRETS.md`](../operations/SECRETS.md). Keep the protected server `.env` at
the deployed application directory with mode `600`; do not copy local
development values to production.

The deployment user needs only the OS, Docker/PM2, and application-directory
permissions documented in [`DEPLOYMENT.md`](../operations/DEPLOYMENT.md). AWS
credentials and IAM setup are separate operator responsibilities and are never
stored in this repository.

## One-time rename: `emnesh-*` → `meshwork-*` (operator action required)

Docker containers, images, and hostnames were renamed to `meshwork-*`. The
Postgres databases inside (`auth_db`, `workspace_db`, …) did **not** change,
so no SQL migration is needed — but the compose project rename changes Docker
volume prefixes, and volumes cannot be renamed in place. On any host with
existing data:

1. Back up first: `npm run db:backup` (verifies the off-host S3 archive).
2. `docker compose down` (leaves `emnesh-studio_*` volumes in place).
3. `docker compose up -d` (creates fresh `meshwork-studio_*` volumes).
4. Restore from the backup drill: `npm run db:restore:drill` into the new
   volumes, verify row counts, then cut over.
5. Only then `docker volume rm` the old `emnesh-studio_*` volumes.

Fresh hosts skip all of this — first boot provisions `meshwork-*` directly.

## Growth boundaries

Move away from this topology only when observed limits justify it:

| Signal                                                             | Next design decision                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Sustained CPU or memory pressure                                   | Resize the instance before introducing distributed coordination.         |
| Database storage, backup, or recovery requirements exceed one host | Move PostgreSQL to managed RDS with a rehearsed migration.               |
| DynamoDB throttling or large-canvas latency                        | Revisit capacity, item model, and write batching using measured traffic. |
| Multiple app instances required                                    | Externalize session/pub-sub dependencies and introduce a load balancer.  |

See [`PLAN.md`](../archive/PLAN.md) for the cost/reliability assumptions behind these
triggers. The historical Terraform files under `docs/archive/` are reference
material only.
