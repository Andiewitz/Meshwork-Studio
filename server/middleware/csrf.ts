import type { Request, Response, NextFunction } from "express";
import csrf from "csurf";
import { createChildLogger } from "../lib/logger";

const log = createChildLogger("csrf");

declare global {
  namespace Express {
    interface Request {
      csrfToken(): string;
    }
  }
}

/**
 * CSRF Protection Middleware
 *
 * Uses double-submit cookie pattern for CSRF protection.
 * The token should be:
 * 1. Generated for each session
 * 2. Sent to client in response header
 * 3. Sent back by client in request header or body for state-changing operations
 */

// Initialize CSRF protection with cookie-based storage
const _csrfMiddleware = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  },
});

/**
 * CSRF middleware — skipped when E2E_BYPASS_AUTH=true so Playwright tests can
 * make mutating API calls without needing to pre-seed a csurf cookie.
 */
export const csrfProtection: import("express").RequestHandler = (
  req,
  res,
  next,
) => {
  if (process.env.E2E_BYPASS_AUTH === "true") {
    return next();
  }
  return _csrfMiddleware(req, res, next);
};

/**
 * Middleware to generate CSRF token
 * This should be called on the initial page load or login
 */
export const generateCsrfToken = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Generate token and attach to response header
  const token =
    typeof req.csrfToken === "function" ? req.csrfToken() : "mock-csrf-token";
  res.set("X-CSRF-Token", token);
  next();
};

/**
 * Middleware to validate CSRF token on state-changing operations
 * Checks for token in:
 * 1. X-CSRF-Token header (preferred for APIs)
 * 2. _csrf body field (for form submissions)
 */
export const validateCsrfToken = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Skip CSRF check for GET/HEAD/OPTIONS (idempotent methods)
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // Skip CSRF check for public auth endpoints (handled specially)
  if (
    req.path === "/api/auth/register" ||
    req.path === "/api/auth/login" ||
    req.path === "/api/v1/auth/register" ||
    req.path === "/api/v1/auth/login"
  ) {
    return next();
  }

  csrfProtection(req, res, (err: unknown) => {
    if (err) {
      const csrfErr = err as { message?: string };
      // CSRF token validation failed
      log.warn(
        { method: req.method, path: req.path, error: csrfErr.message },
        "Token validation failed",
      );
      return res.status(403).json({
        message: "CSRF validation failed",
        error:
          process.env.NODE_ENV === "production" ? undefined : csrfErr.message,
      });
    }
    next();
  });
};

/**
 * Helper to get CSRF token from request
 * Used internally to verify token presence
 */
export const getCsrfToken = (req: Request): string | null => {
  return req.get("X-CSRF-Token") || req.body?._csrf || null;
};
