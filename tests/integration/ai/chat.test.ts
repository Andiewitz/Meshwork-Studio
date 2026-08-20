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

    it("LIVE TEST: should get a real response from Gemini if GEMINI_API_KEY is set", async () => {
      const apiKey =
        process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;

      if (!apiKey || apiKey === "your-gemini-api-key") {
        console.log("Skipping live Gemini test: GEMINI_API_KEY not provided");
        return;
      }

      const res = await request(app)
        .post("/api/v1/ai/chat")
        .set("x-test-user-id", "1")
        .send({
          provider: "gemini",
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: 'Say "Meshwork Online"' }],
          stream: false,
        });

      if (res.status === 429) {
        console.warn("External Gemini API rate limit hit in test run");
        expect(res.status).toBe(429);
        return;
      }

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("choices");
      expect(res.body.choices.length).toBeGreaterThan(0);

      const content = res.body.choices[0].message.content;
      expect(typeof content).toBe("string");
      expect(content.toLowerCase()).toContain("meshwork");
    }, 25000);

    it("LIVE TEST: Mosh should generate valid architecture nodes and edges with Gemini", async () => {
      const apiKey =
        process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;

      if (!apiKey || apiKey === "your-gemini-api-key") {
        console.log(
          "Skipping live Mosh architecture test: GEMINI_API_KEY not provided",
        );
        return;
      }

      const prompt = `You are Mosh, the expert cloud architecture co-pilot for Meshwork Studio.
Design a 3-tier architecture with a React App, API Gateway, Node.js Backend, PostgreSQL Database, and Redis Cache.
Return ONLY valid JSON within a \`\`\`json markdown block with 'nodes' and 'edges'.`;

      const res = await request(app)
        .post("/api/v1/ai/chat")
        .set("x-test-user-id", "1")
        .send({
          provider: "gemini",
          model: "gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "You are Mosh, the cloud architecture co-pilot.",
            },
            { role: "user", content: prompt },
          ],
          stream: false,
        });

      if (res.status === 429) {
        console.warn("External Gemini API rate limit hit in test run");
        expect(res.status).toBe(429);
        return;
      }

      expect(res.status).toBe(200);
      expect(res.body.choices?.length).toBeGreaterThan(0);

      const rawContent = res.body.choices[0].message.content;
      expect(rawContent).toBeDefined();

      const jsonMatch = /```(?:json)?\n([\s\S]*?)\n```/.exec(rawContent);
      expect(jsonMatch).not.toBeNull();

      const parsed = JSON.parse(jsonMatch![1]);
      expect(parsed).toHaveProperty("nodes");
      expect(parsed).toHaveProperty("edges");
      expect(Array.isArray(parsed.nodes)).toBe(true);
      expect(Array.isArray(parsed.edges)).toBe(true);
      expect(parsed.nodes.length).toBeGreaterThanOrEqual(3);

      // Verify node types or labels contain core expected services
      const labelsAndTypes = parsed.nodes
        .map((n: any) =>
          `${n.type || ""} ${n.label || ""} ${n.data?.label || ""}`.toLowerCase(),
        )
        .join(" ");

      expect(labelsAndTypes).toMatch(/database|postgres|sql/i);
    }, 30000);
  });

  describe("POST /api/ai/suggestions", () => {
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

    it("should return suggestions when GEMINI_API_KEY is configured", async () => {
      const apiKey =
        process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;

      if (!apiKey) {
        console.log("Skipping suggestions test: GEMINI_API_KEY not configured");
        return;
      }

      const res = await request(app)
        .post("/api/v1/ai/suggestions")
        .set("x-test-user-id", "1")
        .send({
          canvas: {
            nodes: [
              { id: "node-1", type: "gateway", data: { label: "API Gateway" } },
              { id: "node-2", type: "database", data: { label: "Postgres" } },
            ],
            edges: [],
          },
        });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    }, 20000);
  });
});
