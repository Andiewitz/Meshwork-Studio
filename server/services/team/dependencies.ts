import type { RequestHandler } from "express";
import type { EventBus } from "@server/lib/events";
import type {
  WorkspaceAccessReader,
  WorkspaceSummaryReader,
} from "@services/workspace/public";

export interface TeamRouteDependencies {
  isAuthenticated: RequestHandler;
  workspaces: WorkspaceSummaryReader;
  directAccess: WorkspaceAccessReader;
}

export interface TeamDependencies extends TeamRouteDependencies {
  eventBus: Pick<EventBus, "on">;
}
