import passport from "passport";
import { createChildLogger } from "@server/lib/logger";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import RedisStore from "connect-redis";
import memorystore from "memorystore";
import { getRedis } from "@server/lib/redis";
import { createGoogleStrategy } from "../strategies/google";
import { createLocalStrategy } from "../strategies/local";
import { verifyToken, isAccessTokenRevoked } from "../jwt";
import { authStorage } from "../db/storage";

const log = createChildLogger("auth-middleware");

function requireSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FATAL: SESSION_SECRET environment variable must be set and at least 32 characters in production!",
      );
    }
    log.warn(
      "SESSION_SECRET environment variable is missing or short! Using local development key.",
    );
    return secret || "dev_only_insecure_dev_key_12345_min_32_chars";
  }
  return secret;
}

const getSession = () => {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const isProduction = process.env.NODE_ENV === "production";
  const sessionSecret = requireSessionSecret();
  const redisClient = getRedis();

  if (!redisClient) {
    if (isProduction) {
      log.warn(
        "Redis client not available in production — falling back to memory store with secure cookie.",
      );
    } else {
      log.warn(
        "Redis client not available, falling back to in-memory session store (development only)",
      );
    }
    const MemoryStore = memorystore(session);
    return session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({
        checkPeriod: 86400000,
      }),
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: sessionTtl,
      },
    });
  }

  const sessionStore = new RedisStore({
    client: redisClient,
    prefix: "sess:",
    ttl: sessionTtl / 1000,
  });

  return session({
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
};

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: any, cb) => cb(null, user.id));
  passport.deserializeUser(async (id: string, cb) => {
    try {
      const user = await authStorage.getUser(id);
      cb(null, user || false);
    } catch (err) {
      cb(err, null);
    }
  });

  // Register Google strategy if configured
  const googleStrategy = createGoogleStrategy();
  if (googleStrategy) {
    passport.use("google", googleStrategy);
  }

  // Register Local strategy
  passport.use("local", createLocalStrategy());
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // E2E Test Auth Bypass — allow mock dashboard/canvas testing without active session cookie
  if (process.env.E2E_BYPASS_AUTH === "true") {
    if (process.env.NODE_ENV === "production") {
      return res.status(500).json({ message: "Authentication misconfigured" });
    }
    req.user = {
      id: "mock-id-1",
      email: "architect@meshwork.dev",
      firstName: "Test",
      lastName: "User",
      profileImageUrl: null,
      authProvider: "local",
      hasNotifiedTeam: false,
      readNotificationIds: [],
      createdAt: new Date(),
    } as Express.User;
    return next();
  }

  // First check if the user is authenticated via Passport session (useful during OAuth)
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    const user = await authStorage.getUser((req.user as any).id);
    if (!user) {
      return res.status(401).json({ message: "User account no longer exists" });
    }
    req.user = user;
    return next();
  }

  // Then check for JWT access token in cookies
  const accessToken = req.cookies?.access_token;
  if (!accessToken) {
    return res.status(401).json({ message: "No access token provided" });
  }

  const payload = verifyToken(accessToken, "access");
  if (!payload) {
    return res.status(401).json({ message: "Access token expired or invalid" });
  }

  // Check if this specific access token has been explicitly revoked
  if (payload.jti) {
    const revoked = await isAccessTokenRevoked(payload.jti);
    if (revoked) {
      return res.status(401).json({ message: "Token has been revoked" });
    }
  }

  // Rehydrate full user object from DB
  const user = await authStorage.getUser(payload.userId);
  if (!user) {
    return res.status(401).json({ message: "User account no longer exists" });
  }

  req.user = user;
  next();
};
