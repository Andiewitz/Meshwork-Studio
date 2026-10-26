import { EventEmitter } from "events";
import {
  createEventEnvelope,
  parseEventEnvelope,
  parseEventPayload,
  deliveryReceiptSchema,
  type AppEvents,
  type RequiredWorkspaceEvent,
  type CommandContext,
  type DeliveryReceipt,
} from "@shared/contracts/events";
export type {
  AppEvents,
  RequiredWorkspaceEvent,
  CommandContext,
  DeliveryReceipt,
} from "@shared/contracts/events";

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
    payload: AppEvents[K],
    context: CommandContext,
  ): Promise<DeliveryReceipt> {
    return this.executeEnvelope(
      createEventEnvelope(eventName, payload, context),
    );
  }

  /** Runtime boundary for a future queue/HTTP adapter; reject unknown versions. */
  async executeEnvelope(input: unknown): Promise<DeliveryReceipt> {
    const envelope = parseEventEnvelope(input);
    if (envelope.type === "user.deleted")
      throw new Error("Notification is not a required command");
    const eventName = envelope.type;
    const payload = envelope.payload;
    const context: CommandContext = {
      operationId: envelope.operationId,
      ...(envelope.requestId ? { requestId: envelope.requestId } : {}),
      ...(envelope.actor ? { actor: envelope.actor } : {}),
    };
    const handler = this.requiredHandlers.get(eventName);
    if (!handler) throw new Error(`Required handler unavailable: ${eventName}`);
    const receipt = await handler(payload, context);
    const parsedReceipt = deliveryReceiptSchema.safeParse(receipt);
    if (
      !parsedReceipt.success ||
      parsedReceipt.data.operationId !== context.operationId
    ) {
      throw new Error(`Invalid delivery receipt: ${eventName}`);
    }
    return parsedReceipt.data;
  }

  emit<K extends keyof AppEvents>(
    eventName: K,
    payload: AppEvents[K],
  ): boolean {
    return super.emit(eventName, parseEventPayload(eventName, payload));
  }

  async emitAsync<K extends keyof AppEvents>(
    eventName: K,
    payload: AppEvents[K],
  ): Promise<void> {
    const validated = parseEventPayload(eventName, payload);
    const listeners = this.listeners(eventName);
    for (const listener of listeners) {
      await (listener as (payload: AppEvents[K]) => void | Promise<void>)(
        validated,
      );
    }
  }

  /** Versioned notification adapter; legacy local emit/emitAsync remain supported. */
  async emitEnvelope(input: unknown): Promise<void> {
    const envelope = parseEventEnvelope(input);
    await this.emitAsync(envelope.type, envelope.payload);
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

type RequiredHandler<K extends RequiredWorkspaceEvent> = (
  payload: AppEvents[K],
  context: CommandContext,
) => Promise<DeliveryReceipt>;
