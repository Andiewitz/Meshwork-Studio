import type pino from "pino";

/**
 * Proper server-side traceback for the next 500.
 *
 * Problem it solves: `log.error({ err })` relies on the logger's built-in
 * Error serialization, which varies by transport and buries the cause chain
 * in one string. This helper builds an explicit, greppable structure:
 *
 * ```json
 * { "requestId": "req-…", "route": "GET /workspaces/:id",
 *   "error": { "message": "connection terminated", "code": "ECONNRESET",
 *              "stack": ["at …", "at …"],
 *              "cause": { "message": "…", "stack": […] } } }
 * ```
 *
 * Rules: frames only (never variable values), cause chain capped at 5 so a
 * cyclic cause can't blow up the log line, internal codes kept (logs are
 * not client-facing — the envelope sanitizes separately).
 */

export interface ErrorTrace {
  message: string;
  stack?: string[];
  code?: string;
  cause?: ErrorTrace;
}

const MAX_CAUSE_DEPTH = 5;

export function errorTrace(err: unknown, depth = 0): ErrorTrace {
  if (err instanceof Error) {
    const trace: ErrorTrace = { message: err.message };
    if (typeof err.stack === "string") {
      trace.stack = err.stack
        .split("\n")
        .slice(0, 12)
        .map((line) => line.trim());
    }
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") {
      trace.code = String(code);
    }
    const cause = (err as { cause?: unknown }).cause;
    if (cause !== undefined && cause !== null && depth < MAX_CAUSE_DEPTH) {
      trace.cause =
        cause instanceof Error
          ? errorTrace(cause, depth + 1)
          : { message: String(cause) };
    }
    return trace;
  }
  return { message: String(err) };
}

/**
 * One-line full story: context fields (requestId, route, ids) sit next to
 * the structured traceback above. Use for every caught error on top of —
 * not instead of — the client-facing envelope.
 */
export function logTraceback(
  log: pino.Logger,
  msg: string,
  err: unknown,
  ctx: Record<string, unknown> = {},
): void {
  log.error({ ...ctx, error: errorTrace(err) }, msg);
}
