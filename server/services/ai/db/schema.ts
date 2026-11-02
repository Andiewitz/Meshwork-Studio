import {
  pgTable,
  text,
  timestamp,
  varchar,
  index,
  uniqueIndex,
  boolean,
  jsonb,
  real,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const userApiKeys = pgTable(
  "user_api_keys",
  {
    id: varchar("id", { length: 128 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id", { length: 128 }).notNull(), // plain col: users live in auth_db
    provider: varchar("provider", { length: 32 }).notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyHint: varchar("key_hint", { length: 10 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("IDX_user_api_keys_user_id").on(table.userId),
    index("IDX_user_api_keys_provider").on(table.provider),
    uniqueIndex("idx_user_api_keys_one_active_per_provider")
      .on(table.userId, table.provider)
      .where(sql`is_active = true`),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: varchar("id", { length: 128 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id", { length: 128 }).notNull(),
    workspaceId: varchar("workspace_id", { length: 128 }),
    scope: varchar("scope", { length: 32 }).notNull().default("workspace"), // 'workspace' | 'global' | 'meshlabs' | 'search'
    title: text("title").notNull().default("New Conversation"),
    context: jsonb("context").default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("IDX_conversations_user_id").on(table.userId),
    index("IDX_conversations_workspace_id").on(table.workspaceId),
    index("IDX_conversations_scope").on(table.scope),
    index("IDX_conversations_updated_at").on(table.updatedAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: varchar("id", { length: 128 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    conversationId: varchar("conversation_id", { length: 128 })
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(), // 'user' | 'assistant' | 'system' | 'tool'
    content: text("content").notNull().default(""),
    toolCalls: jsonb("tool_calls"),
    toolResults: jsonb("tool_results"),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("IDX_messages_conversation_id").on(table.conversationId),
    index("IDX_messages_created_at").on(table.createdAt),
  ],
);

export const memories = pgTable(
  "memories",
  {
    id: varchar("id", { length: 128 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id", { length: 128 }).notNull(),
    workspaceId: varchar("workspace_id", { length: 128 }),
    scope: varchar("scope", { length: 32 }).notNull().default("global"), // 'global' | 'workspace' | 'user' | 'meshlabs'
    category: varchar("category", { length: 64 }).notNull().default("fact"), // 'architectural_decision' | 'user_preference' | 'system_pattern' | 'fact'
    key: varchar("key", { length: 255 }).notNull(),
    content: text("content").notNull(),
    tags: jsonb("tags")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    confidence: real("confidence").default(1.0),
    sourceMessageId: varchar("source_message_id", { length: 128 }),
    lastRecalledAt: timestamp("last_recalled_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("IDX_memories_user_id").on(table.userId),
    index("IDX_memories_workspace_id").on(table.workspaceId),
    index("IDX_memories_scope").on(table.scope),
    index("IDX_memories_category").on(table.category),
    index("IDX_memories_key").on(table.key),
  ],
);

// Zod Schemas
export const insertUserApiKeySchema = createInsertSchema(userApiKeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertConversationSchema = createInsertSchema(conversations, {
  context: z.record(z.string(), z.unknown()).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages, {
  toolCalls: z.array(z.any()).optional(),
  toolResults: z.array(z.any()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertMemorySchema = createInsertSchema(memories, {
  tags: z.array(z.string()).default([]),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Inferred Types
export type UserApiKey = typeof userApiKeys.$inferSelect;
export type InsertUserApiKey = typeof userApiKeys.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

export type Memory = typeof memories.$inferSelect;
export type InsertMemory = typeof memories.$inferInsert;
