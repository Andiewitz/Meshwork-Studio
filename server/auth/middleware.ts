// bounded introspection call refreshes it (see introspect.ts).

import type { Request, RequestHandler, Response } from "express";
import type { IncomingMessage } from "http";
import { Verifier, type AssertionClaims } from "./assertion";
import { revokedSessions, startRevocationListener } from "./denylist";
import { introspectSession } from "./introspect";

export interface AuthUser {
  id: string;
  email?: string;
  firstName?: string;
  isAdmin: boolean;
  sessionId: string;
}

export interface AuthContext {
  userId: string;
  sessionId: string;
  user: AuthUser;
}

let verifier: Verifier | null = null;

/** Boot-time initialisation. Production refuses to start without keys. */
export function initAuth(): void {
  const publicKey = process.env.AUTH_ASSERTION_PUBLIC_KEY?.trim();
  if (!publicKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FATAL: AUTH_ASSERTION_PUBLIC_KEY must be set in production " +
          "(base64 Ed25519 public key from the auth service)",
      );
    }
    console.warn(
      "[auth] AUTH_ASSERTION_PUBLIC_KEY not set — auth middleware will reject " +
        "everything until the auth service key is provided (development)",
    );
    return;
  }
  const prev = (process.env.AUTH_ASSERTION_PREVIOUS_KEYS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  verifier = new Verifier(publicKey, prev);
  startRevocationListener();
}

const ASSERTION_COOKIE_NAMES = [
  "__Host-meshwork_assertion",
  "meshwork_assertion",
];
const SESSION_COOKIE_NAMES = ["__Host-meshwork_session", "meshwork_session"];

function readCookie(req: Request, names: string[]): string | undefined {
  for (const name of names) {
    const v = req.cookies?.[name];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function toUser(claims: AssertionClaims): AuthUser {
  return {
    id: claims.sub,
    email: claims.eml,
    firstName: claims.nam,
    isAdmin: claims.adm,
    sessionId: claims.sid,
  };
}

function setAssertionCookie(res: Response, token: string): void {
  // Mirror the Go service's cookie attributes; 5 minutes.
  res.cookie("meshwork_assertion", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 5 * 60 * 1000,
  });
}

function verify(req: Request): AuthUser | null {
  if (!verifier) return null;
  const claims = verifier.verify(readCookie(req, ASSERTION_COOKIE_NAMES));
  if (!claims) return null;
  if (revokedSessions.has(claims.sid)) return null;
  return toUser(claims);
}

/**
 * Full authentication path:
 *   1. valid assertion → authenticated locally (hot path, zero I/O)
 *   2. expired/missing assertion but session cookie present → introspect
 *      once against the auth service and relay the fresh assertion cookie
 *   3. otherwise → unauthenticated
 */
async function authenticate(
  req: Request,
  res: Response,
): Promise<AuthUser | null> {
  const local = verify(req);
  if (local) return local;

  const rawSession = readCookie(req, SESSION_COOKIE_NAMES);
  if (!rawSession) return null;

  const result = await introspectSession(rawSession);
  if (!result?.assertion) return null;

  // Verify what the service just signed before trusting it — never assume.
  if (!verifier) return null;
  const claims = verifier.verify(result.assertion);
  if (!claims || claims.sub !== result.sub || revokedSessions.has(claims.sid)) {
    return null;
  }

  setAssertionCookie(res, result.assertion);
  return toUser(claims);
}

const unauthorized = (res: Response) =>
  res
    .status(401)
    .json({ code: "UNAUTHENTICATED", message: "Authentication required" });

/** Populates req.user when a valid assertion exists; never rejects. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  try {
    const user = verify(req); // no introspection on the anonymous-tolerant path
    if (user) {
      (req as Request & { auth?: AuthContext }).auth = {
        userId: user.id,
        sessionId: user.sessionId,
        user,
      };
      req.user = user as unknown as Request["user"];
    }
  } catch {
    // optional auth must never break the request path
  }
  next();
};

/** Rejects unauthenticated requests with 401. */
export const requireAuth: RequestHandler = (req, res, next) => {
  void authenticate(req, res)
    .then((user) => {
      if (!user) return unauthorized(res);
      (req as Request & { auth?: AuthContext }).auth = {
        userId: user.id,
        sessionId: user.sessionId,
        user,
      };
      req.user = user as unknown as Request["user"];
      next();
    })
    .catch(() => unauthorized(res));
};

/** Verify a raw assertion token without an Express request (WS upgrades). */
export function verifyAssertionToken(
  token: string | undefined | null,
): AssertionClaims | null {
  if (!verifier) return null;
  const claims = verifier.verify(token);
  if (!claims || revokedSessions.has(claims.sid)) return null;
  return claims;
}

/**
 * WS upgrade path: assertion first, introspection fallback second (sockets
 * reconnect after idle periods and must not bounce users to re-login).
 * Accepts a raw IncomingMessage — upgrade events bypass Express.
 */
export async function authenticateUpgrade(
  req: IncomingMessage,
): Promise<{ user: AuthUser; freshAssertion?: string } | null> {
  const cookiesHeader = req.headers.cookie ?? "";
  const cookieMap: Record<string, string> = {};
  for (const part of cookiesHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0)
      cookieMap[part.slice(0, idx).trim()] = decodeURIComponent(
        part.slice(idx + 1).trim(),
      );
  }

  const direct = verifier
    ? (() => {
        const token =
          cookieMap["__Host-meshwork_assertion"] ||
          cookieMap.meshwork_assertion;
        const claims = verifier.verify(token);
        if (!claims || revokedSessions.has(claims.sid)) return null;
        return toUser(claims);
      })()
    : null;
  if (direct) return { user: direct };

  const rawSession =
    cookieMap["__Host-meshwork_session"] || cookieMap.meshwork_session;
  if (!rawSession) return null;

  const result = await introspectSession(rawSession);
  if (!result?.sub || !result.sid || !result.assertion) return null;

  if (!verifier) return null;
  const claims = verifier.verify(result.assertion);
  if (!claims || revokedSessions.has(claims.sid)) return null;

  return {
    user: toUser(claims),
    freshAssertion: result.assertion,
  };
}
