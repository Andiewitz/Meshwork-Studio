import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { createAIRoutes } from "@services/ai/routes/aiRoutes";
import type { AIRouteDependencies } from "@services/ai/dependencies";

vi.mock("@services/ai/db/storage", () => ({
  createConversation: vi.fn(),
  getConversations: vi.fn(),
  getConversationById: vi.fn(),
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
  createMessage: vi.fn(),
  getMessagesByConversationId: vi.fn(),
  createMemory: vi.fn(),
  getMemories: vi.fn(),
  searchMemories: vi.fn(),
  deleteMemory: vi.fn(),
  recallMemory: vi.fn(),
  getUserApiKeys: vi.fn().mockResolvedValue([]),
  getActiveKeyForProvider: vi.fn().mockResolvedValue(null),
  getApiKeyWithPlaintext: vi.fn().mockResolvedValue(null),
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
}));

import {
  createConversation,
  getConversations,
  getConversationById,
  updateConversation,
  deleteConversation,
  createMessage,
  getMessagesByConversationId,
  createMemory,
  getMemories,
  searchMemories,
  deleteMemory,
  recallMemory,
} from "@services/ai/db/storage";

const mockedCreateConversation = vi.mocked(createConversation);
const mockedGetConversations = vi.mocked(getConversations);
const mockedGetConversationById = vi.mocked(getConversationById);
const mockedUpdateConversation = vi.mocked(updateConversation);
const mockedDeleteConversation = vi.mocked(deleteConversation);
const mockedCreateMessage = vi.mocked(createMessage);
const mockedGetMessages = vi.mocked(getMessagesByConversationId);
const mockedCreateMemory = vi.mocked(createMemory);
const mockedGetMemories = vi.mocked(getMemories);
const mockedSearchMemories = vi.mocked(searchMemories);
const mockedDeleteMemory = vi.mocked(deleteMemory);
const mockedRecallMemory = vi.mocked(recallMemory);

vi.mock("../../../server/auth", () => ({
  csrfProtect: (_req: any, _res: any, next: any) => next(),
}));

const setupTestApp = () => {
  const app = express();
  app.use(express.json());

  const mockContext: AIRouteDependencies = {
    isAuthenticated: (req, res, next) => {
      if (req.headers["x-test-user-id"]) {
        req.user = { id: req.headers["x-test-user-id"] } as typeof req.user;
        next();
      } else {
        res.status(401).json({ message: "Not authenticated" });
      }
    },
  };

  const routes = createAIRoutes(mockContext);
  app.use("/api/v1/jenkos", routes);
  return app;
};

describe("Jenkos REST API Endpoints", () => {
  const app = setupTestApp();
  const userId = "user-test-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Conversations API", () => {
    it("lists conversations for authenticated user", async () => {
      mockedGetConversations.mockResolvedValue([
        {
          id: "conv-1",
          userId,
          workspaceId: "ws-1",
          scope: "workspace",
          title: "Microservices Design",
          context: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await request(app)
        .get("/api/v1/jenkos/conversations?workspaceId=ws-1")
        .set("x-test-user-id", userId);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe("Microservices Design");
      expect(mockedGetConversations).toHaveBeenCalledWith(userId, {
        workspaceId: "ws-1",
        scope: undefined,
      });
    });

    it("creates a new conversation thread", async () => {
      mockedCreateConversation.mockResolvedValue({
        id: "conv-new",
        userId,
        workspaceId: "ws-1",
        scope: "workspace",
        title: "Kafka Pipeline",
        context: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post("/api/v1/jenkos/conversations")
        .set("x-test-user-id", userId)
        .send({
          title: "Kafka Pipeline",
          workspaceId: "ws-1",
          scope: "workspace",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("conv-new");
      expect(res.body.title).toBe("Kafka Pipeline");
    });

    it("fetches messages for a conversation thread", async () => {
      mockedGetConversationById.mockResolvedValue({
        id: "conv-1",
        userId,
        workspaceId: "ws-1",
        scope: "workspace",
        title: "Architecture Chat",
        context: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockedGetMessages.mockResolvedValue([
        {
          id: "msg-1",
          conversationId: "conv-1",
          role: "user",
          content: "Add a database",
          toolCalls: null,
          toolResults: null,
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      const res = await request(app)
        .get("/api/v1/jenkos/conversations/conv-1/messages")
        .set("x-test-user-id", userId);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].content).toBe("Add a database");
    });

    it("posts a message to a conversation thread", async () => {
      mockedGetConversationById.mockResolvedValue({
        id: "conv-1",
        userId,
        workspaceId: null,
        scope: "global",
        title: "Global Chat",
        context: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockedCreateMessage.mockResolvedValue({
        id: "msg-2",
        conversationId: "conv-1",
        role: "assistant",
        content: "Added Redis cache",
        toolCalls: null,
        toolResults: null,
        metadata: {},
        createdAt: new Date(),
      });

      const res = await request(app)
        .post("/api/v1/jenkos/conversations/conv-1/messages")
        .set("x-test-user-id", userId)
        .send({
          role: "assistant",
          content: "Added Redis cache",
        });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe("Added Redis cache");
    });
  });

  describe("Memories API", () => {
    it("creates a new architectural memory", async () => {
      mockedCreateMemory.mockResolvedValue({
        id: "mem-1",
        userId,
        workspaceId: "ws-1",
        scope: "workspace",
        category: "architectural_decision",
        key: "Primary DB",
        content: "Use DynamoDB for single-digit millisecond latency",
        tags: ["dynamodb", "aws"],
        confidence: 1.0,
        sourceMessageId: null,
        lastRecalledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post("/api/v1/jenkos/memories")
        .set("x-test-user-id", userId)
        .send({
          workspaceId: "ws-1",
          category: "architectural_decision",
          key: "Primary DB",
          content: "Use DynamoDB for single-digit millisecond latency",
          tags: ["dynamodb", "aws"],
        });

      expect(res.status).toBe(201);
      expect(res.body.key).toBe("Primary DB");
    });

    it("searches memories by query term", async () => {
      mockedSearchMemories.mockResolvedValue([
        {
          id: "mem-1",
          userId,
          workspaceId: "ws-1",
          scope: "workspace",
          category: "architectural_decision",
          key: "Primary DB",
          content: "Use DynamoDB",
          tags: ["dynamodb"],
          confidence: 1.0,
          sourceMessageId: null,
          lastRecalledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await request(app)
        .get("/api/v1/jenkos/memories/search?q=DynamoDB")
        .set("x-test-user-id", userId);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockedSearchMemories).toHaveBeenCalledWith(userId, "DynamoDB", {
        workspaceId: undefined,
      });
    });

    it("recalls a memory and touches lastRecalledAt", async () => {
      mockedRecallMemory.mockResolvedValue({
        id: "mem-1",
        userId,
        workspaceId: "ws-1",
        scope: "workspace",
        category: "architectural_decision",
        key: "Primary DB",
        content: "Use DynamoDB",
        tags: ["dynamodb"],
        confidence: 1.0,
        sourceMessageId: null,
        lastRecalledAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post("/api/v1/jenkos/memories/mem-1/recall")
        .set("x-test-user-id", userId);

      expect(res.status).toBe(200);
      expect(mockedRecallMemory).toHaveBeenCalledWith("mem-1", userId);
    });

    it("deletes a memory", async () => {
      mockedDeleteMemory.mockResolvedValue(true);

      const res = await request(app)
        .delete("/api/v1/jenkos/memories/mem-1")
        .set("x-test-user-id", userId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockedDeleteMemory).toHaveBeenCalledWith("mem-1", userId);
    });
  });
});
