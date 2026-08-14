import type { Express } from "express";
import { setupAuth, isAuthenticated } from "./middleware/authMiddleware";
import { registerAuthRoutes } from "./routes/authRoutes";
import { authStorage } from "./db/storage";
import { createChildLogger } from "@server/lib/logger";
import type { AppContext } from "@server/lib/registry";

const log = createChildLogger("auth-service");

export class AuthService {
  static async initialize(app: Express, context: AppContext) {
    await setupAuth(app);
    registerAuthRoutes(app, context);
    log.info("Authentication service initialized");
  }

  static storage = authStorage;
  static middleware = { isAuthenticated };
}

// Backward compatibility alias
export const AuthModule = AuthService;

export type { AppContext };
export { isAuthenticated, authStorage };

// Export decoupled domain APIs
export * from "./db";
export * from "./jwt";
export * from "./rate-limit";
export * from "./password";
export * from "./strategies";
export * from "./captcha";
export * from "./schemas";
export * from "./middleware";
