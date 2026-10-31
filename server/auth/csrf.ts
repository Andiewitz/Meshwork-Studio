// CSRF defence for monolith-served mutations: strict exact-match origin
// allowlist + double-submit cookie comparison. The DB-bound secret check is
// intentionally NOT duplicated here — the Go auth service enforces bound
// secrets on its own endpoints; this side relies on origin + paired tokens.

import type { Request, RequestHandler } from "express";
import crypto from "node:crypto";
import { fail } from "../lib/errorEnvelope";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function timingSafeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function buildAllowlist(): Set<string> {
  const allowed = new Set<string>();
  const add = (raw?: string | null) => {
    if (!raw) return;
    try {
      const u = new URL(raw.trim());
      if ((u.protocol === "https:" || u.protocol === "http:") && u.host) {
        allowed.add(`${u.protocol}//${u.host}`);
      }
    } catch {
      /* ignore malformed entries */
    }
  };
  add(process.env.FRONTEND_URL);
  add(process.env.APP_URL);

  if (process.env.NODE_ENV !== "production") {
    for (const host of [
      "localhost:5173",
      "127.0.0.1:5173",
      "localhost:5000",
      "127.0.0.1:5000",
    ]) {
      allowed.add(`http://${host}`);
      allowed.add(`https://${host}`);
    }
  }
  return allowed;
}

const ALLOWED_ORIGINS = buildAllowlist();

export function isValidOrigin(
  req: Request,
  originOrReferer: string | undefined,
): boolean {
  // Exact scheme+host matching ONLY — substring checks are bypassable.
  if (!originOrReferer) return false;

  let url: URL;
  try {
    url = new URL(originOrReferer);
  } catch {
    return false;
  }

  if (req.get("host") && url.host === req.get("host")) return true; // same-origin

  let forwardedHost: string | undefined;
  try {
    forwardedHost =
      new URL(`${url.protocol}//${url.host}`).host ===
      req.get("x-forwarded-host")
        ? req.get("x-forwarded-host")
        : undefined;
  } catch {
    forwardedHost = undefined;
  }
  if (
    forwardedHost &&
    forwardedHost === req.get("host") &&
    url.host === forwardedHost
  ) {
    return true;
  }

  return ALLOWED_ORIGINS.has(`${url.protocol}//${url.host}`);
}

function cookieValue(req: Request, names: string[]): string | undefined {
  for (const name of names) {
    const v = req.cookies?.[name];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function hasSessionCookie(req: Request): boolean {
  return Boolean(
    cookieValue(req, ["__Host-meshwork_session", "meshwork_session"]),
  );
}

export function originAllowed(req: Request): boolean {
  const origin = req.get("origin");
  const referer = req.get("referer");

  // Fail closed for cookie-bearing browser mutations with no origin signal.
  if (!origin && !referer && hasSessionCookie(req)) return false;
  if (req.get("Sec-Fetch-Site") && !origin && !referer) return false;
  if (origin) return isValidOrigin(req, origin);
  if (referer) return isValidOrigin(req, referer);
  return true; // plain API client without cookies cannot be CSRF'd
}

export const csrfProtect: RequestHandler = (req, res, next) => {
  if (!MUTATING.has(req.method)) return next();

  if (!originAllowed(req)) {
    return fail(req, res, "CSRF_REJECTED", "CSRF validation failed");
  }

  const cookieToken =
    cookieValue(req, ["__Host-meshwork_csrf", "meshwork_csrf"]) ?? "";
  const headerToken = req.get("X-CSRF-Token") ?? "";
  if (
    !cookieToken ||
    !headerToken ||
    !timingSafeEqual(cookieToken, headerToken)
  ) {
    return fail(req, res, "CSRF_REJECTED", "CSRF validation failed");
  }
  next();
};
