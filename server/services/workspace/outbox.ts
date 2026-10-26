import type { EventBus, DeliveryReceipt } from "@server/lib/events";
import { deliveryReceiptSchema } from "@shared/contracts/events";
import { createChildLogger } from "@server/lib/logger";
import {
  OUTBOX_MAX_ATTEMPTS,
  type ClaimedWorkspaceOutboxEvent,
  type WorkspaceOutboxStore,
} from "./outbox-store";

export {
  outboxRetryDelayMs,
  type ClaimedWorkspaceOutboxEvent,
} from "./outbox-store";
const log = createChildLogger("workspace-outbox");
type RequiredTransport = Pick<EventBus, "executeRequired">;

export async function deliverWorkspaceOutboxEvent(
  event: ClaimedWorkspaceOutboxEvent,
  transport: RequiredTransport,
): Promise<DeliveryReceipt> {
  const context = { operationId: event.id };
  const payload = event.payload as Record<string, unknown> | null;
  let receipt: DeliveryReceipt;
  if (
    event.eventType === "workspace.deleted" &&
    typeof payload?.id === "string"
  ) {
    receipt = await transport.executeRequired(
      "workspace.deleted",
      { id: payload.id },
      context,
    );
  } else if (
    event.eventType === "workspaces.deleted" &&
    Array.isArray(payload?.ids) &&
    payload.ids.every((id) => typeof id === "string")
  ) {
    receipt = await transport.executeRequired(
      "workspaces.deleted",
      { ids: payload.ids },
      context,
    );
  } else if (
    event.eventType === "workspace.duplicated" &&
    typeof payload?.originalId === "string" &&
    typeof payload?.newId === "string"
  ) {
    receipt = await transport.executeRequired(
      "workspace.duplicated",
      {
        originalId: payload.originalId,
        newId: payload.newId,
      },
      context,
    );
  } else {
    throw new Error(`Invalid payload for outbox event ${event.eventType}`);
  }
  const parsedReceipt = deliveryReceiptSchema.safeParse(receipt);
  if (!parsedReceipt.success || parsedReceipt.data.operationId !== event.id) {
    throw new Error("Invalid outbox delivery receipt");
  }
  return parsedReceipt.data;
}

export class WorkspaceOutboxDispatcher {
  private timer?: NodeJS.Timeout;
  private inFlight?: Promise<void>;
  private stopping = false;

  constructor(
    private readonly store: WorkspaceOutboxStore,
    private readonly transport: RequiredTransport,
    private readonly heartbeatMs = 20_000,
  ) {}

  start(intervalMs = 10_000): void {
    if (this.timer) return;
    this.stopping = false;
    this.timer = setInterval(() => void this.wake(), intervalMs);
    this.timer.unref();
    void this.wake();
    log.info({ intervalMs }, "Workspace outbox dispatcher started");
  }

  /** Keep renewing the active claim while draining. The process has a global deadline. */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.inFlight;
  }

  wake(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    if (!this.inFlight) {
      this.inFlight = this.dispatch().finally(() => {
        this.inFlight = undefined;
      });
    }
    return this.inFlight;
  }

  private async deliver(event: ClaimedWorkspaceOutboxEvent): Promise<void> {
    let lostLease = false;
    let renewal: Promise<void> | undefined;
    const heartbeat = setInterval(() => {
      if (renewal || lostLease) return;
      renewal = this.store
        .renew(event)
        .then((owned) => {
          if (!owned) lostLease = true;
        })
        .catch((error: unknown) => {
          lostLease = true;
          log.error(
            { err: error, operationId: event.id },
            "Outbox claim renewal failed",
          );
        })
        .finally(() => {
          renewal = undefined;
        });
    }, this.heartbeatMs);
    heartbeat.unref();

    let receipt: DeliveryReceipt | undefined;
    let failure: unknown;
    try {
      // Crash on the final attempt cannot cause unlimited deliveries after restart.
      if (event.attempts > OUTBOX_MAX_ATTEMPTS)
        throw new Error("Outbox attempts exhausted before delivery");
      receipt = await deliverWorkspaceOutboxEvent(event, this.transport);
    } catch (error) {
      failure = error;
    } finally {
      clearInterval(heartbeat);
      await renewal;
    }
    if (lostLease) {
      log.warn(
        { operationId: event.id, claimToken: event.claimToken },
        "Outbox lease lost; settlement skipped",
      );
      return;
    }
    // SQL checks ownership again: lease expiry can happen after the last heartbeat.
    const settled = receipt
      ? await this.store.settle(event, receipt)
      : await this.store.fail(event, failure);
    const fields = {
      operationId: event.id,
      eventType: event.eventType,
      attempts: event.attempts,
    };
    if (!settled) {
      log.warn(fields, "Stale outbox settlement rejected");
    } else if (!receipt) {
      log.error(
        {
          ...fields,
          err: failure,
          deadLetter: event.attempts >= OUTBOX_MAX_ATTEMPTS,
        },
        "Required outbox work failed",
      );
    } else {
      log.info(
        { ...fields, deliveryStatus: receipt.status },
        "Required outbox delivery confirmed",
      );
    }
  }

  private async dispatch(): Promise<void> {
    try {
      const health = await this.store.inspect();
      if (health.pendingCount || health.deadLetterCount) {
        log.info(health, "Workspace outbox backlog");
      }
      while (!this.stopping) {
        // Claim only the job about to execute; no serial batch ages on its lease.
        const event = await this.store.claim();
        if (!event) return;
        await this.deliver(event);
      }
    } catch (error) {
      // A failed settlement query leaves the claim to expire; never turn an
      // ambiguous commit into a second, contradictory failure settlement.
      log.error({ err: error }, "Workspace outbox dispatch query failed");
    }
  }
}
