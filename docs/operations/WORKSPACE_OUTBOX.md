# Workspace outbox delivery and recovery

Status: implemented locally; deployment verification is pending. This change
preserves public HTTP response formats. Workspace metadata mutations and command
inserts still commit in the same PostgreSQL transaction.

## Delivery contract

Required Canvas work uses `EventBus.registerRequired()` with one explicit owner.
Ordinary notification listeners cannot acknowledge it. An absent owner, thrown
storage error, malformed payload, or mismatched receipt fails delivery.

The persisted outbox UUID is the operation ID across retries, restarts, and
operator replay. A handler returns `{ operationId, status: "completed" }` only
after its durable write finishes. A `published` receipt records `published_at`
but leaves `processed_at` empty and a copy in `copying`. The same operation can
be checked again after ten seconds. There is no remote transport deployed by this
change; any future adapter must deduplicate publication by operation ID and
obtain a durable completion result. Queue acceptance is insufficient.

The dispatcher claims one job immediately before execution with a random claim
token, a 60-second lease, and a heartbeat every 20 seconds. Renewal and settlement
require the current token, an unexpired lease, and an unsettled row. Copy state
changes and outbox settlement share one SQL statement. A stale worker cannot
mark a newer claim completed or failed. An ambiguous settlement query is left
for lease recovery, never followed by a contradictory failure update.

Delivery is at least once. Deletion is repeatable for the same workspace IDs.
Canvas now pins copy snapshots by operation ID and records its completion in
the same DynamoDB transaction as document publication. The document head fences
stale writes and deletion, independently of SQL claim ownership. See
[Canvas persistence](../architecture/PERSISTENCE.md) for the local implementation,
its required migration window, and pending DynamoDB-backed verification for
[#55](https://github.com/Andiewitz/Meshwork-Studio/issues/55).
Keep required copy execution in the existing process until those gates pass.

## Monitoring and exhaustion

The `workspace-outbox` logger emits backlog counts, oldest pending age, oldest
publication awaiting completion age, and per-operation attempt/outcome logs.
The count includes leased and delayed work. Completed and dead-lettered rows
are excluded from pending age; dead letters are counted separately. Investigate
any dead letter or growing age. No new paid CloudWatch metrics are provisioned.

Failures back off from one second to five minutes. The twelfth failed attempt
dead-letters the row and atomically marks its copy `failed`. A crash on the final
attempt is reaped on the next claim without a thirteenth delivery. Rows are
retained for investigation. Missing consumers use the same bounded retry path.

Inspect through an authorized connection to **workspace_db**:

```sql
SELECT id, event_type, attempts, created_at, available_at, locked_until,
       published_at, processed_at, dead_lettered_at, last_error
FROM workspace_outbox_events
WHERE processed_at IS NULL
ORDER BY created_at, id;
```

Do not place command payloads or database credentials in public support reports.

## Recovery and replay

1. Identify the operation ID and repair the consumer/dependency failure.
2. Stop **all** application workers and allow active work to drain. Ensure no
   previous process can still write to DynamoDB. Normal shutdown stops claiming,
   continues renewing active work, awaits settlement, then closes the pool. The
   existing 15-second process deadline can force exit; expired work is reclaimed
   after restart. A forced exit can repeat an external side effect.
3. Review the destination for a copy before replay. The Canvas operation intent
   preserves its selected source snapshot. Replaying an already completed
   operation only confirms completion; it does not rewrite the document. An
   edited destination with a pending intent fails its generation check rather
   than overwriting those edits. Repair that conflict before retrying SQL work.
4. From the server runtime, call the internal administrative method
   `new PostgresWorkspaceOutboxStore(workspacePool).replayDeadLetter(operationId)`.
   This is not a public HTTP route. It returns `false` for completed, active,
   already replayed, or ineligible work. It also refuses a copy with a newer
   operation, an active competing copy, or a ready destination. For an eligible
   copy it atomically changes `failed` to `copying` while resetting attempts and
   clearing the old claim/dead letter. The original operation ID is preserved.
5. Restart workers. Confirm `processed_at` and the copy result, and verify age
   returns to normal. Record the replay and its reviewed outcome.

The operator helper invokes that method from a trusted checkout with Node.js,
installed dependencies, and the correct `WORKSPACE_DATABASE_URL` environment:

```powershell
npx tsx scripts/replay-workspace-outbox.ts <operation-uuid> --workers-stopped
```

The flag records that you completed step 2; it cannot detect other processes.

For user-requested copy retry, the existing endpoint still creates a new
operation transactionally. Operator replay preserves the old operation ID.
Never reset completed commands or disable claim predicates to force a replay.

## Migration and verification

Migration `0023_outbox_claim_fencing` adds nullable `claim_token` and
`published_at` columns. Existing pending rows remain eligible when their old
leases expire. **Stop old workers before deployment**: old binaries do not honor
claim tokens. A rolling mix of old/new dispatchers is unsafe. The additive schema
can remain during rollback, but stop all workers before switching versions.

Fast tests exercise required receipts, missing/failed owners, stable replay IDs,
two dispatchers, expired claims, heartbeat failures, publication vs completion,
exhaustion, and drain. Canvas wiring tests wait for the real handler's storage
promise and verify rejected writes do not become completed receipts.

PostgreSQL system tests run the real migrations and SQL against an isolated,
random schema in a disposable database. They cover token fencing, stale success
and failure, atomic copy status, backoff/dead letters/replay, backlog ages, and
transaction rollback on outbox insertion failure:

```powershell
$env:OUTBOX_TEST_DATABASE_URL = 'postgresql://user:password@127.0.0.1:5432/test_workspace_db'
npx vitest run --config vitest.system.config.ts tests/system/workspace/outbox-postgres.test.ts
```

CI supplies this DSN for the existing PostgreSQL service. Local verification used
a temporary PostgreSQL instance because Docker's engine was unavailable. Live
deployment, forced process termination against DynamoDB, and real-DynamoDB
verification of #55 document consistency remain separate verification gates.

To verify migration locking with two separate processes, use a disposable
PostgreSQL database (the test creates and drops a randomly named schema):

```powershell
$env:MIGRATION_TEST_DATABASE_URL = '<disposable PostgreSQL connection string>'
npx vitest run --config vitest.system.config.ts tests/system/arch/migration-postgres.test.ts
```

Do not point this test at a production database.
