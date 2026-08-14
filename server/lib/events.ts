import { EventEmitter } from "events";
import type { PgTransaction } from "drizzle-orm/pg-core";

/**
 * Drizzle transaction type — compatible across all service DB boundaries.
 */
export type DrizzleTx = PgTransaction<any, any, any>;

// Define typed events
export interface AppEvents {
  "workspace.deleted": { id: number; tx?: DrizzleTx };
  "workspace.duplicated": { originalId: number; newId: number; tx?: DrizzleTx };
  "user.deleted": { id: string; tx?: DrizzleTx };
}

export class EventBus extends EventEmitter {
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
