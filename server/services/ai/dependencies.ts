import type { RequestHandler } from "express";
import type { EventBus } from "@server/lib/events";

export interface AIRouteDependencies {
  isAuthenticated: RequestHandler;
  eventBus?: Pick<EventBus, "registerRequired">;
}
