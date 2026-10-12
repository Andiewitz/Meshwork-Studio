import { User as DbUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends DbUser {}
    interface Request {
      /** Populated by the auth middleware once the session is validated. */
      user?: User & { isAdmin?: boolean };
      /** Populated by requestIdMiddleware (mounted first in index.ts). */
      requestId?: string;
    }
  }
}
