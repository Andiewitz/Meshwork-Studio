import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { errorBody } from "../lib/errorEnvelope";
import { RedisRateLimitStore } from "./redisRateLimitStore";

/** 429 body with a stable code clients can switch on + the request ID. */
function rateLimitedBody(req: Request, message: string) {
  return errorBody(message, req.requestId ?? "unscoped", "RATE_LIMITED");
}

// Global API rate limiter - protects against general DoS
// Limit each IP to 100 requests per 1 minute window (API_RATE_LIMIT_MAX
// overrides for load-test rigs; read at boot, so it survives the esbuild
// NODE_ENV inlining in scripts/build.ts).
const apiRateLimitMax = (() => {
  const n = Number(process.env.API_RATE_LIMIT_MAX);
  return Number.isFinite(n) && n > 0 ? n : 100;
})();
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: apiRateLimitMax,
  message: (req: Request) =>
    rateLimitedBody(req, "Too many requests, please try again after a minute."),
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  store: new RedisRateLimitStore("ratelimit:api"),
  // Count authenticated traffic per user across replicas; anonymous traffic
  // stays IP-keyed. IPv6 is grouped with express-rate-limit's helper.
  keyGenerator: (req: Request) =>
    req.user?.id ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? "")}`,
  skip: () => process.env.NODE_ENV === "test",
});

// Strict authentication rate limiter - protects against credential stuffing
// Limit each IP to 10 requests per 15 minute window
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per window
  message: (req: Request) =>
    rateLimitedBody(
      req,
      "Too many authentication attempts, please try again after 15 minutes.",
    ),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

// Refresh token rate limiter - prevents token farming
// Limit each IP to 100 requests per 1 hour window
export const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Limit each IP to 100 refresh requests per window
  message: (req: Request) =>
    rateLimitedBody(
      req,
      "Too many token refresh requests, please try again later.",
    ),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

// AI chat rate limiter - prevents cost exfiltration via unmetered proxy
// Limit each IP to 30 requests per 1 minute window
export const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 AI requests per window
  message: (req: Request) =>
    rateLimitedBody(req, "Too many AI requests, please slow down."),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

// Tighter rate limiter for free-tier AI requests (app-owned key).
// BYOK users spend their own money; free-tier spends ours — cap it harder.
// Applied conditionally by the route handler after provider resolution.
export const aiFreeTierLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 req/min on free tier (vs 30 for BYOK)
  message: (req: Request) =>
    rateLimitedBody(
      req,
      "Free tier rate limit reached. Add your own API key in settings for higher limits.",
    ),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  keyGenerator: (req: Request) => {
    // Key by user ID (not IP) so per-user limits are accurate.
    // This middleware only runs behind isAuthenticated, so req.user is always set.
    return req.user?.id ?? "anonymous";
  },
});
