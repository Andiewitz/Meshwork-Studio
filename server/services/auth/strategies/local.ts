import { Strategy as LocalStrategy } from "passport-local";
import { db } from "../db/connection";
import { users, type User } from "../db/schema";
import { eq } from "drizzle-orm";
import { createChildLogger } from "@server/lib/logger";
import { verifyPassword } from "../password";
import {
  isAccountLocked,
  recordFailedAttempt,
  resetFailedAttempts,
} from "../rate-limit/lockout";

const log = createChildLogger("auth-local");

// In-memory user store for development mode (no database)
interface InMemoryUser {
  id: string;
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  authProvider: string;
}

const inMemoryUsers = new Map<string, InMemoryUser>();

const TEST_USER_PASSWORD_HASH =
  "$2b$12$v6EvD7w1EWp73YDjRxZIE.ujiDaph6AfLjFCuNEAfSA7VSBLRee9O"; // bcrypt hash of "Test123!@#" with salt rounds 12
inMemoryUsers.set("test@example.com", {
  id: "test-user-1",
  email: "test@example.com",
  passwordHash: TEST_USER_PASSWORD_HASH,
  firstName: "Test",
  lastName: "User",
  authProvider: "email",
});

/**
 * Create and configure Local (email/password) strategy
 */
export function createLocalStrategy() {
  return new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    async (email: string, password: string, done) => {
      try {
        // SECURITY: Check if account is locked due to failed attempts
        const lockoutStatus = await isAccountLocked(email);
        if (lockoutStatus.locked) {
          const lockedUntilTime =
            lockoutStatus.lockedUntil?.toLocaleString() || "unknown";
          log.warn(
            { email, lockedUntil: lockedUntilTime },
            "Login blocked: account locked",
          );
          return done(null, false, {
            message:
              "Account temporarily locked due to too many failed login attempts. Please try again later.",
          });
        }

        // Find user by email (with database fallback)
        let user: User | InMemoryUser | null = null;
        try {
          const [dbUser] = await db
            .select()
            .from(users)
            .where(eq(users.email, email));
          user = dbUser ?? null;
        } catch (error: unknown) {
          log.error(
            {
              err: error instanceof Error ? error.message : String(error),
              email,
            },
            "Local strategy: DB query failed, falling back to in-memory",
          );
          user = inMemoryUsers.get(email) ?? null;
        }

        if (!user) {
          await recordFailedAttempt(email);
          log.info({ email }, "Local strategy: no user found");
          return done(null, false, {
            message: "No account found with this email",
          });
        }

        // Check if user has a password (email auth)
        if (!user.passwordHash) {
          await recordFailedAttempt(email);
          log.info(
            { email },
            "Local strategy: user has no password (OAuth-only account)",
          );
          return done(null, false, {
            message:
              "This account uses Google Login. Please sign in with Google.",
          });
        }

        // Verify password
        const isValid = await verifyPassword(password, user.passwordHash);

        if (!isValid) {
          const failureInfo = await recordFailedAttempt(email);

          const message = failureInfo.locked
            ? `Incorrect password. Account locked due to too many failed attempts.`
            : `Incorrect password. Please try again.`;

          log.info(
            {
              email,
              attemptsRemaining: failureInfo.attemptsRemaining,
              locked: failureInfo.locked,
            },
            "Local strategy: incorrect password",
          );
          return done(null, false, { message });
        }

        // Successful login - reset failed attempts
        await resetFailedAttempts(email);

        log.info(
          { email, userId: user.id },
          "Local strategy: authentication successful",
        );
        return done(null, {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          authProvider: user.authProvider,
        } as Express.User);
      } catch (err: unknown) {
        log.error(
          {
            err: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            email,
          },
          "Local strategy: unhandled exception",
        );
        return done(err instanceof Error ? err : new Error(String(err)));
      }
    },
  );
}
