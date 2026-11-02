import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import aiRoutes from "@services/ai/routes";

vi.mock("@services/ai/db/storage", () => ({
  getActiveKeyForProvider: vi.fn().mockResolvedValue(null),
  getApiKeyWithPlaintext: vi.fn().mockResolvedValue(null),
  getUserApiKeys: vi.fn().mockResolvedValue([]),
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
}));

// Authentication and CSRF have separate tests; this exercises the real AI adapter.
vi.mock("../../../server/auth", () => ({
  csrfProtect: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe("AI chat provider boundary", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_GENAI_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the editor request to OpenRouter with its own key, a free model, and the canvas tool", async () => {
    const upstream = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          "https://openrouter.ai/api/v1/chat/completions",
        );
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe("Bearer test-openrouter-key");
        const body = JSON.parse(String(init?.body));
        expect(body.model).toBe("openrouter/free");
        expect(body.messages).toEqual([
          { role: "user", content: "Add a server" },
        ]);
        expect(body.tools[0].function.name).toBe("edit_canvas");
        return new Response(
          JSON.stringify({
            id: "test-completion",
            object: "chat.completion",
            created: 1,
            model: "test-free-model",
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: { role: "assistant", content: "Done" },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );
    vi.stubGlobal("fetch", upstream);
    const app = express();
    app.use(express.json());
    app.use(
      "/api/v1/ai",
      aiRoutes({
        isAuthenticated: (req, _res, next) => {
          req.user = { id: "test-user" } as typeof req.user;
          next();
        },
      }),
    );
    const response = await request(app)
      .post("/api/v1/ai/chat")
      .send({
        provider: "gemini",
        model: "gemini-3.5-flash",
        stream: false,
        messages: [{ role: "user", content: "Add a server" }],
        tools: [
          {
            type: "function",
            function: { name: "edit_canvas", parameters: { type: "object" } },
          },
        ],
      });
    expect(response.status).toBe(200);
    expect(response.body.choices[0].message.content).toBe("Done");
    expect(upstream).toHaveBeenCalledOnce();
  });
  it("leaves room for a Gemini response and forwards a canvas tool call", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    const upstream = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain(
          "generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
        );
        const body = JSON.parse(String(init?.body));
        expect(body.generationConfig.maxOutputTokens).toBe(2048);
        expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe("low");
        expect(body.tools[0].function_declarations[0].name).toBe("edit_canvas");
        return Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "edit_canvas",
                      args: {
                        action: "add",
                        nodes: [{ id: "server", type: "server" }],
                      },
                    },
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
        });
      },
    );
    vi.stubGlobal("fetch", upstream);
    const app = express();
    app.use(express.json());
    app.use(
      "/api/v1/ai",
      aiRoutes({
        isAuthenticated: (req, _res, next) => {
          req.user = { id: "test-user" } as typeof req.user;
          next();
        },
      }),
    );
    const response = await request(app)
      .post("/api/v1/ai/chat")
      .send({
        provider: "gemini",
        messages: [{ role: "user", content: "Add a server" }],
        tools: [
          {
            type: "function",
            function: { name: "edit_canvas", parameters: { type: "object" } },
          },
        ],
      });
    expect(response.status).toBe(200);
    expect(response.body.choices[0].message.tool_calls[0].function).toEqual({
      name: "edit_canvas",
      arguments: JSON.stringify({
        action: "add",
        nodes: [{ id: "server", type: "server" }],
      }),
    });
    expect(upstream).toHaveBeenCalledOnce();
  });
  it("does not claim success or expose the key when OpenRouter rejects the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { message: "Invalid key", code: 401 } },
          { status: 401 },
        ),
      ),
    );
    const app = express();
    app.use(express.json());
    app.use(
      "/api/v1/ai",
      aiRoutes({
        isAuthenticated: (req, _res, next) => {
          req.user = { id: "test-user" } as typeof req.user;
          next();
        },
      }),
    );
    const response = await request(app)
      .post("/api/v1/ai/chat")
      .send({
        messages: [{ role: "user", content: "Hello" }],
      });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("PROVIDER_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("test-openrouter-key");
  });
});
