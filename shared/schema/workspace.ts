import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  userId: text("user_id"),
  parentId: integer("parent_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull().default("system"),
  icon: text("icon").default("box"),
  isFavorite: boolean("is_favorite").default(false),
  userId: text("user_id"),
  collectionId: integer("collection_id").references(() => collections.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  description: text("description"),
  author: text("author"),
  aiContext: text("ai_context"),
  groups: jsonb("groups")
    .$type<string[]>()
    .default(sql`'[]'::jsonb`),
  tags: jsonb("tags")
    .$type<string[]>()
    .default(sql`'[]'::jsonb`),
});

export const insertCollectionSchema = createInsertSchema(collections).omit({
  id: true,
  createdAt: true,
});

const titleRegex = /^[a-zA-Z0-9\-_\s]+$/;
const hasEmojiRegex =
  /(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|[\u3297\u3299][\ufe0f]?|[\u303d\u3030\u2b55\u2b50\u2b1c\u2b1b\u23f3\u23f0\u231b\u231a\u21aa\u2199\u2198\u2197\u2196\u2195\u2194\u2139\u2122\u2049\u203c\u3030]|[\u2600-\u26FF][\ufe0f]?|[\u2700-\u27BF][\ufe0f]?)/;

export const insertWorkspaceSchema = createInsertSchema(workspaces, {
  title: z
    .preprocess(
      (val) => {
        if (val === undefined || val === null) return "Untitled";
        if (typeof val === "string" && val.trim() === "") return "Untitled";
        return val;
      },
      z
        .string()
        .max(16, "Title must be 16 characters or less")
        .refine((val) => !hasEmojiRegex.test(val), {
          message: "Title cannot contain emojis",
        })
        .refine((val) => titleRegex.test(val), {
          message:
            "Title can only contain letters, numbers, spaces, hyphens, and underscores",
        }),
    )
    .default("Untitled"),
  groups: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
}).omit({ id: true, createdAt: true });

export type Collection = typeof collections.$inferSelect;
export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;

export type CreateWorkspaceRequest = InsertWorkspace;
export type UpdateWorkspaceRequest = Partial<InsertWorkspace>;
export type WorkspaceResponse = Workspace;
