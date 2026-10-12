// Server-to-server introspection client: when a browser presents a valid
// opaque session cookie but its local assertion is missing/expired, the
// monolith asks the auth service to validate the session and hand back a
// freshly signed assertion. One bounded network hop on the rare expiry
// path — every other request stays purely local.

import crypto from "node:crypto";
import { createChildLogger } from "../lib/logger";

const log = createChildLogger("auth-introspect");

export interface IntrospectionResult {
  active: boolean;
  sub?: string;
  sid?: string;
  adm?: boolean;
  eml?: string;
  nam?: string;
  assertion?: string;
}

const TIMEOUT_MS = 4000;

// Read lazily so tests can configure per-run and ops can rotate without a
// monolith restart racing the auth service.
function internalKey(): string {
  return process.env.AUTH_INTERNAL_KEY || "";
}
function authServiceUrl(): string {
  return (process.env.AUTH_SERVICE_URL || "http://127.0.0.1:8081").replace(
    /\/$/,
    "",
  );
}

// Negative-result cache: a token that just introspected as inactive is very
// likely stale/replayed — don't hammer the auth service for it.
const negativeCache = new Map<string, number>();
const NEGATIVE_TTL = 10_000;

// In-flight dedup: concurrent requests with the same token share one call.
const inflight = new Map<string, Promise<IntrospectionResult | null>>();

function tokenFingerprint(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function cachedNegative(fp: string): boolean {
  const until = negativeCache.get(fp);
  if (!until) return false;
  if (until < Date.now()) {
    negativeCache.delete(fp);
    return false;
  }
  return true;
}

/**
 * Ask the auth service whether this opaque session token is live. Returns
 * claims + a fresh assertion on success; null on any failure (caller then
 * rejects — fail closed).
 */
export async function introspectSession(
  rawToken: string,
  requestId?: string,
): Promise<IntrospectionResult | null> {
  const key = internalKey();
  if (!key) return null; // unconfigured → caller fails closed on assertion alone

  const fp = tokenFingerprint(rawToken);
  if (cachedNegative(fp)) return null;

  const existing = inflight.get(fp);
  if (existing) return existing;

  const call = (async (): Promise<IntrospectionResult | null> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(`${authServiceUrl()}/internal/introspect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Key": key,
          // Join this hop to the inbound request's trace. Go adopts it
          // verbatim (requestIDMiddleware) and echoes it in logs + body.
          ...(requestId ? { "X-Request-Id": requestId } : {}),
        },
        body: JSON.stringify({ token: rawToken }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      // Go echoes the adopted (or its own minted) ID back. Log it so the
      // Node hop joins the Go trace even when Node didn't mint the ID
      // (e.g. WS upgrades, where no Express request exists).
      const upstreamId =
        res.headers.get("X-Request-Id") ?? requestId ?? "unscoped";

      if (!res.ok) {
        log.warn(
          { status: res.status, requestId: upstreamId },
          "introspection rejected",
        );
        negativeCache.set(fp, Date.now() + NEGATIVE_TTL);
        return null;
      }
      const data = (await res.json()) as IntrospectionResult;
      if (!data.active || !data.sub || !data.assertion) {
        negativeCache.set(fp, Date.now() + NEGATIVE_TTL);
        return null;
      }
      return data;
    } catch (err) {
      log.warn(
        {
          err: err instanceof Error ? err.message : err,
          requestId: requestId ?? "unscoped (no upstream response)",
        },
        "introspection unavailable — failing closed",
      );
      // Do NOT negative-cache transport failures; auth may come back any second.
      return null;
    } finally {
      inflight.delete(fp);
    }
  })();

  inflight.set(fp, call);
  return call;
}
