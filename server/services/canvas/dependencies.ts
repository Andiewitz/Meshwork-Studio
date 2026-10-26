import type { RequestHandler } from "express";
import type { EventBus } from "@server/lib/events";
import type { TeamWorkspaceAccess } from "@services/team/public";
import type { WorkspaceSummaryReader } from "@services/workspace/public";

export interface CanvasRouteDependencies {
  isAuthenticated: RequestHandler;
  workspaces: WorkspaceSummaryReader;
  teamAccess: TeamWorkspaceAccess;
}

export interface CanvasDependencies extends CanvasRouteDependencies {
  eventBus: Pick<EventBus, "registerRequired">;
}
