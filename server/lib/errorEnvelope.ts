/**
 * Standard error envelope (single write path).
 *
 * Every error response is `{ code, message, requestId }`, optionally with
 * `issues[]` for field-level detail. `message` keeps its exact historical
 * text where clients depend on it; `code` is a stable UPPER_SNAKE token from
 * `errorCodes.ts`; `requestId` joins the response to server logs (see
 * server/middleware/requestId.ts).
 *
 * SECURITY: never forward internal codes (pg `23505`, errno strings) as
 * public `code`. Only tokens registered in `ERROR_CODES` pass — anything else
 * resolves to the status-derived fallback or no code at all.
 */

import type { Request, Response } from "express";
import {
  codeForStatus,
  isApiErrorCode,
  statusForCode,
  type ApiErrorCode,
} from "./errorCodes";

export interface ApiIssue {
  path: string;
  message: string;
}

export interface ErrorBody {
  message: string;
  code?: string;
  requestId: string;
  issues?: ApiIssue[];
}

const PG_TO_PUBLIC: Record<string, { status: number; code: ApiErrorCode }> = {
  "23505": { status: 409, code: "DUPLICATE_VALUE" },
  "23503": { status: 409, code: "REFERENCE_CONFLICT" },
  "22P02": { status: 400, code: "INVALID_FORMAT" },
};

/**
 * Body-parser rejections (express.json `limit: "5mb"`). The thrown error
 * carries `type: "entity.too.large"`, status 413, and a raw English message
 * — normalize all three so clients get a switchable code, not a sentence.
 */
export function isPayloadTooLarge(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { type?: unknown }).type === "entity.too.large"
  );
}

/**
 * Public codes are registry members only. Errno strings (ECONNREFUSED),
 * driver codes (23505), and arbitrary dependency tokens never pass.
 */
export function isPublicCode(code: unknown): code is ApiErrorCode {
  return isApiErrorCode(code);
}

/**
 * Resolve what public `{status, code}` an internal error code deserves:
 * known pg codes map to public tokens; registered codes pass through with
 * their canonical status; anything else resolves to {} so the caller falls
 * back to the thrown status (or a generic 500).
 */
export function resolvePublicCode(internalCode: unknown): {
  status?: number;
  code?: ApiErrorCode;
} {
  if (typeof internalCode !== "string") return {};
  const mapped = PG_TO_PUBLIC[internalCode];
  if (mapped) return mapped;
  if (isApiErrorCode(internalCode)) {
    return { status: statusForCode(internalCode), code: internalCode };
  }
  return {};
}

export function errorBody(
  message: string,
  requestId: string,
  code?: string,
  issues?: ApiIssue[],
): ErrorBody {
  const body: ErrorBody = { message, requestId };
  if (code) body.code = code;
  if (issues?.length) body.issues = issues;
  return body;
}

/** Request ID for an error body; never throws, mirrors middleware fallback. */
export function requestIdOf(req: Pick<Request, "requestId">): string {
  return req.requestId ?? "unscoped";
}

/**
 * The only sanctioned error writer. Use it for every 4xx/5xx response so the
 * envelope cannot drift: `fail(req, res, "NOT_FOUND", "Team not found")`.
 * `status` defaults to the code's canonical status.
 */
export function fail(
  req: Pick<Request, "requestId">,
  res: Pick<Response, "status" | "json">,
  code: ApiErrorCode,
  message: string,
  options: {
    status?: number;
    issues?: ApiIssue[];
    extra?: Record<string, unknown>;
  } = {},
): Response {
  const status = options.status ?? statusForCode(code);
  return res.status(status).json({
    ...options.extra,
    ...errorBody(message, requestIdOf(req), code, options.issues),
  });
}

/** Envelope for statuses with no specific code (middleware-thrown errors). */
export function failStatus(
  req: Pick<Request, "requestId">,
  res: Pick<Response, "status" | "json">,
  status: number,
  message: string,
  options: { code?: ApiErrorCode; issues?: ApiIssue[] } = {},
): Response {
  const code = options.code ?? codeForStatus(status);
  return res
    .status(status)
    .json(errorBody(message, requestIdOf(req), code, options.issues));
}

/**
 * Quotable support ID derived from a request ID (`req-<24hex>` or bare
 * hex). Display form `XXXX-XXXX` (first 4 + last 4 hex chars, uppercase).
 * Support joins it with `grep -i <chunk>` against logs carrying the full
 * request ID. Mirrors `supportIdFrom` in `client/src/lib/error-utils.ts` —
 * keep the algorithms identical.
 */
export function supportIdFrom(
  requestId: string | undefined | null,
): string | undefined {
  if (!requestId) return undefined;
  const hex = requestId.replace(/^req-/i, "");
  if (!/^[0-9a-fA-F]{8,}$/.test(hex)) return undefined;
  const h = hex.toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(-4)}`;
}
