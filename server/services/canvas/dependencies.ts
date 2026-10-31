import type { WorkspaceAccessReader } from "@services/workspace/public";
import type { RequestHandler } from "express";
import type { EventBus } from "@server/lib/events";
import type { WorkspaceSummaryReader } from "@services/workspace/public";

export interface CanvasRouteDependencies {
  isAuthenticated: RequestHandler;
  workspaces: WorkspaceSummaryReader;
  directAccess: WorkspaceAccessReader;
}

export interface CanvasDependencies extends CanvasRouteDependencies {
  eventBus: Pick<EventBus, "registerRequired">;
}
