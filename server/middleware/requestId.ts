import { randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export const REQUEST_ID_HEADER = "X-Request-Id";

/**
 * Mint (or adopt) a request ID for every inbound request.
 *
 * Format matches the Go auth service (`middleware.go:54-65`): 12 random
 * bytes as hex, so one ID joins Node logs, Go logs, and error responses.
 * An upstream-provided `X-Request-Id` (e.g. from nginx or our own
 * introspect client) is adopted verbatim instead of replaced.
 *
 * Mount FIRST so every later middleware, route, log line, and error body
 * can see `req.requestId`. Use `reqLog(req)` to log with it attached.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const incoming = req.get(REQUEST_ID_HEADER);
  const requestId =
    incoming && incoming.trim() !== ""
      ? incoming.trim().slice(0, 128)
      : `req-${randomBytes(12).toString("hex")}`;
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

/** Child logger with this request's ID attached. Falls back to "unscoped". */
export function reqLog(req: Request, module = "request") {
  return logger.child({ module, requestId: req.requestId ?? "unscoped" });
}
