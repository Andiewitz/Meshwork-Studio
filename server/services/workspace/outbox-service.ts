import type { EventBus } from "@server/lib/events";
import { pool } from "./db/connection";
import { WorkspaceOutboxDispatcher } from "./outbox";
import { PostgresWorkspaceOutboxStore } from "./outbox-store";

let dispatcher: WorkspaceOutboxDispatcher | undefined;

function getDispatcher(
  eventBus: Pick<EventBus, "executeRequired">,
): WorkspaceOutboxDispatcher {
  dispatcher ??= new WorkspaceOutboxDispatcher(
    new PostgresWorkspaceOutboxStore(pool),
    eventBus,
  );
  return dispatcher;
}

export const workspaceOutbox = {
  start(eventBus: Pick<EventBus, "executeRequired">): void {
    getDispatcher(eventBus).start();
  },
  wake(): void {
    dispatcher?.wake();
  },
  async stop(): Promise<void> {
    await dispatcher?.stop();
    dispatcher = undefined;
  },
};
