import rateLimit from "express-rate-limit";

// Strict authentication rate limiter - protects against credential stuffing
// Limit each IP to 10 requests per 15 minute window
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per window
  message: {
    message:
      "Too many authentication attempts, please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

// Refresh token rate limiter - prevents token farming
// Limit each IP to 100 requests per 1 hour window
export const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Limit each IP to 100 refresh requests per window
  message: {
    message: "Too many token refresh requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});
