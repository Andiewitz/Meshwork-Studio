import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { registerAuthRoutes } from "@server/modules/auth/routes";

// Mock DB, password, rateLimit, csrf, and captcha modules so they don't block
const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@services/auth/db/connection", () => ({ db: mockDb, pool: {} }));
vi.mock("@services/auth/db", () => ({ db: mockDb, pool: {} }));

vi.mock("@services/auth/password/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed"),
  verifyPassword: vi.fn().mockResolvedValue(true),
  validatePasswordStrength: vi
    .fn()
    .mockReturnValue({ valid: true, errors: [] }),
}));
vi.mock("@services/auth/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed"),
  verifyPassword: vi.fn().mockResolvedValue(true),
  validatePasswordStrength: vi
    .fn()
    .mockReturnValue({ valid: true, errors: [] }),
}));

vi.mock("@server/middleware/rateLimit", () => ({
  authLimiter: (req: any, res: any, next: any) => next(),
  refreshLimiter: (req: any, res: any, next: any) => next(),
  apiLimiter: (req: any, res: any, next: any) => next(),
}));

vi.mock("@services/auth/rate-limit/rateLimit", () => ({
  authLimiter: (req: any, res: any, next: any) => next(),
  refreshLimiter: (req: any, res: any, next: any) => next(),
}));
vi.mock("@services/auth/rate-limit", () => ({
  authLimiter: (req: any, res: any, next: any) => next(),
  refreshLimiter: (req: any, res: any, next: any) => next(),
}));

vi.mock("@server/middleware/csrf", () => ({
  csrfProtection: (req: any, res: any, next: any) => next(),
}));

vi.mock("@services/auth/captcha/captcha", () => ({
  optionalCaptchaMiddleware: (req: any, res: any, next: any) => next(),
}));
vi.mock("@services/auth/captcha", () => ({
  optionalCaptchaMiddleware: (req: any, res: any, next: any) => next(),
}));

// Mock Passport's authentication logic
let mockAuthenticateBehavior = "success";
vi.mock("passport", () => {
  return {
    default: {
      authenticate: (strategy: string, options: any) => {
        return (req: any, res: any, next: any) => {
          if (strategy === "google") {
            if (req.path === "/api/v1/auth/google/callback") {
              // This is the callback handler
              if (mockAuthenticateBehavior === "failure") {
                // Manually call the callback with an error
                return typeof options === "function"
                  ? options(new Error("Mock failure"), null, null)
                  : res.redirect("/?auth=login&error=google");
              }
              // Simulate login
              req.user = { id: "google-user-id", email: "google@example.com" };
              req.login = (user: any, cb: any) => cb(null);

              // If options are provided (old way)
              if (options?.successRedirect) {
                return res.redirect(options.successRedirect);
              }

              // If custom callback is provided (new way)
              if (typeof options === "function") {
                return options(null, req.user, null);
              }
            } else {
              // This is the initial auth redirection
              return res.redirect(
                "https://accounts.google.com/o/oauth2/v2/auth?client_id=mock",
              );
            }
          }
          next();
        };
      },
      initialize: () => (req: any, res: any, next: any) => next(),
      session: () => (req: any, res: any, next: any) => next(),
      serializeUser: vi.fn(),
      deserializeUser: vi.fn(),
      use: vi.fn(),
    },
  };
});

const setupTestApp = () => {
  const app = express();
  app.use(express.json());
  // Provide minimal mock context for registerAuthRoutes
  const mockContext = {
    eventBus: { emitAsync: vi.fn().mockResolvedValue(undefined) },
  } as any;
  registerAuthRoutes(app, mockContext);
  return app;
};

describe("OAuth Routes Integration Tests", () => {
  let app: express.Express;

  beforeEach(() => {
    app = setupTestApp();
    vi.clearAllMocks();
    mockAuthenticateBehavior = "success";
  });

  describe("GET /api/v1/auth/google", () => {
    it("should redirect to Google login authorization page when configured", async () => {
      const res = await request(app).get("/api/v1/auth/google");
      expect(res.status).toBe(302);
      expect(res.header.location).toContain("accounts.google.com");
    });

    it("should redirect to login with error when OAuth is not configured", async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      const res = await request(app).get("/api/v1/auth/google");
      expect(res.status).toBe(302);
      expect(res.header.location).toBe(
        "/?auth=login&error=google_not_configured",
      );

      process.env.NODE_ENV = origEnv;
    });
  });

  describe("GET /api/auth/google/callback", () => {
    it("should redirect to root on successful authentication", async () => {
      mockAuthenticateBehavior = "success";
      const res = await request(app).get("/api/v1/auth/google/callback");
      expect(res.status).toBe(302);
      expect(res.header.location).toBe("/");
    });

    it("should redirect to login with error parameter on failed authentication", async () => {
      mockAuthenticateBehavior = "failure";
      const res = await request(app).get("/api/v1/auth/google/callback");
      expect(res.status).toBe(302);
      expect(res.header.location).toBe("/?auth=login&error=google");
    });
  });
});
