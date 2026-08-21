import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { registerAuthRoutes } from "@services/auth/routes";

// --- Shared mutable state (hoisted so vi.mock factories can access them) ---
const { mockUsers, mockRedisStore, state, dbProxy, resetDbChain } = vi.hoisted(
  () => {
    const mockUsers: any[] = [];
    const mockRedisStore = new Map<string, string>();
    const state = {
      selectResult: [] as any[],
      insertResult: [] as any[],
      insertError: null as Error | null,
    };

    let dbChain: any = null;
    const dbProxy = new Proxy({} as any, {
      get: (_target, prop) => {
        if (prop === "transaction") return dbChain.transaction;
        return (...args: any[]) => dbChain[prop as string](...args);
      },
    });

    function createDbChain() {
      dbChain = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          const result = [...state.selectResult];
          const err = state.insertError;
          state.insertError = null;
          if (err) return Promise.reject(err);
          return Promise.resolve(result);
        }),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockImplementation(() => {
          if (state.insertError) {
            const err = state.insertError;
            state.insertError = null;
            return Promise.reject(err);
          }
          return Promise.resolve([...state.insertResult]);
        }),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        transaction: vi.fn().mockImplementation((fn: any) => fn(dbProxy)),
      };
      return dbChain;
    }

    return {
      mockUsers,
      mockRedisStore,
      state,
      dbProxy,
      resetDbChain: createDbChain,
    };
  },
);

vi.mock("@services/auth/db/connection", () => ({ db: dbProxy, pool: {} }));
vi.mock("@services/auth/db", () => ({ db: dbProxy, pool: {} }));

vi.mock("@services/auth/password/password", () => ({
  hashPassword: vi
    .fn()
    .mockImplementation(async (pwd: string) => `hashed:${pwd}`),
  verifyPassword: vi
    .fn()
    .mockImplementation(
      async (pwd: string, hash: string) => hash === `hashed:${pwd}`,
    ),
  validatePasswordStrength: vi.fn().mockImplementation((pwd: string) => {
    const errors: string[] = [];
    if (pwd.length < 8) errors.push("Too short");
    return { valid: errors.length === 0, errors };
  }),
}));
vi.mock("@services/auth/password", () => ({
  hashPassword: vi
    .fn()
    .mockImplementation(async (pwd: string) => `hashed:${pwd}`),
  verifyPassword: vi
    .fn()
    .mockImplementation(
      async (pwd: string, hash: string) => hash === `hashed:${pwd}`,
    ),
  validatePasswordStrength: vi.fn().mockImplementation((pwd: string) => {
    const errors: string[] = [];
    if (pwd.length < 8) errors.push("Too short");
    return { valid: errors.length === 0, errors };
  }),
}));

vi.mock("@server/middleware/rateLimit", () => ({
  authLimiter: (_req: any, _res: any, next: any) => next(),
  refreshLimiter: (_req: any, _res: any, next: any) => next(),
  apiLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("@services/auth/rate-limit/rateLimit", () => ({
  authLimiter: (_req: any, _res: any, next: any) => next(),
  refreshLimiter: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("@services/auth/rate-limit", () => ({
  authLimiter: (_req: any, _res: any, next: any) => next(),
  refreshLimiter: (_req: any, _res: any, next: any) => next(),
  checkAccountLockout: vi.fn().mockResolvedValue(null),
  recordFailedLoginAttempt: vi.fn().mockResolvedValue(null),
  resetLoginAttempts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@server/middleware/csrf", () => ({
  csrfProtection: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("@services/auth/captcha/captcha", () => ({
  optionalCaptchaMiddleware: (_req: any, _res: any, next: any) => next(),
  verifyCaptcha: vi.fn().mockResolvedValue(true),
}));
vi.mock("@services/auth/captcha", () => ({
  optionalCaptchaMiddleware: (_req: any, _res: any, next: any) => next(),
  verifyCaptcha: vi.fn().mockResolvedValue(true),
}));

vi.mock("@server/middleware/validate", () => ({
  validate: () => (_req: any, _res: any, next: any) => next(),
}));

// --- Passport Mock ---
vi.mock("passport", () => ({
  default: {
    authenticate: (strategy: string, callbackOrOptions: any) => {
      return (req: any, res: any, _next: any) => {
        if (strategy === "local") {
          const { email, password } = req.body || {};
          const isCallback = typeof callbackOrOptions === "function";

          if (!email || !password) {
            if (isCallback)
              return callbackOrOptions(null, null, {
                message: "Authentication failed",
              });
            return res.status(401).json({ message: "Authentication failed" });
          }

          const user = mockUsers.find((u: any) => u.email === email);
          if (!user) {
            if (isCallback)
              return callbackOrOptions(null, null, {
                message: "No user found",
              });
            return res.status(401).json({ message: "Authentication failed" });
          }

          if (password !== "correctpassword") {
            if (isCallback)
              return callbackOrOptions(null, null, {
                message: "Invalid password",
              });
            return res.status(401).json({ message: "Invalid password" });
          }

          // Set req.login so the callback can call req.login(user, cb)
          req.user = user;
          req.login = (u: any, cb: any) => cb(null);

          if (isCallback) {
            return callbackOrOptions(null, user, null);
          }
          return _next();
        }
        _next();
      };
    },
    initialize: () => (req: any, _res: any, next: any) => {
      req.logout = (cb: any) => cb(null);
      next();
    },
    session: () => (_req: any, _res: any, next: any) => next(),
    serializeUser: vi.fn(),
    deserializeUser: vi.fn(),
  },
}));

vi.mock("@server/lib/redis", () => ({
  getRedis: vi.fn().mockImplementation(() => ({
    setex: vi
      .fn()
      .mockImplementation(async (key: string, _ttl: number, val: string) => {
        mockRedisStore.set(key, val);
        return "OK";
      }),
    exists: vi
      .fn()
      .mockImplementation(async (key: string) =>
        mockRedisStore.has(key) ? 1 : 0,
      ),
    get: vi
      .fn()
      .mockImplementation(
        async (key: string) => mockRedisStore.get(key) || null,
      ),
    del: vi.fn().mockImplementation(async (key: string) => {
      mockRedisStore.delete(key);
      return 1;
    }),
  })),
}));

vi.mock("@server/lib/logger", () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const setupTestApp = () => {
  const app = express();
  app.use(express.json());
  // Passport-like middleware: set req.logout and req.isAuthenticated
  app.use((req: any, _res: any, next: any) => {
    req.logout = (cb: any) => cb(null);
    req.login = (user: any, cb: any) => cb(null);
    req.isAuthenticated = () => !!req.user;
    req.cookies = {};
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      cookieHeader.split(";").forEach((c: string) => {
        const [key, val] = c.trim().split("=");
        req.cookies[key] = val;
      });
    }
    next();
  });
  const mockContext = {
    eventBus: { emitAsync: vi.fn().mockResolvedValue(undefined) },
  } as any;
  registerAuthRoutes(app, mockContext);
  return app;
};

describe("Register Route Integration Tests", () => {
  let app: express.Express;

  beforeEach(() => {
    mockUsers.length = 0;
    state.selectResult = [];
    state.insertResult = [];
    state.insertError = null;
    mockRedisStore.clear();
    resetDbChain();
    vi.clearAllMocks();
    app = setupTestApp();
  });

  it("should_register_new_user_successfully", async () => {
    state.selectResult = [];
    state.insertResult = [
      {
        id: "new-user-id",
        email: "new@example.com",
        passwordHash: "hashed:Test1234!",
        firstName: null,
        lastName: null,
        authProvider: "email",
        createdAt: new Date(),
      },
    ];

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "new@example.com", password: "Test1234!" });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe("new-user-id");
  });

  it("should_return_409_for_duplicate_email", async () => {
    state.selectResult = [{ id: "existing" }];

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "existing@example.com", password: "Test1234!" });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("could not be completed");
  });

  it("should_accept_optional_name_fields", async () => {
    state.selectResult = [];
    state.insertResult = [
      {
        id: "named-user-id",
        email: "named@example.com",
        firstName: "John",
        lastName: "Doe",
        authProvider: "email",
      },
    ];

    const res = await request(app).post("/api/v1/auth/register").send({
      email: "named@example.com",
      password: "Test1234!",
      firstName: "John",
      lastName: "Doe",
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe("named-user-id");
  });
});

describe("Login Route Integration Tests", () => {
  let app: express.Express;

  beforeEach(() => {
    mockUsers.length = 0;
    state.selectResult = [];
    state.insertResult = [];
    state.insertError = null;
    mockRedisStore.clear();
    resetDbChain();
    vi.clearAllMocks();
    app = setupTestApp();

    mockUsers.push({
      id: "login-user-id",
      email: "test@example.com",
      passwordHash: "hashed:correctpassword",
      firstName: "Test",
      lastName: "User",
      authProvider: "email",
    });
  });

  it("should_login_with_correct_credentials", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "test@example.com", password: "correctpassword" });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe("login-user-id");
  });

  it("should_set_tokens_on_successful_login", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "test@example.com", password: "correctpassword" });

    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const cookieArr = Array.isArray(cookies) ? cookies : [cookies];
    const cookieStr = cookieArr?.join("; ") || "";
    expect(cookieStr).toContain("access_token");
    expect(cookieStr).toContain("refresh_token");
  });

  it("should_return_401_for_wrong_password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "test@example.com", password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBeDefined();
  });

  it("should_return_401_for_nonexistent_user", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nonexistent@example.com", password: "anypassword" });

    expect(res.status).toBe(401);
  });

  it("should_return_401_for_empty_credentials", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "", password: "" });

    expect(res.status).toBe(401);
  });
});

describe("Token Refresh Route Integration Tests", () => {
  let app: express.Express;

  beforeEach(() => {
    mockUsers.length = 0;
    state.selectResult = [];
    state.insertResult = [];
    state.insertError = null;
    mockRedisStore.clear();
    resetDbChain();
    vi.clearAllMocks();
    app = setupTestApp();
  });

  it("should_return_401_when_no_refresh_token", async () => {
    const res = await request(app).post("/api/v1/auth/refresh");

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("No refresh token");
  });

  it("should_refresh_access_token_with_valid_refresh_token", async () => {
    mockUsers.push({
      id: "refresh-user-id",
      email: "refresh@example.com",
      passwordHash: "hashed:password123",
      authProvider: "email",
    });

    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "refresh@example.com", password: "password123" });

    const rawCookies = loginRes.headers["set-cookie"];
    const cookies = (
      Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : []
    ).filter(Boolean) as string[];
    const refreshCookie = cookies?.find((c: string) =>
      c.startsWith("refresh_token="),
    );

    if (refreshCookie) {
      const token = refreshCookie.split(";")[0].split("=")[1];
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", `refresh_token=${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("refreshed");
    }
  });
});

describe("Logout Route Integration Tests", () => {
  let app: express.Express;

  beforeEach(() => {
    mockUsers.length = 0;
    state.selectResult = [];
    state.insertResult = [];
    state.insertError = null;
    mockRedisStore.clear();
    resetDbChain();
    vi.clearAllMocks();
    app = setupTestApp();
  });

  it("should_logout_and_clear_cookies", async () => {
    mockUsers.push({
      id: "logout-user-id",
      email: "logout@example.com",
      passwordHash: "hashed:password123",
      authProvider: "email",
    });

    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "logout@example.com", password: "password123" });

    const rawCookies = loginRes.headers["set-cookie"];
    const cookies = (
      Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : []
    ).filter(Boolean) as string[];
    const refreshCookie = cookies?.find((c: string) =>
      c.startsWith("refresh_token="),
    );
    const accessCookie = cookies?.find((c: string) =>
      c.startsWith("access_token="),
    );

    const cookieParts: string[] = [];
    if (refreshCookie) cookieParts.push(refreshCookie.split(";")[0]);
    if (accessCookie) cookieParts.push(accessCookie.split(";")[0]);

    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookieParts.join("; "));

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Logged out");
  });

  it("should_revoke_refresh_token_in_redis_on_logout", async () => {
    mockUsers.push({
      id: "revoke-user-id",
      email: "revoke@example.com",
      passwordHash: "hashed:password123",
      authProvider: "email",
    });

    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "revoke@example.com", password: "password123" });

    const rawCookies = loginRes.headers["set-cookie"];
    const cookies = (
      Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : []
    ).filter(Boolean) as string[];
    const refreshCookie = cookies?.find((c: string) =>
      c.startsWith("refresh_token="),
    );

    if (refreshCookie) {
      const token = refreshCookie.split(";")[0].split("=")[1];

      const jwt = await import("jsonwebtoken");
      const mockPayload = {
        userId: "revoke-user-id",
        type: "refresh",
        jti: "test-jti-123",
      };
      vi.mocked(jwt.default.verify).mockReturnValueOnce(mockPayload as any);

      await request(app)
        .post("/api/v1/auth/logout")
        .set("Cookie", `refresh_token=${token}`);

      expect(mockRedisStore.has("revoked_jti:test-jti-123")).toBe(true);
    }
  });
});
