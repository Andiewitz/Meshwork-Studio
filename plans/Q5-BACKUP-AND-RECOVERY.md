# Q5 — backup and recovery baseline

## Objective

Replace the obsolete best-effort JSON backup with a fail-closed, complete
archive for the current database-per-service topology and canvas DynamoDB table.
This work prepares recovery; it does not claim that production AWS resources,
credentials, retention, or a restore drill have already been configured.

## Delivery slices

### Q5.1 — complete, verifiable archive (this change)

- Discover the required auth, workspace, team, Jenkos/AI, and metrics DSNs from
  their explicit environment variables; reject an incomplete production backup.
- Use `pg_dump --format=custom` for each database and optionally save Postgres
  globals when a purpose-built backup-superuser DSN is supplied.
- Scan the configured canvas table to an NDJSON recovery artifact, with no DSNs
  or credentials written to disk.
- Hash every artifact and upload the completion manifest last to an explicit S3
  prefix. Production fails before dumping if that prefix or DynamoDB PITR is
  missing.
- Keep local archives outside version control as short-lived staging copies.

Acceptance: a successful manifest contains all six artifacts (five PostgreSQL
databases plus canvas), SHA-256 checksums, and an off-host location. A failed
dump, canvas scan, checksum, or upload exits non-zero and never prints a
successful completion message.

### Q5.2 — restore automation and drill

- Add an isolated restore command that requires an empty, explicitly named
  target and validates row counts plus a sampled canvas before cutover.
- Restore Postgres roles before database dumps where needed; restore canvas to a
  newly named DynamoDB table and use a controlled application config cutover.
- Run a quarterly, timed restore drill and record RPO/RTO, checksum results, and
  the operator who approved deletion of the drill target.

### Q5.3 — AWS and host controls

- Create a separate versioned S3 backup bucket with Block Public Access, KMS,
  lifecycle retention, least-privilege backup/restore roles, and deletion
  isolation.
- Enable PITR on the production canvas table and capture the validation output
  in the deployment record.
- For Docker DynamoDB Local, persist its data volume but do not treat that
  on-host volume as a disaster-recovery backup. Prefer the managed table for
  production canvas data.
- Schedule the backup outside peak traffic, alert on non-zero exit, missed
  completion manifest, and failed restore drills.

## Required production environment

`BACKUP_S3_URI` must be a `s3://bucket/optional-prefix` location. The runner
also needs every service DSN, `CANVAS_DDB_TABLE`, AWS permissions for the canvas
scan and S3 upload, `pg_dump`, and the AWS CLI. Set
`BACKUP_POSTGRES_SUPERUSER_URL` when roles/globals must be recovered from the
archive. The deployment account must verify DynamoDB PITR before the job starts.

## Safety boundaries

- The backup process only reads databases and writes a new timestamped archive;
  it does not restore, delete, mutate tables, or enable AWS features.
- The S3 completion manifest is uploaded last. A prefix without that manifest is
  an incomplete archive and must not be used for recovery.
- DynamoDB scans are a portable supplemental snapshot, not a substitute for
  managed-table PITR. Q5.2 defines the authoritative restore workflow.
