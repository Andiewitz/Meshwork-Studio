import type { RequestHandler } from "express";
import type { EventBus } from "@server/lib/events";
import type { WorkspaceSummaryReader } from "@services/workspace/public";

export interface TeamRouteDependencies {
  isAuthenticated: RequestHandler;
  workspaces: WorkspaceSummaryReader;
}

export interface TeamDependencies extends TeamRouteDependencies {
  eventBus: Pick<EventBus, "on">;
}
