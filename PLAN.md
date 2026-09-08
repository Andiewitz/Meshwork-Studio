# Meshwork Studio — Reliability, Cost, and Cleanup Plan

**Audit date:** 2026-09-06
**Target:** one Linux t3.small EC2 instance in us-east-1

> **Current implementation backlog:** the evidence was refreshed on 2026-09-08 in
> [`plans/CODEBASE-RELIABILITY-AUDIT.md`](plans/CODEBASE-RELIABILITY-AUDIT.md).
> Its P0 data-safety and recovery work takes precedence over older priorities here.

## Executive summary

Meshwork Studio is a React/Vite client, a Node monolith, a Go identity service,
PostgreSQL for relational domains, Redis for sessions/pub-sub, and DynamoDB for
canvas documents. The largest risk is configuration drift: the Docker setup,
PM2 scripts, NGINX config, CI workflow, and docs describe different production
topologies. On a 2 GiB burstable host, fixing that drift is more valuable than
adding new infrastructure.

Complete Priority 0 in order. Do not move to ECS, RDS, ElastiCache, or a
multi-service fleet until the measured growth triggers are met.

## Completed in this cleanup

- Removed the committed 21 MB Go executable. Binaries are CI artifacts, not source.
- Removed the unreferenced archived AI-skill dump (62 files, 22 exact duplicate
  pairs) and the obsolete test README that documented removed test suites.
- Moved runbooks to docs/operations, incident history to docs/archive/incidents,
  and made docs/README.md the documentation index.
- Removed two unreferenced legacy AI sidebars. Jenkos is now the canonical client
  AI module and the active design event is jenkos:designing.
- Replaced stale PostgreSQL canvas-persistence documentation with the actual
  DynamoDB document model.
- Fixed the six lint-blocking metrics errors and several unused frontend imports.
- Applied npm audit fix for production dependencies: the production audit now has
  0 vulnerabilities. Removed unused native bcrypt and sharp, moved lucide-react
  into the frontend workspace that imports it, and removed unused iconoir-react.

## Platform budget

A t3.small has 2 vCPUs, 2 GiB memory, and a 20% baseline per vCPU. It earns
24 CPU credits an hour. Sustained CPU above baseline depletes credits; Unlimited
mode can bill surplus at $0.05/vCPU-hour.

Sources: [AWS T3 specs](https://aws.amazon.com/ec2/instance-types/general-purpose/)
and [AWS CPU-credit model](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-credits-baseline-concepts.html).

| Process                                | Starting steady-state budget | Rule                                             |
| -------------------------------------- | ---------------------------: | ------------------------------------------------ |
| Node monolith                          |                  350–500 MiB | One PM2 instance; restart before host exhaustion |
| Go identity                            |                   80–150 MiB | One process; profile password/MFA spikes         |
| PostgreSQL                             |                  450–650 MiB | Tune connections and shared buffers              |
| Redis                                  |                   50–100 MiB | Set maxmemory and an explicit eviction policy    |
| OS, NGINX, page cache, deploy headroom |                     450+ MiB | Do not spend this headroom                       |

If RSS exceeds about 1.6 GiB, swap grows, or an OOM event occurs, pause feature
work and complete the resource-control tasks first.

## Priority 0 — deterministic deployment

### P0.1 Reconcile the one supported topology

**Why:** source artifacts currently disagree.

- docker-compose.yml defines one emnesh-postgres container; the start script and
  operations guide name separate historical workspace and auth containers.
- deploy/nginx.conf serves an ec2-user path, while runbooks deploy under ubuntu.
- The GitHub deploy workflow transfers a root shared directory that does not
  exist; source is in server/shared.
- scripts/deploy-remote.sh runs drizzle-kit push although active services own
  versioned migrations and the root Drizzle config requires DATABASE_URL.

**Work:**

1. Select and document one production model. The least disruptive model is PM2
   plus host NGINX, with Docker only for PostgreSQL and Redis.
2. Add a checked-in non-secret production settings example: app directory,
   domain, region, ports, and service names. Keep credentials in .env and
   GitHub secrets.
3. Make the start script invoke named Compose services instead of historical
   container names.
4. Transfer exactly the artifacts required by the remote deploy script,
   including the updated script itself; fail if expected inputs are missing.
5. Replace production schema push with explicit versioned migrations. Back up
   before every migration.
6. Add CI validation that compares deployment paths, NGINX root, and service
   names against the one manifest.

**Done when:** a fresh host can be bootstrapped, deployed twice, restarted, and
rolled back without any manual path or container-name edits.

### P0.2 Make Docker CI real

The root Dockerfile copies host node_modules and dist and then tries to copy a
nonexistent shared directory. Replace it with a multi-stage build: install from
workspace manifests, build source, then copy only runtime files and production
dependencies into the final image. Use server/shared. Do not mutate schema in
the image entrypoint. The current CJS server build also emits six import.meta
warnings from server/index.ts and server/static.ts; make the module format and
runtime-directory resolution explicit as part of this change.

**Done when:** docker build succeeds from a clean checkout and the final image
starts without a writable source tree.

### P0.3 Bound database connections and memory

Every Node domain creates a PostgreSQL pool with max 10. Four pools allow 40
connections before Go auth and admin connections; that is excessive for this
host.

- Make pool size configurable.
- Start at two connections per Node domain, 10-second idle timeout, and short
  connection timeout; increase only from measured concurrent query pressure.
- Set PM2, PostgreSQL, and Redis memory ceilings. A small swapfile is OOM
  protection, not capacity.

**Done when:** PostgreSQL stays well below max_connections, there is no growing
swap, and the host has no OOM events under normal load.

## Priority 1 — reliability and security

### Backups and restore

The JSON backup script is useful, but a backup is not evidence until it restores.
Add encrypted daily PostgreSQL and DynamoDB backups, retention, and a monthly
restore drill into an isolated target. Record RPO and RTO.

### Metrics retention

The metrics collector snapshots every 30 seconds: 2,880 rows/day, about one
million rows/year. Cleanup exists but is not scheduled.

- Change small-host collection to every five minutes.
- Schedule daily cleanup; retain 7–30 days based on actual dashboard use.
- Avoid three internal stats calls per sample if the admin dashboard is unused.

### Graceful shutdown

Add SIGTERM and SIGINT handling in server/index.ts that stops HTTP/WebSocket
acceptance, closes PostgreSQL pools and Redis, and finishes within a short
deadline. PM2 restarts must not abruptly cut off canvas saves.

### DynamoDB hardening

Canvas auto-creates its table at boot. Allow that only in local development. In
production, provision the table separately, restrict IAM to it, enable
point-in-time recovery, and alarm on throttling/errors. Benchmark the current
full-partition diff before permitting very large canvases.

### Network exposure

1. Bind PostgreSQL, Redis, and DynamoDB Local to loopback in production, or
   remove their host port mappings.
2. Do not publicly expose Node port 5000 when NGINX is the intended gateway;
   this also preserves the trust-proxy rate-limit assumption.
3. Return only readiness from public health endpoints. Keep memory/dependency
   detail behind authentication.
4. Keep GitHub secret scanning and add a local pre-commit scanner. The tracked
   source scan found no common live-key patterns, but it does not audit history
   or deployment hosts.
5. Run the production dependency audit monthly and make high/critical findings
   fail CI after an agreed remediation window.

## Priority 2 — recurring AWS cost

### Known monthly floor (us-east-1, 730-hour month)

| Item                                  | Planning estimate | Check                   |
| ------------------------------------- | ----------------: | ----------------------- |
| t3.small Linux compute                |      about $15.18 | 0.0208 × 730            |
| One public IPv4                       |       about $3.65 | 0.005 × 730             |
| 30 GiB gp3 EBS                        |       about $2.40 | 0.08 × 30               |
| Total before traffic/backups/DynamoDB |      about $21.23 | verify in Cost Explorer |

Sources: [AWS VPC pricing](https://aws.amazon.com/vpc/pricing/) and
[AWS EBS pricing](https://aws.amazon.com/ebs/pricing/). Stopping EC2 saves
compute but not EBS, snapshots, or public IPv4 allocation.

### Actions

1. Create a monthly AWS Budget with 50%, 80%, and 100% alerts. Tag EC2, EBS,
   DynamoDB, and backups with app=meshwork and environment=production.
2. Confirm gp3 baseline IOPS/throughput. Do not pay for provisioned IOPS without
   measured demand.
3. Use included CloudWatch basic EC2 monitoring first. Alarm on CPU credit
   balance, CPU, status checks, memory, and free disk.
4. If the instance runs 24/7 for a month, use Cost Explorer recommendations
   before committing to a one-year Savings Plan.
5. Evaluate t3a.small first (x86 and lower cost), then t4g.small only after an
   ARM staging deploy. AWS reports T4g as up to 20% lower cost and up to 40%
   better price/performance, but Go and native Node dependencies must be built
   for ARM. [AWS guidance](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances.html).
6. Keep DynamoDB on-demand while traffic is irregular. Reassess provisioned
   capacity only with a steady measured profile. [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/).

### Avoid for now

NAT Gateway, ALB, ECS/Fargate, RDS, ElastiCache, multi-AZ databases, and a CDN
add fixed cost or operational complexity. Add them only when the growth triggers
below require them. Never use Spot for the primary interactive database host.

## Priority 2 — application performance

1. The production client build has a 595 KB Workspace chunk (160 KB gzip) and
   an empty vendor-icons chunk. Profile the large Workspace.tsx editor before
   splitting it; use React profiler commits and large-canvas latency as the
   decision data. Then lazy-load editor-only panels and remove the empty chunk
   from the Vite chunking strategy.
2. Cap AI input context. Canvas JSON and chat history grow with every node;
   send compact graph summaries, set node/edge/token ceilings, and meter free
   tier calls to reduce provider cost and latency.
3. Size-limit and rate-limit WebSocket canvas-sync messages separately from
   REST requests; coalesce cursor traffic.
4. Add pagination and limits to workspace, team, AI conversation, and metrics
   endpoints. Index each new list query and inspect its query plan.
5. Replace JSON string comparison in canvas persistence with stable hashes only
   if profiling proves it is a bottleneck.

## Priority 3 — code and developer experience

1. Resolve lint warnings in focused batches, starting with unsafe any values at
   API boundaries. Do not mass-disable rules.
2. Make @/auth the only frontend authentication import surface, then remove the
   duplicate hooks/use-auth compatibility barrel.
3. Keep server/shared as pure contracts. It currently re-exports team database
   schema details, weakening the intended service boundary.
4. Update landing/dev copy that claims express-session is used; identity is now
   Go-managed opaque sessions.
5. Replace remaining historical Mosh wording only after compatibility is no
   longer needed.
6. Refresh the Browserslist database as a routine dependency-maintenance task;
   the production build currently reports it is 11 months old.

## Growth triggers

| Sustained trigger                           | First response                                    |
| ------------------------------------------- | ------------------------------------------------- |
| RSS > 1.6 GiB, growing swap, or OOM         | t3.medium or resource tuning                      |
| CPU credit balance repeatedly near zero     | profile, then choose larger/non-burstable compute |
| PostgreSQL latency or connection saturation | tune pools/queries, then move PostgreSQL to RDS   |
| Redis persistence/failover requirement      | move only Redis to ElastiCache                    |
| DynamoDB throttling or giant canvases       | redesign canvas item/capacity model               |
| Need deploys without single-host outage     | clean containerization, then ECS/ALB              |

## Verification log

| Check                       | Result                                               | Follow-up                               |
| --------------------------- | ---------------------------------------------------- | --------------------------------------- |
| Type check                  | Passed before cleanup                                | Re-run after every implementation slice |
| Production dependency audit | 3 findings initially; 0 after fix                    | Keep in CI                              |
| Lint                        | 6 errors fixed; warnings remain                      | Reduce in focused batches               |
| Test suite                  | Passed: 319 tests, 5 skipped                         | Keep it in CI                           |
| Production build            | Passed sequentially; Workspace chunk warning remains | Address in Priority 2                   |
| Go tests                    | Go toolchain unavailable on this host                | Run in Go CI/container                  |

## Next session

Implement P0.1 as one focused change: choose the PM2 plus host NGINX plus
Docker-datastore topology, create one production manifest, correct deployment
paths and service names, and validate it on a disposable host. Then complete
P0.3 and run a small load test before adding product features.
