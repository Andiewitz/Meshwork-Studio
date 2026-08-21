import type { Express, Request, Response, NextFunction } from "express";
import { createChildLogger } from "@server/lib/logger";
import passport from "passport";
import { db } from "../db/connection";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from "../password";
import {
  generateTokens,
  verifyToken,
  revokeRefreshToken,
  revokeAccessToken,
  isRefreshTokenRevoked,
} from "../jwt";
import { isAuthenticated } from "../middleware/authMiddleware";
import { optionalCaptchaMiddleware } from "../captcha";
import { authLimiter, refreshLimiter } from "../rate-limit/rateLimit";
import { csrfProtection } from "@server/middleware/csrf";
import { validate } from "@server/middleware/validate";
import { registerSchema, loginSchema, changePasswordSchema } from "../schemas";
import type { AppContext } from "@server/lib/registry";

const log = createChildLogger("auth-routes");

/** Typed shape of what passport's local strategy returns */
interface AuthenticatedUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  authProvider: string;
  hasNotifiedTeam?: boolean | null;
  readNotificationIds?: unknown;
  createdAt?: Date | null;
}

/** What passport's `info` object looks like on failure */
interface PassportAuthInfo {
  message?: string;
  lockedUntil?: Date;
}

/** User preferences update shape */
interface UserPreferencesUpdate {
  hasNotifiedTeam?: boolean;
  readNotificationIds?: unknown;
}

/** Extended request with typed user */
type AuthenticatedRequest = Request & { user: AuthenticatedUser };

export function registerAuthRoutes(app: Express, context: AppContext): void {
  // GitHub OAuth routes
  app.get(
    "/api/v1/auth/github",
    (req: Request, res: Response, next: NextFunction) => {
      const isConfigured =
        process.env.NODE_ENV === "test" ||
        (Boolean(process.env.GITHUB_CLIENT_ID) &&
          Boolean(process.env.GITHUB_CLIENT_SECRET));

      if (!isConfigured) {
        log.warn(
          "GitHub OAuth attempted but strategy is not configured (missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET)",
        );
        return res.redirect("/?auth=login&error=github_not_configured");
      }

      passport.authenticate("github", {
        scope: ["user:email"],
      })(req, res, next);
    },
  );

  // Google OAuth routes
  app.get(
    "/api/v1/auth/google",
    (req: Request, res: Response, next: NextFunction) => {
      const isConfigured =
        process.env.NODE_ENV === "test" ||
        (Boolean(process.env.GOOGLE_CLIENT_ID) &&
          Boolean(process.env.GOOGLE_CLIENT_SECRET));

      if (!isConfigured) {
        log.warn(
          "Google OAuth attempted but strategy is not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)",
        );
        return res.redirect("/?auth=login&error=google_not_configured");
      }

      passport.authenticate("google", {
        scope: ["profile", "email"],
        state: true,
      })(req, res, next);
    },
  );

  app.get(
    "/api/v1/auth/google/callback",
    (req: Request, res: Response, next: NextFunction) => {
      passport.authenticate(
        "google",
        (
          err: Error | null,
          user: AuthenticatedUser | false,
          info: PassportAuthInfo,
        ) => {
          if (err) {
            log.warn({ err }, "Google OAuth callback error");
            return res.redirect("/?auth=login&error=google");
          }
          if (!user) {
            log.warn({ info }, "Google OAuth rejected — no user returned");
            return res.redirect("/?auth=login&error=google");
          }

          req.login(user as Express.User, (loginErr: Error | null) => {
            if (loginErr) {
              log.error(
                { err: loginErr, userId: user.id },
                "Google OAuth session login failed",
              );
              return res.redirect("/?auth=login&error=google");
            }

            const { accessToken, refreshToken } = generateTokens({
              id: user.id,
            });

            const isProd = process.env.NODE_ENV === "production";
            res.cookie("access_token", accessToken, {
              httpOnly: true,
              secure: isProd,
              sameSite: "lax",
              maxAge: 15 * 60 * 1000, // 15 minutes
            });

            res.cookie("refresh_token", refreshToken, {
              httpOnly: true,
              secure: isProd,
              sameSite: "lax",
              maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            });

            return res.redirect("/");
          });
        },
      )(req, res, next);
    },
  );

  // Register with email/password (with CAPTCHA protection)
  app.post(
    "/api/v1/auth/register",
    authLimiter,
    optionalCaptchaMiddleware,
    validate({ body: registerSchema }),
    async (req: Request, res: Response) => {
      log.info({ email: req.body?.email }, "Register attempt received");
      try {
        const rawBody = req.body as {
          email: string;
          password: string;
          firstName?: string;
          lastName?: string;
        };
        const email = rawBody.email.trim().toLowerCase();
        const password = rawBody.password;
        const firstName = rawBody.firstName;
        const lastName = rawBody.lastName;

        const validation = validatePasswordStrength(password);
        if (!validation.valid) {
          return res.status(400).json({
            message: "Password does not meet security requirements",
            errors: validation.errors,
          });
        }

        const [existingUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, email));

        if (existingUser) {
          return res
            .status(409)
            .json({ message: "Registration could not be completed" });
        }

        const passwordHash = await hashPassword(password);

        const [newUser] = await db
          .insert(users)
          .values({
            email,
            passwordHash,
            firstName: firstName ?? null,
            lastName: lastName ?? null,
            authProvider: "email",
          })
          .returning();

        req.login(newUser, (loginErr: Error | null) => {
          if (loginErr) {
            log.error(
              { err: loginErr, userId: newUser.id, email },
              "Register: req.login (session serialization) failed",
            );
            return res.status(201).json({
              message: "Registration successful",
              userId: newUser.id,
            });
          }

          try {
            const { accessToken, refreshToken } = generateTokens(newUser);
            const isProd = process.env.NODE_ENV === "production";

            res.cookie("access_token", accessToken, {
              httpOnly: true,
              secure: isProd,
              sameSite: "lax",
              maxAge: 15 * 60 * 1000, // 15 minutes
            });

            res.cookie("refresh_token", refreshToken, {
              httpOnly: true,
              secure: isProd,
              sameSite: "lax",
              maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            });

            log.info(
              { userId: newUser.id, email },
              "Register: tokens set, response sent",
            );
            const accessTokenExpiresAt = new Date(
              Date.now() + 15 * 60 * 1000,
            ).toISOString();
            return res
              .status(201)
              .json({ user: newUser, accessTokenExpiresAt });
          } catch (tokenErr: unknown) {
            log.error(
              { err: tokenErr, userId: newUser.id, email },
              "Register: token generation or cookie setup failed",
            );
            return res.status(201).json({
              message: "Registration successful",
              userId: newUser.id,
            });
          }
        });
      } catch (err: unknown) {
        log.error({ err, email: req.body?.email }, "Registration error");
        res
          .status(500)
          .json({ message: "Registration failed due to a server error" });
      }
    },
  );

  // Login with email/password
  app.post(
    "/api/v1/auth/login",
    authLimiter,
    validate({ body: loginSchema }),
    (req: Request, res: Response, next: NextFunction) => {
      const rawEmail = (req.body ?? {}).email;
      const email =
        typeof rawEmail === "string"
          ? rawEmail.trim().toLowerCase()
          : undefined;
      if (req.body && email) {
        req.body.email = email;
      }
      log.info({ email }, "Login attempt received");

      passport.authenticate(
        "local",
        (
          err: Error | null,
          user: AuthenticatedUser | false,
          info: PassportAuthInfo,
        ) => {
          if (err) {
            log.error(
              { err, email },
              "Login: passport authenticate callback error",
            );
            return next(err);
          }
          if (!user) {
            log.warn(
              {
                email,
                infoMessage: info?.message,
                lockedUntil: info?.lockedUntil,
              },
              "Login: authentication rejected by strategy",
            );
            return res.status(401).json({
              message: "Invalid email or password",
            });
          }

          log.info(
            { userId: user.id, email },
            "Login: strategy accepted, calling req.login",
          );

          req.login(user as Express.User, (loginErr: Error | null) => {
            if (loginErr) {
              log.error(
                { err: loginErr, userId: user.id, email },
                "Login: req.login (session serialization) failed",
              );
              return next(loginErr);
            }

            log.info(
              { userId: user.id, email },
              "Login: req.login successful, generating tokens",
            );

            try {
              const { accessToken, refreshToken } = generateTokens(user);

              const isProd = process.env.NODE_ENV === "production";
              res.cookie("access_token", accessToken, {
                httpOnly: true,
                secure: isProd,
                sameSite: "lax",
                maxAge: 15 * 60 * 1000, // 15 minutes
              });

              res.cookie("refresh_token", refreshToken, {
                httpOnly: true,
                secure: isProd,
                sameSite: "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
              });

              log.info(
                { userId: user.id, email },
                "Login: tokens set, response sent",
              );
              const accessTokenExpiresAt = new Date(
                Date.now() + 15 * 60 * 1000,
              ).toISOString();
              return res.json({ user, accessTokenExpiresAt });
            } catch (tokenErr: unknown) {
              log.error(
                { err: tokenErr, userId: user.id, email },
                "Login: token generation or cookie setup failed",
              );
              return next(tokenErr);
            }
          });
        },
      )(req, res, next);
    },
  );

  // Refresh Token endpoint
  app.post(
    "/api/v1/auth/refresh",
    refreshLimiter,
    async (req: Request, res: Response) => {
      const refreshToken = req.cookies?.refresh_token as string | undefined;

      if (!refreshToken) {
        return res.status(401).json({ message: "No refresh token provided" });
      }

      const payload = verifyToken(refreshToken, "refresh");
      if (!payload) {
        res.clearCookie("access_token");
        res.clearCookie("refresh_token");
        return res
          .status(401)
          .json({ message: "Invalid or expired refresh token" });
      }

      if (payload.jti) {
        const isRevoked = await isRefreshTokenRevoked(payload.jti);
        if (isRevoked) {
          log.warn(
            { userId: payload.userId, jti: payload.jti },
            "Attempt to use revoked refresh token",
          );
          res.clearCookie("access_token");
          res.clearCookie("refresh_token");
          return res.status(401).json({ message: "Token has been revoked" });
        }
      }

      try {
        const [existingUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, payload.userId));

        if (!existingUser) {
          log.warn(
            { userId: payload.userId },
            "Refresh attempt for non-existent user",
          );
          res.clearCookie("access_token");
          res.clearCookie("refresh_token");
          return res.status(401).json({ message: "User no longer exists" });
        }
      } catch (dbError: unknown) {
        log.error(
          { err: dbError, userId: payload.userId },
          "Database error during refresh user check",
        );
        return res
          .status(503)
          .json({ message: "Service temporarily unavailable" });
      }

      const { accessToken, refreshToken: newRefreshToken } = generateTokens({
        id: payload.userId,
      });

      // Revoke the old refresh token JTI to prevent token reuse/replay
      if (payload.jti) {
        await revokeRefreshToken(payload.jti);
      }

      const isProd = process.env.NODE_ENV === "production";
      res.cookie("access_token", accessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });

      res.cookie("refresh_token", newRefreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const accessTokenExpiresAt = new Date(
        Date.now() + 15 * 60 * 1000,
      ).toISOString();
      res.json({
        message: "Token refreshed successfully",
        accessTokenExpiresAt,
      });
    },
  );

  // Logout
  app.post(
    "/api/v1/auth/logout",
    csrfProtection,
    async (req: Request, res: Response) => {
      const refreshToken = req.cookies?.refresh_token as string | undefined;
      if (refreshToken) {
        const payload = verifyToken(refreshToken, "refresh");
        if (payload?.jti) {
          await revokeRefreshToken(payload.jti);
        }
      }

      const accessToken = req.cookies?.access_token as string | undefined;
      if (accessToken) {
        const payload = verifyToken(accessToken, "access");
        if (payload?.jti) {
          await revokeAccessToken(payload.jti);
        }
      }

      res.clearCookie("access_token");
      res.clearCookie("refresh_token");

      req.logout((logoutErr: Error | null) => {
        if (logoutErr) {
          log.error(
            {
              err: logoutErr,
              userId: (req.user as AuthenticatedUser | undefined)?.id,
            },
            "Logout error",
          );
          return res.status(500).json({ message: "Logout failed" });
        }
        res.json({ message: "Logged out successfully" });
      });
    },
  );

  // Get current authenticated user
  app.get(
    "/api/v1/auth/me",
    isAuthenticated,
    async (req: Request, res: Response) => {
      const authenticatedReq = req as AuthenticatedRequest;
      try {
        const userId = authenticatedReq.user.id;

        if (process.env.E2E_BYPASS_AUTH === "true") {
          return res.json(authenticatedReq.user);
        }

        let user: AuthenticatedUser | undefined;
        try {
          const [dbUser] = await db
            .select({
              id: users.id,
              email: users.email,
              firstName: users.firstName,
              lastName: users.lastName,
              profileImageUrl: users.profileImageUrl,
              authProvider: users.authProvider,
              hasNotifiedTeam: users.hasNotifiedTeam,
              readNotificationIds: users.readNotificationIds,
              createdAt: users.createdAt,
            })
            .from(users)
            .where(eq(users.id, userId));
          user = dbUser;
        } catch (dbError: unknown) {
          log.error(
            { err: dbError, userId },
            "Database error fetching user in /auth/me",
          );

          if (process.env.NODE_ENV === "production") {
            return res
              .status(503)
              .json({ message: "Service temporarily unavailable" });
          }

          user = {
            id: authenticatedReq.user.id,
            email: authenticatedReq.user.email,
            firstName: authenticatedReq.user.firstName,
            lastName: authenticatedReq.user.lastName,
            profileImageUrl: authenticatedReq.user.profileImageUrl,
            authProvider: authenticatedReq.user.authProvider,
            hasNotifiedTeam: authenticatedReq.user.hasNotifiedTeam ?? false,
            readNotificationIds:
              authenticatedReq.user.readNotificationIds ?? [],
            createdAt: authenticatedReq.user.createdAt ?? new Date(),
          };
        }

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        res.json(user);
      } catch (error: unknown) {
        log.error(
          { err: error, userId: authenticatedReq.user?.id },
          "Error fetching user",
        );
        res
          .status(500)
          .json({ message: "Failed to fetch user profile - please try again" });
      }
    },
  );

  // Update user preferences
  app.patch(
    "/api/v1/user/preferences",
    csrfProtection,
    isAuthenticated,
    async (req: Request, res: Response) => {
      const authenticatedReq = req as AuthenticatedRequest;
      try {
        const userId = authenticatedReq.user.id;
        const { hasNotifiedTeam, readNotificationIds } =
          req.body as UserPreferencesUpdate;

        const updateData: Partial<{
          hasNotifiedTeam: boolean;
          readNotificationIds: string[];
        }> = {};
        if (typeof hasNotifiedTeam === "boolean")
          updateData.hasNotifiedTeam = hasNotifiedTeam;
        if (Array.isArray(readNotificationIds))
          updateData.readNotificationIds = readNotificationIds;

        if (Object.keys(updateData).length === 0) {
          return res.status(400).json({ message: "No preferences to update" });
        }

        const [updatedUser] = await db
          .update(users)
          .set(updateData)
          .where(eq(users.id, userId))
          .returning({
            id: users.id,
            hasNotifiedTeam: users.hasNotifiedTeam,
            readNotificationIds: users.readNotificationIds,
          });

        res.json(updatedUser);
      } catch (error: unknown) {
        log.error(
          { err: error, userId: authenticatedReq.user?.id },
          "Error updating preferences",
        );
        res.status(500).json({ message: "Failed to update preferences" });
      }
    },
  );

  // Update user profile
  app.patch(
    "/api/v1/user/profile",
    csrfProtection,
    isAuthenticated,
    async (req: Request, res: Response) => {
      const authenticatedReq = req as AuthenticatedRequest;
      try {
        const userId = authenticatedReq.user.id;
        const { firstName, lastName } = req.body as {
          firstName?: string;
          lastName?: string;
        };

        const [updatedUser] = await db
          .update(users)
          .set({
            firstName: firstName ?? null,
            lastName: lastName ?? null,
          })
          .where(eq(users.id, userId))
          .returning({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            profileImageUrl: users.profileImageUrl,
            authProvider: users.authProvider,
            createdAt: users.createdAt,
          });

        res.json(updatedUser);
      } catch (error: unknown) {
        log.error(
          { err: error, userId: authenticatedReq.user?.id },
          "Error updating profile",
        );
        res.status(500).json({ message: "Failed to update profile" });
      }
    },
  );

  // Change password
  app.post(
    "/api/v1/user/change-password",
    csrfProtection,
    isAuthenticated,
    validate({ body: changePasswordSchema }),
    async (req: Request, res: Response) => {
      const authenticatedReq = req as AuthenticatedRequest;
      try {
        const userId = authenticatedReq.user.id;
        const { currentPassword, newPassword } = req.body as {
          currentPassword: string;
          newPassword: string;
        };

        const validation = validatePasswordStrength(newPassword);
        if (!validation.valid) {
          return res.status(400).json({
            message: "New password does not meet security requirements",
            errors: validation.errors,
          });
        }

        const [user] = await db
          .select({ passwordHash: users.passwordHash })
          .from(users)
          .where(eq(users.id, userId));

        if (!user?.passwordHash) {
          return res
            .status(400)
            .json({ message: "Cannot change password for OAuth accounts" });
        }

        const isValid = await verifyPassword(
          currentPassword,
          user.passwordHash,
        );
        if (!isValid) {
          return res
            .status(401)
            .json({ message: "Current password is incorrect" });
        }

        const newPasswordHash = await hashPassword(newPassword);

        await db
          .update(users)
          .set({ passwordHash: newPasswordHash })
          .where(eq(users.id, userId));

        res.json({ message: "Password changed successfully" });
      } catch (error: unknown) {
        log.error(
          { err: error, userId: authenticatedReq.user?.id },
          "Error changing password",
        );
        res.status(500).json({ message: "Failed to change password" });
      }
    },
  );

  // Delete all user data
  app.delete(
    "/api/v1/user/data",
    csrfProtection,
    isAuthenticated,
    async (req: Request, res: Response) => {
      const authenticatedReq = req as AuthenticatedRequest;
      try {
        const userId = authenticatedReq.user.id;

        await db.transaction(async (tx) => {
          await context.eventBus.emitAsync("user.deleted", { id: userId, tx });
        });

        res.json({ message: "All data deleted successfully" });
      } catch (error: unknown) {
        log.error(
          { err: error, userId: authenticatedReq.user?.id },
          "Error deleting user data",
        );
        res.status(500).json({ message: "Failed to delete user data" });
      }
    },
  );

  // Delete account and all data
  app.delete(
    "/api/v1/user/account",
    csrfProtection,
    isAuthenticated,
    async (req: Request, res: Response) => {
      const authenticatedReq = req as AuthenticatedRequest;
      try {
        const userId = authenticatedReq.user.id;

        await db.transaction(async (tx) => {
          await context.eventBus.emitAsync("user.deleted", { id: userId, tx });
          await tx.delete(users).where(eq(users.id, userId));
        });

        req.logout(() => {
          res.json({ message: "Account deleted successfully" });
        });
      } catch (error: unknown) {
        log.error(
          { err: error, userId: authenticatedReq.user?.id },
          "Error deleting account",
        );
        res.status(500).json({ message: "Failed to delete account" });
      }
    },
  );
}
