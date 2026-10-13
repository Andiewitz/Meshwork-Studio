// Server-to-server HTTP client for monolith-internal service calls
// (workspace ⇄ team ⇄ metrics). Guarded by the shared INTERNAL_API_KEY.
//
// Loopback-only by default: services live in one process behind NGINX, and
// NGINX never routes /internal/* — so these paths are unreachable externally.

import crypto from "node:crypto";

const INTERNAL_KEY = () => process.env.INTERNAL_API_KEY || "";

export class InternalCallError extends Error {
  constructor(
    public readonly service: string,
    public readonly status: number,
    message?: string,
  ) {
    super(message || `${service} internal call failed (${status})`);
  }
}

/**
 * Base URL per service. The Go auth service listens on :8081 in every
 * topology (host, compose, EC2); the in-process domain services answer on
 * the monolith's own port. Env overrides win when set.
 */
const SERVICE_DEFAULT_PORT: Record<string, number> = { auth: 8081 };

function baseUrl(service: string): string {
  const key = `${service.toUpperCase()}_SERVICE_URL`;
  const fallback = `http://127.0.0.1:${SERVICE_DEFAULT_PORT[service] ?? 5000}`;
  return (process.env[key] || fallback).replace(/\/$/, "");
}

/**
 * GET an internal endpoint, returning parsed JSON or null on failure.
 * Pass the inbound requestId so the downstream service joins the same
 * trace (it adopts X-Request-Id verbatim); omitted = downstream mints one.
 */
export async function internalGet<T>(
  service: string,
  path: string,
  timeoutMs = 3000,
  requestId?: string,
): Promise<T | null> {
  const key = INTERNAL_KEY();
  if (!key) return null; // unconfigured → callers use their fallback path

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl(service)}${path}`, {
      headers: {
        "X-Internal-Key": key,
        ...(requestId ? { "X-Request-Id": requestId } : {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new InternalCallError(service, res.status);
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Express middleware: rejects internal calls without the shared key. */
export function requireInternalKey(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  const expected = INTERNAL_KEY();
  const presented = req.header("X-Internal-Key") || "";
  if (
    !expected ||
    presented.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expected))
  ) {
    // Deliberately opaque (no code — must not confirm the route exists),
    // but the request ID still joins to server logs.
    res
      .status(404)
      .json({ message: "Not Found", requestId: req.requestId ?? "unscoped" });
    return;
  }
  next();
}
