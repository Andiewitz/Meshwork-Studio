import pino from "pino";
import { errorTrace } from "./traceback";

/**
 * Structured logger for Meshwork Studio.
 *
 * - Development: pretty-printed, colorized output via pino-pretty
 * - Production: raw JSON lines (machine-parseable for log aggregators)
 *
 * Usage:
 *   import { logger, createChildLogger } from "./lib/logger";
 *   const log = createChildLogger("auth");
 *   log.info("User logged in", { userId: "abc" });
 */

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  serializers: {
    err: (err: unknown) => errorTrace(err),
    error: (err: unknown) => errorTrace(err),
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
});

/**
 * Create a child logger scoped to a specific module.
 * All log lines from this child will include `{ module: "<name>" }`.
 *
 * @example
 * const log = createChildLogger("websocket");
 * log.info("Client connected", { workspaceId: 42 });
 * // => { level: "info", module: "websocket", msg: "Client connected", workspaceId: 42 }
 */
export function createChildLogger(module: string) {
  return logger.child({ module });
}
