import jwt from "jsonwebtoken";
import type { User } from "../db/schema";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("auth-jwt");

// Access token TTL: 15 minutes
export const ACCESS_TOKEN_EXPIRATION = "15m";
// Refresh token TTL: 7 days
export const REFRESH_TOKEN_EXPIRATION = "7d";

const JWT_SECRET =
  process.env.JWT_SECRET || "dev_insecure_jwt_secret_1234567890";

if (!process.env.JWT_SECRET) {
  log.warn(
    "JWT_SECRET environment variable is missing! Using insecure default for development.",
  );
  if (process.env.NODE_ENV === "production") {
    log.error(
      "CRITICAL: JWT_SECRET MUST be set in production to secure tokens!",
    );
  }
}

export interface JwtPayload {
  userId: string;
  type: "access" | "refresh";
  // Used for revocation via Redis — every token has one
  jti: string;
}

export function generateTokens(user: Pick<User, "id">) {
  const accessJti = crypto.randomUUID();
  const accessToken = jwt.sign(
    { userId: user.id, type: "access", jti: accessJti },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRATION },
  );

  const refreshJti = crypto.randomUUID();
  const refreshToken = jwt.sign(
    { userId: user.id, type: "refresh", jti: refreshJti },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRATION },
  );

  return { accessToken, refreshToken, accessJti, refreshJti };
}

export function verifyToken(
  token: string,
  expectedType: "access" | "refresh",
): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (decoded.type !== expectedType) {
      log.warn(
        { expectedType, actualType: decoded.type },
        "Token type mismatch",
      );
      return null;
    }
    return decoded;
  } catch (err: unknown) {
    const jwtErr = err as { name?: string; message?: string };
    if (jwtErr.name !== "TokenExpiredError") {
      log.warn({ err: jwtErr.message }, "Token verification failed");
    }
    return null;
  }
}
