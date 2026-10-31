// Node domain calls use INTERNAL_API_KEY. Go identity calls are configured
// separately in auth/internal-client.ts with AUTH_INTERNAL_KEY.
//
// Loopback-only by default: services live in one process behind NGINX, and
// NGINX never routes /internal/* — so these paths are unreachable externally.

import crypto from "node:crypto";
import type { z } from "zod";
import { fail } from "./errorEnvelope";

const INTERNAL_KEY = () => process.env.INTERNAL_API_KEY || "";

export class InternalCallError extends Error {
  readonly status = 503;
  readonly code = "DEPENDENCY_UNAVAILABLE";

  constructor(
    public readonly service: string,
    public readonly reason:
      "unconfigured" | "timeout" | "transport" | "http" | "invalid_response",
    public readonly upstreamStatus?: number,
  ) {
    // Never include an upstream body, URL, credential, or raw transport error.
    super(`${service} dependency unavailable (${reason})`);
    this.name = "InternalCallError";
  }
}

export interface InternalRequestOptions {
  timeoutMs?: number;
  requestId?: string;
}

type NodeInternalService = "workspace" | "team";

/**
 * Shared transport, not a service credential selector. Validate every response
 * and keep failures distinct from successful empty results. The timeout covers
 * both response headers and JSON body consumption.
 */
export async function requestInternal<T>(
  service: string,
  baseUrl: string,
  key: string,
  path: string,
  responseSchema: z.ZodType<T>,
  { timeoutMs = 3000, requestId }: InternalRequestOptions = {},
): Promise<T> {
  if (!key) throw new InternalCallError(service, "unconfigured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      headers: {
        "X-Internal-Key": key,
        ...(requestId ? { "X-Request-Id": requestId } : {}),
      },
      signal: controller.signal,
      redirect: "error",
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new InternalCallError(service, "http", res.status);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new InternalCallError(
        service,
        controller.signal.aborted ? "timeout" : "invalid_response",
      );
    }
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success)
      throw new InternalCallError(service, "invalid_response");
    return parsed.data;
  } catch (error) {
    if (error instanceof InternalCallError) throw error;
    throw new InternalCallError(
      service,
      controller.signal.aborted ? "timeout" : "transport",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Domain client. Identity consumers must use auth/internal-client instead. */
export function internalGet<T>(
  service: NodeInternalService,
  path: string,
  responseSchema: z.ZodType<T>,
  options?: InternalRequestOptions,
): Promise<T> {
  const baseUrl =
    process.env[`${service.toUpperCase()}_SERVICE_URL`] ||
    `http://127.0.0.1:${process.env.PORT || "5000"}`;
  return requestInternal(
    service,
    baseUrl,
    INTERNAL_KEY(),
    path,
    responseSchema,
    options,
  );
}

/** Express middleware: rejects internal calls without the shared key. */
export function requireInternalKey(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  const expected = Buffer.from(INTERNAL_KEY());
  const presented = Buffer.from(req.header("X-Internal-Key") || "");
  if (
    !expected.length ||
    presented.length !== expected.length ||
    !crypto.timingSafeEqual(presented, expected)
  ) {
    // Deliberately opaque: same body as any other missing route.
    fail(req, res, "NOT_FOUND", "Not Found");
    return;
  }
  next();
}
