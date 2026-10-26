import type { RequestHandler } from "express";
import type { EventBus } from "@server/lib/events";
import type { TeamWorkspaceAccess } from "@services/team/public";

export interface WorkspaceRouteDependencies {
  isAuthenticated: RequestHandler;
  teamAccess: TeamWorkspaceAccess;
}

export interface WorkspaceDependencies extends WorkspaceRouteDependencies {
  eventBus: Pick<EventBus, "on" | "executeRequired">;
}
