import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import aiRoutes from "@services/ai/routes";

const { mockGeminiCompletion } = vi.hoisted(() => ({
  mockGeminiCompletion: vi.fn(),
}));

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

vi.mock("@services/ai/providers/gemini", () => ({
  createGeminiChatCompletion: mockGeminiCompletion,
  streamGeminiChatCompletion: vi.fn(),
}));

vi.mock("../../../server/auth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (req.headers["x-test-user-id"]) {
      req.user = { id: req.headers["x-test-user-id"] };
      next();
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  },
  optionalAuth: (req: any, _res: any, next: any) => {
    if (req.headers["x-test-user-id"])
      req.user = { id: req.headers["x-test-user-id"] };
    next();
  },
  csrfProtect: (_req: any, _res: any, next: any) => next(),
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
  let originalOpenrouterKey: string | undefined;
  let originalGeminiKey: string | undefined;
  let originalGoogleKey: string | undefined;

  beforeEach(() => {
    app = setupTestApp();
    vi.clearAllMocks();
    originalOpenrouterKey = process.env.OPENROUTER_API_KEY;
    originalGeminiKey = process.env.GEMINI_API_KEY;
    originalGoogleKey = process.env.GOOGLE_GENAI_API_KEY;
  });

  afterEach(() => {
    if (originalOpenrouterKey !== undefined) {
      process.env.OPENROUTER_API_KEY = originalOpenrouterKey;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }

    if (originalGeminiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }

    if (originalGoogleKey !== undefined) {
      process.env.GOOGLE_GENAI_API_KEY = originalGoogleKey;
    } else {
      delete process.env.GOOGLE_GENAI_API_KEY;
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
      // The provider adapter is mocked: this checks resolution and routing
      // without contacting Gemini or consuming provider quota.
      process.env.GEMINI_API_KEY = "sk-gemini-test-key";
      mockGeminiCompletion.mockResolvedValue({
        choices: [
          {
            message: { role: "assistant", content: "Hello from Gemini" },
          },
        ],
      });

      const res = await request(app)
        .post("/api/v1/ai/chat")
        .set("x-test-user-id", "1")
        .send({
          messages: [{ role: "user", content: "Hello" }],
        });

      expect(res.status).toBe(200);
      expect(res.body.choices[0].message.content).toBe("Hello from Gemini");
      expect(mockGeminiCompletion).toHaveBeenCalledOnce();
    });
  });

  describe("POST /api/ai/suggestions", () => {
    it("rejects oversized canvases before invoking an AI provider", async () => {
      const res = await request(app)
        .post("/api/v1/ai/suggestions")
        .set("x-test-user-id", "1")
        .send({
          canvas: {
            nodes: Array.from({ length: 101 }, (_, index) => ({
              id: `node-${index}`,
            })),
            edges: [],
          },
        });

      expect(res.status).toBe(413);
      expect(res.body.message).toBe("Canvas is too large for AI suggestions");
    });

    it("should return fallback suggestions if resolver cannot resolve", async () => {
      // Remove ENV variable so fallback is not configured
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_GENAI_API_KEY;
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
