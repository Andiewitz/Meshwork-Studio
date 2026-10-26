import type { RequestHandler } from "express";

export interface AIRouteDependencies {
  isAuthenticated: RequestHandler;
}
