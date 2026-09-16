# Backup, Restore, and Recovery

The repository contains a verified archive builder, a restore-drill tool, and a
systemd timer template. Those artifacts do **not** prove that production backup
infrastructure, IAM, retention, or alerts have been configured. Treat recovery
as unready until the operator records a successful off-host archive and timed
restore drill.

## Recovery policy

| Item               | Required policy                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Backup frequency   | Nightly timer after production prerequisites are installed.                                |
| Archive contents   | Auth, workspace, team, AI, and metrics PostgreSQL dumps; canvas NDJSON; checksum manifest. |
| Off-host location  | Versioned, private S3 prefix with Block Public Access and lifecycle policy.                |
| Canvas durability  | DynamoDB point-in-time recovery plus the archive snapshot.                                 |
| Restore drills     | Quarterly, timed, isolated drill; record operator, archive ID, result, RPO, and RTO.       |
| Production restore | Manual approved cutover only; never point the drill tool at production.                    |

RPO and RTO are intentionally not assigned numeric values here: measure them in
a successful drill, then have the service owner approve and record the targets.

## Backup prerequisites

Before installing the timer, provide all of the following:

1. `BACKUP_S3_URI` for an approved private bucket/prefix.
2. Explicit DSNs for every service database and `CANVAS_DDB_TABLE`.
3. `pg_dump`, AWS CLI, and an IAM role limited to the archive prefix and canvas
   table read operations.
4. DynamoDB point-in-time recovery enabled and verified on the production table.
5. S3 versioning, encryption, retention/lifecycle rules, and a tested alert path.

Run `npm run db:backup` manually first. A usable archive has a final
`manifest.json` and checksums for every required artifact. A prefix without the
completion manifest is incomplete and must not be restored.

## Scheduled backup installation

After the manual backup succeeds on the production host:

```bash
cd ~/meshwork-studiov2
chmod +x scripts/install-backup-timer.sh
./scripts/install-backup-timer.sh
sudo systemctl start meshwork-backup.service
journalctl -u meshwork-backup.service -n 100 --no-pager
```

The service has a randomized nightly delay and low CPU/I/O priority. Check the
first run and the timer schedule with `systemctl list-timers meshwork-backup.timer --all`.

## Isolated restore drill

Restore drills require newly provisioned, empty targets. The tool refuses
`NODE_ENV=production`, active canvas tables, non-drill mode, and non-empty
database targets.

```bash
RESTORE_MODE=drill RESTORE_DRILL_ID=YYYYMMDD \
  RESTORE_ARCHIVE_DIR=/secure/archive/<archive-id> \
  npm run db:restore:drill
```

Set the documented `RESTORE_*_DATABASE_URL` values, isolated DynamoDB endpoint,
and `RESTORE_CANVAS_DDB_TABLE` before running it. The tool validates database
rows and canvas item counts against the manifest. Preserve the output with the
deployment record, then destroy drill resources only after approval.

## Production recovery boundary

There is no automated production restore command. A production recovery needs:

1. An incident owner and maintenance window.
2. A verified archive or DynamoDB PITR restore to a new target.
3. Service configuration cutover to the restored, validated targets.
4. Authenticated and canvas write smoke tests before reopening traffic.
5. A post-incident record covering data loss window, elapsed recovery time, and
   follow-up actions.

Do not overwrite the live database or canvas table as part of a drill. The
implementation history and acceptance criteria are retained in
[`Q5-BACKUP-AND-RECOVERY.md`](../../plans/Q5-BACKUP-AND-RECOVERY.md).
