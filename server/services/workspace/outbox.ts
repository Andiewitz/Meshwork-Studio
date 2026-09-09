import type { Pool } from "pg";
import type { EventBus } from "@server/lib/events";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("workspace-outbox");

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 12;
const LEASE_SECONDS = 60;

type WorkspaceOutboxEventType = "workspace.deleted" | "workspaces.deleted";

export interface ClaimedWorkspaceOutboxEvent {
  id: string;
  eventType: WorkspaceOutboxEventType;
  payload: unknown;
  attempts: number;
}

function assertPayload(
  event: ClaimedWorkspaceOutboxEvent,
): asserts event is ClaimedWorkspaceOutboxEvent & {
  payload: { id: string } | { ids: string[] };
} {
  if (
    event.eventType === "workspace.deleted" &&
    typeof (event.payload as { id?: unknown })?.id === "string"
  ) {
    return;
  }
  if (
    event.eventType === "workspaces.deleted" &&
    Array.isArray((event.payload as { ids?: unknown })?.ids) &&
    (event.payload as { ids: unknown[] }).ids.every(
      (id) => typeof id === "string",
    )
  ) {
    return;
  }
  throw new Error(`Invalid payload for outbox event ${event.eventType}`);
}

/** Exponential retry delay, bounded so a bad dependency does not create a hot loop. */
export function outboxRetryDelayMs(attempt: number): number {
  return Math.min(5 * 60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}

export async function deliverWorkspaceOutboxEvents(
  events: ClaimedWorkspaceOutboxEvent[],
  eventBus: Pick<EventBus, "emitAsync">,
  markProcessed: (id: string) => Promise<void>,
  markFailed: (
    event: ClaimedWorkspaceOutboxEvent,
    error: unknown,
  ) => Promise<void>,
): Promise<void> {
  for (const event of events) {
    try {
      assertPayload(event);
      if (event.eventType === "workspace.deleted") {
        const payload = event.payload as { id: string };
        await eventBus.emitAsync("workspace.deleted", { id: payload.id });
      } else {
        const payload = event.payload as { ids: string[] };
        await eventBus.emitAsync("workspaces.deleted", { ids: payload.ids });
      }
      await markProcessed(event.id);
    } catch (error) {
      await markFailed(event, error);
    }
  }
}

export class WorkspaceOutboxDispatcher {
  private timer?: NodeJS.Timeout;
  private dispatching = false;

  constructor(
    private readonly pool: Pool,
    private readonly eventBus: Pick<EventBus, "emitAsync">,
  ) {}

  start(intervalMs = 10_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.dispatch(), intervalMs);
    this.timer.unref();
    void this.dispatch();
    log.info({ intervalMs }, "Workspace outbox dispatcher started");
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  wake(): void {
    void this.dispatch();
  }

  private async claim(): Promise<ClaimedWorkspaceOutboxEvent[]> {
    const { rows } = await this.pool.query<{
      id: string;
      event_type: WorkspaceOutboxEventType;
      payload: unknown;
      attempts: number;
    }>(
      `WITH candidates AS (
         SELECT id
         FROM workspace_outbox_events
         WHERE processed_at IS NULL
           AND dead_lettered_at IS NULL
           AND available_at <= NOW()
           AND (locked_until IS NULL OR locked_until < NOW())
         ORDER BY created_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE workspace_outbox_events AS outbox
       SET locked_until = NOW() + ($2 * INTERVAL '1 second'),
           attempts = outbox.attempts + 1
       FROM candidates
       WHERE outbox.id = candidates.id
       RETURNING outbox.id, outbox.event_type, outbox.payload, outbox.attempts`,
      [BATCH_SIZE, LEASE_SECONDS],
    );
    return rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      payload: row.payload,
      attempts: row.attempts,
    }));
  }

  private async markProcessed(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE workspace_outbox_events
       SET processed_at = NOW(), locked_until = NULL, last_error = NULL
       WHERE id = $1`,
      [id],
    );
  }

  private async markFailed(
    event: ClaimedWorkspaceOutboxEvent,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const deadLetter = event.attempts >= MAX_ATTEMPTS;
    await this.pool.query(
      `UPDATE workspace_outbox_events
       SET locked_until = NULL,
           last_error = $2,
           dead_lettered_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
           available_at = CASE
             WHEN $3 THEN available_at
             ELSE NOW() + ($4 * INTERVAL '1 millisecond')
           END
       WHERE id = $1`,
      [
        event.id,
        message.slice(0, 1_000),
        deadLetter,
        outboxRetryDelayMs(event.attempts),
      ],
    );
    log.error(
      {
        err: error,
        outboxEventId: event.id,
        eventType: event.eventType,
        attempts: event.attempts,
        deadLetter,
      },
      deadLetter
        ? "Workspace outbox event dead-lettered after repeated failures"
        : "Workspace outbox event failed; it will be retried",
    );
  }

  private async dispatch(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      while (true) {
        const events = await this.claim();
        if (events.length === 0) return;
        await deliverWorkspaceOutboxEvents(
          events,
          this.eventBus,
          (id) => this.markProcessed(id),
          (event, error) => this.markFailed(event, error),
        );
      }
    } catch (error) {
      log.error({ err: error }, "Workspace outbox dispatch query failed");
    } finally {
      this.dispatching = false;
    }
  }
}
