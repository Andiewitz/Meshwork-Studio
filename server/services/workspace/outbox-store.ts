import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  DeliveryReceipt,
  RequiredWorkspaceEvent,
} from "@server/lib/events";

export const OUTBOX_MAX_ATTEMPTS = 12;
export const OUTBOX_LEASE_SECONDS = 60;

export interface ClaimedWorkspaceOutboxEvent {
  id: string;
  eventType: RequiredWorkspaceEvent;
  payload: unknown;
  attempts: number;
  claimToken: string;
}

export interface WorkspaceOutboxStore {
  inspect(): Promise<OutboxHealth>;
  claim(): Promise<ClaimedWorkspaceOutboxEvent | undefined>;
  renew(event: ClaimedWorkspaceOutboxEvent): Promise<boolean>;
  settle(
    event: ClaimedWorkspaceOutboxEvent,
    receipt: DeliveryReceipt,
  ): Promise<boolean>;
  fail(event: ClaimedWorkspaceOutboxEvent, error: unknown): Promise<boolean>;
}

export interface OutboxHealth {
  pendingCount: number;
  deadLetterCount: number;
  oldestPendingAgeSeconds: number;
  oldestPublishedAgeSeconds: number;
}

export function outboxRetryDelayMs(attempt: number): number {
  return Math.min(5 * 60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}

/** All mutations require the current token AND an unexpired lease. */
export class PostgresWorkspaceOutboxStore implements WorkspaceOutboxStore {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async inspect(): Promise<OutboxHealth> {
    const { rows } = await this.pool.query<OutboxHealth>(
      `SELECT
         (COUNT(*) FILTER (WHERE processed_at IS NULL AND dead_lettered_at IS NULL))::integer AS "pendingCount",
         (COUNT(*) FILTER (WHERE dead_lettered_at IS NOT NULL))::integer AS "deadLetterCount",
         GREATEST(0, COALESCE(EXTRACT(EPOCH FROM (clock_timestamp() -
           MIN(created_at) FILTER (WHERE processed_at IS NULL AND dead_lettered_at IS NULL))), 0))::double precision AS "oldestPendingAgeSeconds",
         GREATEST(0, COALESCE(EXTRACT(EPOCH FROM (clock_timestamp() -
           MIN(published_at) FILTER (WHERE processed_at IS NULL AND dead_lettered_at IS NULL))), 0))::double precision AS "oldestPublishedAgeSeconds"
       FROM workspace_outbox_events`,
    );
    return rows[0];
  }

  async claim(): Promise<ClaimedWorkspaceOutboxEvent | undefined> {
    const { rows } = await this.pool.query<{
      id: string;
      event_type: RequiredWorkspaceEvent;
      payload: unknown;
      attempts: number;
      claim_token: string;
    }>(
      `WITH candidate AS (
         SELECT id FROM workspace_outbox_events
         WHERE processed_at IS NULL AND dead_lettered_at IS NULL
           AND available_at <= NOW()
           AND (locked_until IS NULL OR locked_until <= NOW())
         ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
       )
       UPDATE workspace_outbox_events AS outbox
       SET locked_until = clock_timestamp() + ($1 * INTERVAL '1 second'),
           claim_token = $2, attempts = outbox.attempts + 1
       FROM candidate WHERE outbox.id = candidate.id
       RETURNING outbox.id, outbox.event_type, outbox.payload,
                 outbox.attempts, outbox.claim_token`,
      [OUTBOX_LEASE_SECONDS, randomUUID()],
    );
    const row = rows[0];
    return (
      row && {
        id: row.id,
        eventType: row.event_type,
        payload: row.payload,
        attempts: row.attempts,
        claimToken: row.claim_token,
      }
    );
  }

  async renew(event: ClaimedWorkspaceOutboxEvent): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE workspace_outbox_events
       SET locked_until = clock_timestamp() + ($3 * INTERVAL '1 second')
       WHERE id = $1 AND claim_token = $2 AND locked_until > clock_timestamp()
         AND processed_at IS NULL AND dead_lettered_at IS NULL`,
      [event.id, event.claimToken, OUTBOX_LEASE_SECONDS],
    );
    return result.rowCount === 1;
  }

  async settle(
    event: ClaimedWorkspaceOutboxEvent,
    receipt: DeliveryReceipt,
  ): Promise<boolean> {
    if (
      receipt.operationId !== event.id ||
      (receipt.status !== "completed" && receipt.status !== "published")
    ) {
      throw new Error("Invalid outbox delivery receipt");
    }
    const completed = receipt.status === "completed";
    const copyId =
      event.eventType === "workspace.duplicated"
        ? (event.payload as { newId?: unknown })?.newId
        : undefined;
    const { rows } = await this.pool.query<{ settled: boolean }>(
      `WITH marked_event AS (
         UPDATE workspace_outbox_events
         SET published_at = COALESCE(published_at, NOW()),
             processed_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
             locked_until = NULL, claim_token = NULL, last_error = NULL,
             available_at = CASE WHEN $3 THEN available_at
               ELSE NOW() + INTERVAL '10 seconds' END
         WHERE id = $1 AND claim_token = $2 AND locked_until > clock_timestamp()
           AND processed_at IS NULL AND dead_lettered_at IS NULL
         RETURNING id
       ), updated_copy AS (
         UPDATE workspaces SET canvas_copy_status = 'ready', updated_at = NOW()
         FROM marked_event
         WHERE $3 AND workspaces.id = $4 AND canvas_copy_status = 'copying'
         RETURNING workspaces.id
       )
       SELECT EXISTS(SELECT 1 FROM marked_event) AS settled`,
      [
        event.id,
        event.claimToken,
        completed,
        typeof copyId === "string" ? copyId : null,
      ],
    );
    return rows[0]?.settled ?? false;
  }

  async fail(
    event: ClaimedWorkspaceOutboxEvent,
    error: unknown,
  ): Promise<boolean> {
    const message = error instanceof Error ? error.message : String(error);
    const deadLetter = event.attempts >= OUTBOX_MAX_ATTEMPTS;
    const copyId =
      event.eventType === "workspace.duplicated"
        ? (event.payload as { newId?: unknown })?.newId
        : undefined;
    const { rows } = await this.pool.query<{ settled: boolean }>(
      `WITH marked_event AS (
         UPDATE workspace_outbox_events
         SET locked_until = NULL, claim_token = NULL, last_error = $3,
             dead_lettered_at = CASE WHEN $4 THEN NOW() ELSE NULL END,
             available_at = CASE WHEN $4 THEN available_at
               ELSE NOW() + ($5 * INTERVAL '1 millisecond') END
         WHERE id = $1 AND claim_token = $2 AND locked_until > clock_timestamp()
           AND processed_at IS NULL AND dead_lettered_at IS NULL
         RETURNING id
       ), updated_copy AS (
         UPDATE workspaces SET canvas_copy_status = 'failed', updated_at = NOW()
         FROM marked_event
         WHERE $4 AND workspaces.id = $6 AND canvas_copy_status = 'copying'
         RETURNING workspaces.id
       )
       SELECT EXISTS(SELECT 1 FROM marked_event) AS settled`,
      [
        event.id,
        event.claimToken,
        message.slice(0, 1_000),
        deadLetter,
        outboxRetryDelayMs(event.attempts),
        typeof copyId === "string" ? copyId : null,
      ],
    );
    return rows[0]?.settled ?? false;
  }

  /** Operator-only replay, after stopping workers and reviewing the failure. */
  async replayDeadLetter(operationId: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ replayed: boolean }>(
      `WITH replayed_event AS (
         UPDATE workspace_outbox_events AS event
         SET attempts = 0, available_at = NOW(), locked_until = NULL,
             claim_token = NULL, dead_lettered_at = NULL, last_error = NULL
         WHERE event.id = $1 AND event.processed_at IS NULL
           AND event.dead_lettered_at IS NOT NULL
           AND (event.locked_until IS NULL OR event.locked_until <= clock_timestamp())
           AND (event.event_type <> 'workspace.duplicated' OR (
             NOT EXISTS (SELECT 1 FROM workspaces
               WHERE id = event.payload->>'newId' AND canvas_copy_status <> 'failed')
             AND NOT EXISTS (SELECT 1 FROM workspace_outbox_events AS other
               WHERE other.id <> event.id AND other.event_type = 'workspace.duplicated'
                 AND other.payload->>'newId' = event.payload->>'newId'
                 AND other.processed_at IS NULL AND other.dead_lettered_at IS NULL)
             AND NOT EXISTS (SELECT 1 FROM workspace_outbox_events AS newer
               WHERE newer.id <> event.id AND newer.event_type = 'workspace.duplicated'
                 AND newer.payload->>'newId' = event.payload->>'newId'
                 AND newer.created_at > event.created_at)
           ))
         RETURNING event.id, event.event_type, event.payload
       ), updated_copy AS (
         UPDATE workspaces SET canvas_copy_status = 'copying', updated_at = NOW()
         FROM replayed_event WHERE replayed_event.event_type = 'workspace.duplicated'
           AND workspaces.id = replayed_event.payload->>'newId'
           AND workspaces.canvas_copy_status = 'failed'
         RETURNING workspaces.id
       )
       SELECT EXISTS(SELECT 1 FROM replayed_event) AS replayed`,
      [operationId],
    );
    return rows[0]?.replayed ?? false;
  }
}
