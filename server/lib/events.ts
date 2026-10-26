import { EventEmitter } from "events";
import type { PgTransaction } from "drizzle-orm/pg-core";

/**
 * Drizzle transaction type — compatible across all service DB boundaries.
 */
export type DrizzleTx = PgTransaction<any, any, any>;

// Define typed events
export interface AppEvents {
  "workspace.deleted": { id: string; tx?: DrizzleTx };
  "workspace.duplicated": { originalId: string; newId: string; tx?: DrizzleTx };
  "user.deleted": { id: string };
  "workspaces.deleted": { ids: string[] };
}

export class EventBus extends EventEmitter {
  private readonly requiredHandlers = new Map<
    RequiredWorkspaceEvent,
    RequiredHandler<RequiredWorkspaceEvent>
  >();

  /** Required work has one explicit owner. Notification listeners cannot ack it. */
  registerRequired<K extends RequiredWorkspaceEvent>(
    eventName: K,
    handler: RequiredHandler<K>,
  ): void {
    if (this.requiredHandlers.has(eventName)) {
      throw new Error(`Required handler already registered: ${eventName}`);
    }
    this.requiredHandlers.set(
      eventName,
      handler as RequiredHandler<RequiredWorkspaceEvent>,
    );
  }

  async executeRequired<K extends RequiredWorkspaceEvent>(
    eventName: K,
    payload: Omit<AppEvents[K], "tx">,
    context: CommandContext,
  ): Promise<DeliveryReceipt> {
    const handler = this.requiredHandlers.get(eventName);
    if (!handler) throw new Error(`Required handler unavailable: ${eventName}`);
    const receipt = await handler(payload, context);
    if (
      receipt?.operationId !== context.operationId ||
      (receipt.status !== "completed" && receipt.status !== "published")
    ) {
      throw new Error(`Invalid delivery receipt: ${eventName}`);
    }
    return receipt;
  }

  emit<K extends keyof AppEvents>(
    eventName: K,
    payload: AppEvents[K],
  ): boolean {
    return super.emit(eventName, payload);
  }

  async emitAsync<K extends keyof AppEvents>(
    eventName: K,
    payload: AppEvents[K],
  ): Promise<void> {
    const listeners = this.listeners(eventName);
    for (const listener of listeners) {
      await (listener as (payload: AppEvents[K]) => void | Promise<void>)(
        payload,
      );
    }
  }

  on<K extends keyof AppEvents>(
    eventName: K,
    listener: (payload: AppEvents[K]) => void | Promise<void>,
  ): this {
    return super.on(eventName, listener);
  }
}

// Export singleton instance for app-wide internal events
export const eventBus = new EventBus();

export type RequiredWorkspaceEvent =
  "workspace.deleted" | "workspaces.deleted" | "workspace.duplicated";

export interface DeliveryReceipt {
  operationId: string;
  status: "published" | "completed";
}

export interface CommandContext {
  /** Stable across retries and process restarts; never use the claim token. */
  operationId: string;
}

type RequiredHandler<K extends RequiredWorkspaceEvent> = (
  payload: Omit<AppEvents[K], "tx">,
  context: CommandContext,
) => Promise<DeliveryReceipt>;
