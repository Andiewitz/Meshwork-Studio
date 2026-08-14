import rateLimit from "express-rate-limit";
import type { Request } from "express";

// AI chat rate limiter - prevents cost exfiltration via unmetered proxy
// Limit each IP to 30 requests per 1 minute window
export const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 AI requests per window
  message: { message: "Too many AI requests, please slow down." },
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
  message: {
    message:
      "Free tier rate limit reached. Add your own API key in settings for higher limits.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  keyGenerator: (req: Request) => {
    return req.user?.id ?? "anonymous";
  },
});
