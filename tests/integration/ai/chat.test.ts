import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import aiRoutes from "@server/modules/ai/routes";

// Mock DB calls — by default return null/empty to simulate no BYOK keys
vi.mock("@services/ai/db/storage", () => ({
  getApiKeyWithPlaintext: vi.fn().mockResolvedValue(null),
  getActiveKeyForProvider: vi.fn().mockResolvedValue(null),
  getUserApiKeys: vi.fn().mockResolvedValue([]),
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
}));

vi.mock("@services/ai/db", () => ({
  getApiKeyWithPlaintext: vi.fn().mockResolvedValue(null),
  getActiveKeyForProvider: vi.fn().mockResolvedValue(null),
  getUserApiKeys: vi.fn().mockResolvedValue([]),
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
}));

const setupTestApp = () => {
  const app = express();
  app.use(express.json());

  const mockContext = {
    registry: {
      get: (key: string) => {
        if (key === "isAuthenticated") {
          return (req: any, res: any, next: any) => {
            if (req.headers["x-test-user-id"]) {
              req.user = { id: req.headers["x-test-user-id"] };
              next();
            } else {
              res.status(401).json({ message: "Not authenticated" });
            }
          };
        }
        return null;
      },
    },
    eventBus: {
      emit: vi.fn(),
      emitAsync: vi.fn(),
    },
  } as any;

  app.use("/api/v1/ai", aiRoutes(mockContext));
  return app;
};

describe("AI Chat Route Integration Tests", () => {
  let app: express.Express;
  let originalKey: string | undefined;

  beforeEach(() => {
    app = setupTestApp();
    vi.clearAllMocks();
    originalKey = process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.OPENROUTER_API_KEY = originalKey;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  describe("POST /api/ai/chat", () => {
    it("should return 400 if messages array is missing", async () => {
      const res = await request(app)
        .post("/api/v1/ai/chat")
        .set("x-test-user-id", "1")
        .send({ provider: "openrouter" }); // missing messages

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("messages array is required");
    });

    it("should return 503 if OPENROUTER_API_KEY is not set (fallback not configured)", async () => {
      delete process.env.OPENROUTER_API_KEY;

      const res = await request(app)
        .post("/api/v1/ai/chat")
        .set("x-test-user-id", "1")
        .send({
          // No provider/model → triggers free-tier fallback
          messages: [{ role: "user", content: "Hello" }],
        });

      expect(res.status).toBe(503);
      expect(res.body.code).toBe("FALLBACK_NOT_CONFIGURED");
    });

    it("should return 404 if user requests a BYOK provider with no stored key", async () => {
      const res = await request(app)
        .post("/api/v1/ai/chat")
        .set("x-test-user-id", "1")
        .send({
          provider: "anthropic",
          model: "claude-3-opus",
          messages: [{ role: "user", content: "Hello" }],
        });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NO_ACTIVE_KEY");
      expect(res.body.message).toContain("anthropic");
    });

    it("should accept requests without provider/model (free-tier path)", async () => {
      // The free-tier path resolves via env var. The actual API call will fail
      // without a real key, but we should NOT get 404 from the resolver.
      process.env.GEMINI_API_KEY = "sk-gemini-test-key";

      const res = await request(app)
        .post("/api/v1/ai/chat")
        .set("x-test-user-id", "1")
        .send({
          messages: [{ role: "user", content: "Hello" }],
        });

      // Should NOT be 404 (no key found)
      expect(res.status).not.toBe(404);
    });

    it("LIVE TEST: should get a real response from OpenRouter if ENV key is set", async () => {
      // Skip if no real API key is set in environment
      if (
        !process.env.OPENROUTER_API_KEY ||
        process.env.OPENROUTER_API_KEY === "your-openrouter-api-key"
      ) {
        console.log(
          "Skipping live OpenRouter test because OPENROUTER_API_KEY is not set",
        );
        return;
      }

      const res = await request(app)
        .post("/api/v1/ai/chat")
        .set("x-test-user-id", "1")
        .send({
          // Omit provider/model — let resolver use defaults
          messages: [{ role: "user", content: 'Say the word "Meshwork"' }],
          stream: false,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("choices");
      expect(res.body.choices.length).toBeGreaterThan(0);

      const content = res.body.choices[0].message.content;
      console.log("Live AI Response:", content);

      expect(typeof content).toBe("string");
      expect(content.toLowerCase()).toContain("meshwork");
    }, 15000); // 15s timeout for real API call
  });

  describe("POST /api/ai/suggestions", () => {
    it("should return fallback suggestions if resolver cannot resolve", async () => {
      // Remove ENV variable so fallback is not configured
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENROUTER_API_KEY;

      const res = await request(app)
        .post("/api/v1/ai/suggestions")
        .set("x-test-user-id", "1")
        .send({
          canvas: { nodes: [], edges: [] },
        });

      // Suggestions route catches ProviderResolutionError and returns static suggestions
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(4);
      expect(res.body[0]).toBe(
        "Design a scalable Kubernetes microservices architecture",
      );
    });
  });
});
