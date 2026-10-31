import type { Request, Response, NextFunction } from "express";
import {
  failStatus,
  isPayloadTooLarge,
  resolvePublicCode,
} from "../lib/errorEnvelope";
import { JSON_BODY_LIMIT_DISPLAY } from "../lib/bodyLimits";
import { logTraceback, wasLogged } from "../lib/traceback";
import { createChildLogger } from "../lib/logger";

const log = createChildLogger("server");

interface ThrownHttpError {
  status?: number;
  statusCode?: number;
  message?: string;
  code?: string;
  type?: string;
  expose?: boolean;
}

/** Body-parser rejects before any route runs; give each a code + plain words. */
function bodyParserResponse(err: ThrownHttpError) {
  switch (err.type) {
    case "entity.too.large":
      return {
        status: 413,
        code: "PAYLOAD_TOO_LARGE" as const,
        message: `That file is too large to upload. Try a file under ${JSON_BODY_LIMIT_DISPLAY}.`,
      };
    case "entity.parse.failed":
      return {
        status: 400,
        code: "INVALID_JSON" as const,
        message: "Request body is not valid JSON.",
      };
    case "charset.unsupported":
    case "encoding.unsupported":
      return {
        status: 415,
        code: "UNSUPPORTED_MEDIA_TYPE" as const,
        message: "Unsupported request body encoding.",
      };
    case "request.aborted":
      return {
        status: 400,
        code: "BAD_REQUEST" as const,
        message: "Request body was interrupted.",
      };
    default:
      return undefined;
  }
}

/** Postgres constraint messages — mapped codes come from resolvePublicCode. */
const PG_MESSAGES: Record<string, string> = {
  "23505":
    "A record with this value already exists. Please use a unique value.",
  "23503": "Referenced record does not exist or cannot be deleted.",
  "22P02": "Invalid data format provided.",
};

/**
 * Last error boundary. Normalizes middleware/body-parser/driver failures into
 * the same envelope `fail()` writes, without leaking internals:
 * - 4xx keep their real message (client errors must be actionable)
 * - 5xx hide the message in production
 * - unknown internal codes never become public codes
 * - an error already logged at its origin is not logged twice
 */
export function apiErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): Response | undefined {
  const httpErr = (err ?? {}) as ThrownHttpError;
  const resolved = resolvePublicCode(httpErr.code);
  const thrownStatus = httpErr.status ?? httpErr.statusCode ?? 500;
  const status = resolved.status ?? thrownStatus;
  const requestId = req.requestId ?? "unscoped";

  if (!wasLogged(err)) {
    logTraceback(log, "Request failed", err, { status, requestId });
  }

  if (res.headersSent) {
    next(err);
    return;
  }

  const parserResponse = bodyParserResponse(httpErr);
  if (parserResponse) {
    return failStatus(req, res, parserResponse.status, parserResponse.message, {
      code: parserResponse.code,
    });
  }

  if (err && isPayloadTooLarge(err)) {
    return failStatus(
      req,
      res,
      413,
      `That file is too large to upload. Try a file under ${JSON_BODY_LIMIT_DISPLAY}.`,
      { code: "PAYLOAD_TOO_LARGE" },
    );
  }

  const pgMessage = httpErr.code ? PG_MESSAGES[httpErr.code] : undefined;
  if (pgMessage) {
    return failStatus(req, res, status, pgMessage, { code: resolved.code });
  }

  const clientMessage =
    status < 500 || httpErr.expose === true
      ? (httpErr.message ?? "Request failed")
      : process.env.NODE_ENV === "production"
        ? "An unexpected error occurred"
        : (httpErr.message ?? "Internal Server Error");

  return failStatus(req, res, status, clientMessage, { code: resolved.code });
}

/** JSON 404 for unmatched `/api/*` — never fall through to the SPA shell. */
export function apiNotFoundHandler(req: Request, res: Response): Response {
  return failStatus(req, res, 404, "Not Found", { code: "NOT_FOUND" });
}
