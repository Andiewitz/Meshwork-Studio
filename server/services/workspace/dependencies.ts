import type { WorkspaceAccessReader } from "@services/workspace/public";
import type { RequestHandler } from "express";
import type { EventBus } from "@server/lib/events";

export interface WorkspaceRouteDependencies {
  isAuthenticated: RequestHandler;
  directAccess: WorkspaceAccessReader;
}

export interface WorkspaceDependencies extends WorkspaceRouteDependencies {
  eventBus: Pick<EventBus, "on" | "executeRequired">;
}
