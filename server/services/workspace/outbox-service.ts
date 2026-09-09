import type { EventBus } from "@server/lib/events";
import { pool } from "./db/connection";
import { WorkspaceOutboxDispatcher } from "./outbox";

let dispatcher: WorkspaceOutboxDispatcher | undefined;

function getDispatcher(eventBus: EventBus): WorkspaceOutboxDispatcher {
  dispatcher ??= new WorkspaceOutboxDispatcher(pool, eventBus);
  return dispatcher;
}

export const workspaceOutbox = {
  start(eventBus: EventBus): void {
    getDispatcher(eventBus).start();
  },
  wake(): void {
    dispatcher?.wake();
  },
  stop(): void {
    dispatcher?.stop();
    dispatcher = undefined;
  },
};
