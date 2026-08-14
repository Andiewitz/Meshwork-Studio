import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module before importing storage
vi.mock("@services/workspace/db/connection", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  pool: {},
}));

vi.mock("@services/workspace/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  pool: {},
}));

import { WorkspaceDatabaseStorage } from "@services/workspace/db/storage";
import { db } from "@services/workspace/db/connection";

describe("WorkspaceDatabaseStorage (Unit)", () => {
  let storage: WorkspaceDatabaseStorage;

  beforeEach(() => {
    storage = new WorkspaceDatabaseStorage();
    vi.clearAllMocks();
  });

  describe("updateWorkspace", () => {
    it("should call db.update with the correct id and updates", async () => {
      const mockWorkspace = {
        id: 1,
        title: "Updated Title",
        type: "system",
        icon: "box",
        isFavorite: true,
        userId: "user-123",
        collectionId: null,
        createdAt: new Date(),
      };

      const returningMock = vi.fn().mockResolvedValue([mockWorkspace]);
      const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
      const setMock = vi.fn().mockReturnValue({ where: whereMock });
      (db.update as any).mockReturnValue({ set: setMock });

      const result = await storage.updateWorkspace(1, { isFavorite: true });

      expect(db.update).toHaveBeenCalled();
      expect(setMock).toHaveBeenCalledWith({
        isFavorite: true,
        updatedAt: expect.any(Date),
      });
      expect(result).toEqual(mockWorkspace);
      expect(result.isFavorite).toBe(true);
    });

    it("should toggle isFavorite from true to false", async () => {
      const mockWorkspace = {
        id: 2,
        title: "My Project",
        type: "system",
        icon: "server",
        isFavorite: false,
        userId: "user-123",
        collectionId: null,
        createdAt: new Date(),
      };

      const returningMock = vi.fn().mockResolvedValue([mockWorkspace]);
      const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
      const setMock = vi.fn().mockReturnValue({ where: whereMock });
      (db.update as any).mockReturnValue({ set: setMock });

      const result = await storage.updateWorkspace(2, { isFavorite: false });

      expect(setMock).toHaveBeenCalledWith({
        isFavorite: false,
        updatedAt: expect.any(Date),
      });
      expect(result.isFavorite).toBe(false);
    });

    it("should update title without affecting isFavorite", async () => {
      const mockWorkspace = {
        id: 3,
        title: "New Name",
        type: "system",
        icon: "box",
        isFavorite: true,
        userId: "user-123",
        collectionId: null,
        createdAt: new Date(),
      };

      const returningMock = vi.fn().mockResolvedValue([mockWorkspace]);
      const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
      const setMock = vi.fn().mockReturnValue({ where: whereMock });
      (db.update as any).mockReturnValue({ set: setMock });

      const result = await storage.updateWorkspace(3, { title: "New Name" });

      expect(setMock).toHaveBeenCalledWith({
        title: "New Name",
        updatedAt: expect.any(Date),
      });
      expect(result.isFavorite).toBe(true); // preserved
    });
  });

  describe("duplicateWorkspace", () => {
    it("should create a copy with a new title", async () => {
      const original = {
        id: 1,
        title: "Original",
        type: "system",
        icon: "cpu",
        isFavorite: true,
        userId: "user-1",
        collectionId: null,
        createdAt: new Date(),
      };

      const duplicated = {
        ...original,
        id: 2,
        title: "Original (Copy)",
        isFavorite: false,
      };

      // Mock getWorkspace (select().from().where() must return iterable)
      const selectWhere = vi.fn().mockResolvedValue([original]);
      const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
      (db.select as any).mockReturnValue({ from: selectFrom });

      // Mock insert
      const insertReturning = vi.fn().mockResolvedValue([duplicated]);
      const insertValues = vi
        .fn()
        .mockReturnValue({ returning: insertReturning });
      (db.insert as any).mockReturnValue({ values: insertValues });

      const result = await storage.duplicateWorkspace(1, "Original (Copy)");

      expect(result.title).toBe("Original (Copy)");
      expect(result.id).not.toBe(original.id);
    });
  });
});
