import type { Request, Response } from "express";

const DEFAULT_TIMEOUT_MS = 45_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 90_000;

export class ProviderTimeoutError extends Error {
  readonly status = 504;
  readonly code = "PROVIDER_TIMEOUT";

  constructor(timeoutMs: number) {
    super(`AI provider did not respond within ${timeoutMs / 1_000} seconds`);
    this.name = "ProviderTimeoutError";
  }
}

export class ClientDisconnectedError extends Error {
  constructor() {
    super("Client disconnected before AI response completed");
    this.name = "ClientDisconnectedError";
  }
}

export function providerTimeoutMs(): number {
  const configured = Number(process.env.AI_PROVIDER_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.max(
    MIN_TIMEOUT_MS,
    Math.min(MAX_TIMEOUT_MS, Math.floor(configured)),
  );
}

export interface ProviderAbortScope {
  signal: AbortSignal;
  timeoutMs: number;
  dispose(): void;
}

/**
 * Cancels upstream model calls as soon as the HTTP peer leaves, and gives every
 * request a bounded deadline. This prevents a slow provider from consuming a
 * Node request slot indefinitely on the small production instance.
 */
export function createProviderAbortScope(
  req: Request,
  res: Response,
): ProviderAbortScope {
  const controller = new AbortController();
  const timeoutMs = providerTimeoutMs();
  const abortForDisconnect = () => {
    if (!controller.signal.aborted) {
      controller.abort(new ClientDisconnectedError());
    }
  };
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new ProviderTimeoutError(timeoutMs));
    }
  }, timeoutMs);
  timer.unref();

  req.once("aborted", abortForDisconnect);
  res.once("close", abortForDisconnect);

  return {
    signal: controller.signal,
    timeoutMs,
    dispose() {
      clearTimeout(timer);
      req.off("aborted", abortForDisconnect);
      res.off("close", abortForDisconnect);
    },
  };
}

export function abortReason(signal?: AbortSignal): unknown {
  return signal?.aborted ? signal.reason : undefined;
}
