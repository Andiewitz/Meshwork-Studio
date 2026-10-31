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
 *   "error": { "type": "Error", "message": "connection terminated",
 *              "code": "ECONNRESET", "stack": ["at …", "at …"],
 *              "cause": { "type": "Error", "message": "…", "stack": […] } } }
 * ```
 *
 * Rules: frames only (never variable values), cause chain capped at 5 so a
 * cyclic cause can't blow up the log line, internal codes kept (logs are
 * not client-facing — the envelope sanitizes separately).
 */

export interface ErrorTrace {
  type?: string;
  message: string;
  stack?: string[];
  code?: string;
  cause?: ErrorTrace;
  errors?: ErrorTrace[];
}

const MAX_CAUSE_DEPTH = 5;
const MAX_AGGREGATE = 5;
const MAX_FRAMES = 12;

/**
 * Marker set by `logTraceback`. The global error boundary checks it so an
 * error logged where it happened is not logged a second time when rethrown.
 */
const LOGGED = Symbol.for("meshwork.errorLogged");

export function wasLogged(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as Record<symbol, unknown>)[LOGGED] === true
  );
}

export function errorTrace(err: unknown, depth = 0): ErrorTrace {
  if (err instanceof Error) {
    const trace: ErrorTrace = { message: err.message };
    if (err.name) trace.type = err.name;
    if (typeof err.stack === "string") {
      trace.stack = err.stack
        .split("\n")
        .slice(0, MAX_FRAMES)
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
    if (err instanceof AggregateError && depth < MAX_CAUSE_DEPTH) {
      trace.errors = err.errors
        .slice(0, MAX_AGGREGATE)
        .map((inner) => errorTrace(inner, depth + 1));
    }
    return trace;
  }
  if (typeof err === "object" && err !== null) {
    const obj = err as { message?: unknown; name?: unknown; stack?: unknown };
    if (typeof obj.message === "string") {
      const trace: ErrorTrace = { message: obj.message };
      if (typeof obj.name === "string" && obj.name) trace.type = obj.name;
      if (typeof obj.stack === "string") {
        trace.stack = obj.stack
          .split("\n")
          .slice(0, MAX_FRAMES)
          .map((line) => line.trim());
      }
      return trace;
    }
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
  if (typeof err === "object" && err !== null) {
    try {
      Object.defineProperty(err, LOGGED, {
        value: true,
        enumerable: false,
        configurable: true,
      });
    } catch {
      /* frozen error objects still log normally */
    }
  }
  log.error({ ...ctx, error: errorTrace(err) }, msg);
}
