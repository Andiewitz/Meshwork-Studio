# Meshwork backup and restore plan

Status: **implementation plan, not a completed backup system**. The existing runner, monitor, and Terraform have not been verified against the live deployment. Do not switch storage buckets, enable a maintenance job, or declare recovery ready based on this document alone.

## Goal

Recover a project, its access data, canvas, and saved AI architecture plans after accidental deletion or an EC2 failure, with low operating costs. Start with one complete backup per day and 14 days of retention. The initial target is up to 24 hours of lost writes plus backup duration; actual recovery time must be measured in a restore drill. A failed or skipped backup increases the loss window. CloudWatch alerts are not a backup.

## What exists and what is missing

- `scripts/backup-db.ts` dumps the auth, workspace, team, AI/Jenkos and metrics PostgreSQL databases and PostgreSQL roles; scans the canvas DynamoDB table; records checksums; and uploads a manifest last. The production path currently requires DynamoDB point-in-time recovery (PITR). Backups are not automatically running merely because this code exists.
- `scripts/restore-drill.ts` verifies the archive and restores PostgreSQL and DynamoDB into explicitly isolated targets. It does not restore canvas or architecture-plan S3 objects.
- The backup bucket, a nightly timer installer, a backup-age monitor, retention rules and role policies exist in `infra/aws`. Their presence in Git does not show that they are installed or operating in AWS.
- Large canvas documents may have DynamoDB pointers to S3 objects. AI plans are separately stored in S3. Neither set of objects is currently in the backup archive.
- A strongly consistent DynamoDB scan is consistent at the item level, not a snapshot across the entire scan. PostgreSQL dumps taken separately also do not form an atomic snapshot across services. A backup can therefore contain incompatible versions even when every file uploaded successfully. See [DynamoDB Scan API](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Scan.html).

## Proposed first version

### 1. Establish a consistent backup window

Implement an explicit, fail-closed maintenance mode for the single running instance. Before capture, prevent all mutations to the relevant PostgreSQL databases, DynamoDB canvas records, and both S3 object sets. This includes authenticated API writes, canvas autosaves, WebSocket changes, auth changes, deletes, background/outbox handlers, scheduled work and any other writers. Stop accepting new writes and wait for in-flight writes and cleanup jobs to finish; verify the drain before starting the backup. Reads may remain available only if they cannot trigger writes. If any writer cannot be fenced or drained, abort rather than label the archive consistent.

Hold the fence throughout all dumps, table reads, S3 inventory and object copying. Release it in a `finally` path on success, failure or cancellation. Add an operator-visible watchdog and a documented safe recovery procedure for a crashed backup so the site cannot remain indefinitely stuck in maintenance. A timeout alone must not permit new writes while the old backup is still running. Measure the read-only window before scheduling it nightly.

This is a deliberate short interruption, suitable for one low-traffic EC2 instance. It does not automatically scale to multiple servers or unknown external writers. If that becomes unacceptable, replace it with a separately designed snapshot/change-log protocol; do not remove the fence while claiming cross-service consistency.

### 2. Extend the archive

Keep the existing five database dumps, role dump and DynamoDB scan. Inventory S3 objects only after the fence is established:

1. Parse the captured DynamoDB records and collect every S3 object key referenced by a canvas snapshot. Copy each referenced object's exact bytes from the configured canvas bucket. An absent object, invalid pointer or hash mismatch fails the backup. Inline and chunked canvas data remain in the table archive. Do not rely on S3 listing alone to establish which canvas objects are required.
2. Enumerate all paginated objects in the configured architecture-plan bucket under `projects/`, and copy their exact bytes and keys. If plan storage is configured, an unavailable bucket, partial listing or failed copy fails the backup. Record explicitly when a feature is disabled; never silently treat an access error as an empty bucket.
3. Record the source bucket identity, original key, object size and SHA-256 for each file in a new, versioned manifest. Encode keys safely when placing objects in the archive and prevent path traversal. Stream objects to bound memory and disk usage; verify available disk before starting. Avoid logging plan contents, prompts, database URLs, secrets or personal data.
4. Upload all data first and publish the completion manifest **last**, only after every required item has been checked. Keep old manifests readable for diagnostics, but mark older database-only backups as incomplete for full project recovery. A partial upload must not count as a completed backup.
5. Update the backup monitor, which currently checks a fixed set of archive files, to validate the new manifest version and required object inventory. Report freshness and failure separately; a recent partial archive must not suppress an alert.

Use least-privilege EC2 permissions to list/get only the canvas and plan prefixes and put only under the backup prefix. The application role should not delete backup archives. Keep restoration under a separate operator role. Continue private buckets, HTTPS and S3-managed encryption; do not add a customer-managed KMS key solely for backups. Existing 14-day retention applies to the complete archive as a unit. Verify lifecycle rules do not expire a required manifest and its files on different dates. Storage and request charges still apply.

### 3. Restore into an isolated environment

Extend `scripts/restore-drill.ts` to download and checksum the complete archive, create or use clearly named empty **drill-only** target databases, a separate DynamoDB table and separate S3 buckets/prefixes, and refuse production targets. Restore S3 objects with their original keys before loading their pointers into the isolated canvas table. Point the isolated app at the restored buckets and databases; never overwrite live objects or a live table as part of a drill.

Verify counts and hashes, then actually load representative projects: a small inline canvas, a large S3-backed canvas, connections, collaborator permissions, and a saved AI plan. Verify that a deleted/inaccessible object, corrupt checksum, partial archive, missing configuration, or non-empty restore target causes a clear failure. The drill must check behavior, not just row counts. Record backup duration, read-only duration, restore duration and last successful drill time.

Production recovery remains an explicit operator-led cutover after reviewing the restored data and choosing a recovery point. Restoring a database scan alone does not restore S3 objects. Retain PITR as an independent recovery option until the complete archive and restore procedure have been validated and an explicit cost/reliability decision is made; PITR restores DynamoDB, not PostgreSQL or S3. [PITR is metered by table size](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery_Howitworks.html).

### 4. Identity and deployment recovery

The PostgreSQL auth dump is not a backup of the Cognito user pool, its managed credentials, DNS, environment variables, secrets, IAM settings or EC2 configuration. Document which provider is active and the account recovery procedure separately. Terraform can recreate configuration, but recreating a pool is not equivalent to restoring existing users or their identities. Test recovery of application-to-Cognito identity links and password-reset behavior before relying on it; a newly created Cognito user can have a different `sub`. Never put secrets in Git or the manifest.

## Implementation order and acceptance

1. **Inventory and fencing:** identify every writer and source bucket in the actual deployment; implement and test maintenance fencing, draining, timeout/failure handling and restart recovery.
2. **Complete archives:** extend the backup format and IAM, verify S3 object coverage and checksums, then update the monitor and lifecycle behavior.
3. **Isolated restore:** restore all three data classes together and demonstrate actual canvas, collaborator and plan behavior; verify corruption and missing-object failures.
4. **Operational rollout:** apply reviewed Terraform with the correct state and account, configure the EC2 timer and alerts, run a manual backup and full isolated restore, and only then enable the daily schedule. Confirm the alert email subscription. Run periodic restore drills and repeat one after storage-format changes.

Suggested tests include concurrent writes attempting to cross the maintenance boundary; crashes before and after manifest publication; paginated S3 listing; missing objects and permission errors; S3 keys with unusual characters; inline/chunked/S3 canvas representations; old manifests; and isolated-target protection. Unit and mocked AWS tests are necessary but do not replace a real restore drill.

## Cost and limits

Start with daily archives retained for 14 days, one Region, no replication, no warm standby and no new always-on database. Estimate compressed archive size × retained copies, request counts, restore traffic, CloudWatch ingestion and the existing table's PITR cost from the real account before rollout. PITR charges are based on table size and are not eliminated by shortening its retention. Free-tier/credit eligibility depends on the account and is shared; budgets warn rather than cap spending. Keep a measured recovery-time and cost record rather than promising a $0 bill.
