import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
// We use relative or @server imports properly now
import { registerWorkspaceRoutes } from "@server/modules/workspace/routes";

// Mock dependencies
const mockGetWorkspace = vi.fn();
const mockUpdateWorkspace = vi.fn();

// We mock the storage module directly
vi.mock("@services/workspace/db/storage", () => ({
  workspaceStorage: {
    getWorkspace: (...args: any[]) => mockGetWorkspace(...args),
    updateWorkspace: (...args: any[]) => mockUpdateWorkspace(...args),
  },
  WorkspaceDatabaseStorage: vi.fn(),
}));

const mockGetWorkspaceRole = vi.fn();
vi.mock("@services/team/db/storage", () => ({
  teamStorage: {
    getWorkspaceRole: (...args: any[]) => mockGetWorkspaceRole(...args),
    canAccessWorkspace: (...args: any[]) => vi.fn()(...args),
  },
  TeamDatabaseStorage: vi.fn(),
}));

// We mock AuthModule for middleware
vi.mock("@services/auth", () => ({
  AuthModule: {
    middleware: {
      isAuthenticated: (req: any, res: any, next: any) => {
        // We inject a mock user dynamically for testing IDOR
        if (req.headers["x-test-user-id"]) {
          req.user = { id: req.headers["x-test-user-id"] };
          next();
        } else {
          res.status(401).json({ message: "Not authenticated" });
        }
      },
    },
  },
  AuthService: {
    middleware: {
      isAuthenticated: (req: any, res: any, next: any) => {
        if (req.headers["x-test-user-id"]) {
          req.user = { id: req.headers["x-test-user-id"] };
          next();
        } else {
          res.status(401).json({ message: "Not authenticated" });
        }
      },
    },
  },
}));

// Mock CSRF middleware since we don't need real CSRF for route tests
vi.mock("@server/middleware/csrf", () => ({
  csrfProtection: (req: any, res: any, next: any) => next(),
}));

// Mock rate limiter
vi.mock("@server/modules/rate-limit", () => ({
  apiLimiter: (req: any, res: any, next: any) => next(),
  authLimiter: (req: any, res: any, next: any) => next(),
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
        if (key === "teamStorage") {
          return {
            getWorkspaceRole: mockGetWorkspaceRole,
            canAccessWorkspace: vi.fn(),
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

  registerWorkspaceRoutes(app, mockContext);
  return app;
};

describe("Workspace Routes Integration Tests (IDOR & Zod)", () => {
  let app: express.Express;

  beforeEach(() => {
    app = setupTestApp();
    vi.clearAllMocks();
  });

  describe("PUT /api/workspaces/:id (Updating a Workspace)", () => {
    it("should return 403 Forbidden if a User attempts to modify another User s workspace (IDOR)", async () => {
      // Setup the mock database to return a workspace owned by "user_B"
      mockGetWorkspace.mockResolvedValue({
        id: 1,
        title: "Target Workspace",
        userId: "user_B",
      });

      // Role is null because they don't have access
      mockGetWorkspaceRole.mockResolvedValue(null);

      // Simulating a request coming from "user_A"
      const res = await request(app)
        .put("/api/v1/workspaces/1")
        .set("x-test-user-id", "user_A")
        .send({ title: "Hacked Title" });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("Forbidden");
      expect(mockUpdateWorkspace).not.toHaveBeenCalled();
    });

    it("should return 404 Not Found if workspace doesn't exist", async () => {
      mockGetWorkspace.mockResolvedValue(null);

      const res = await request(app)
        .put("/api/v1/workspaces/999")
        .set("x-test-user-id", "user_A")
        .send({ title: "Hello" });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Not found");
    });

    it("should return 400 Bad Request if Zod validation fails (Injection Protection)", async () => {
      mockGetWorkspace.mockResolvedValue({
        id: 1,
        title: "My Workspace",
        userId: "user_A",
      });
      mockGetWorkspaceRole.mockResolvedValue("workspace-owner");

      // Sending a title that is longer than 16 chars (violating schema limits)
      // or attempting to inject weird fields.
      const res = await request(app)
        .put("/api/v1/workspaces/1")
        .set("x-test-user-id", "user_A")
        .send({ title: "ThisTitleIsWayTooLongForTheDatabaseLimit" });

      expect(res.status).toBe(400);
      // It should throw a Zod error message instead of crashing
      expect(res.body.message).toContain("Title must be 16");
      expect(mockUpdateWorkspace).not.toHaveBeenCalled();
    });

    it("should successfully update workspace if user is owner and payload is valid", async () => {
      mockGetWorkspace.mockResolvedValue({
        id: 1,
        title: "Old Title",
        userId: "user_A",
      });
      mockGetWorkspaceRole.mockResolvedValue("workspace-owner");

      mockUpdateWorkspace.mockResolvedValue({
        id: 1,
        title: "New Title",
        userId: "user_A",
      });

      const res = await request(app)
        .put("/api/v1/workspaces/1")
        .set("x-test-user-id", "user_A")
        .send({ title: "New Title" });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("New Title");
      expect(mockUpdateWorkspace).toHaveBeenCalledWith(1, {
        title: "New Title",
      });
    });

    it("should successfully toggle favorite status if user is owner", async () => {
      mockGetWorkspace.mockResolvedValue({
        id: 1,
        title: "My Workspace",
        userId: "user_A",
        isFavorite: false,
      });
      mockGetWorkspaceRole.mockResolvedValue("workspace-owner");

      mockUpdateWorkspace.mockResolvedValue({
        id: 1,
        title: "My Workspace",
        userId: "user_A",
        isFavorite: true,
      });

      const res = await request(app)
        .put("/api/v1/workspaces/1")
        .set("x-test-user-id", "user_A")
        .send({ isFavorite: true });

      expect(res.status).toBe(200);
      expect(res.body.isFavorite).toBe(true);
      expect(mockUpdateWorkspace).toHaveBeenCalledWith(1, { isFavorite: true });
    });
  });
});
