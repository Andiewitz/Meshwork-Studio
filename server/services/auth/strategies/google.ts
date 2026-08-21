import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { authStorage } from "../db/storage";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("auth-google");

/**
 * Create and configure Google OAuth 2.0 strategy
 */
export function createGoogleStrategy(): GoogleStrategy | null {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL =
    process.env.GOOGLE_CALLBACK_URL || "/api/v1/auth/google/callback";

  if (!clientID || !clientSecret) {
    log.warn(
      "Google OAuth credentials not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing)",
    );
    return null;
  }

  return new GoogleStrategy(
    {
      clientID,
      clientSecret,
      callbackURL,
      scope: ["profile", "email"],
      state: true,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          log.warn("Google OAuth callback: no email in profile");
          return done(new Error("No email provided by Google"), false);
        }

        const firstName = profile.name?.givenName || profile.displayName || "";
        const lastName = profile.name?.familyName || "";
        const profileImageUrl = profile.photos?.[0]?.value || "";

        // Upsert user in database
        const user = await authStorage.upsertUser({
          id: profile.id,
          email,
          firstName,
          lastName,
          profileImageUrl,
          authProvider: "google",
        });

        log.info(
          { email, userId: user.id },
          "Google OAuth authentication successful",
        );
        return done(null, {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          authProvider: user.authProvider,
        } as Express.User);
      } catch (err) {
        log.error({ err }, "Google OAuth strategy error");
        return done(err, false);
      }
    },
  );
}
