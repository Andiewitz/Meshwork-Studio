import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  varchar,
  index,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Session storage table.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table
export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  passwordHash: varchar("password_hash"),
  authProvider: varchar("auth_provider").notNull().default("email"),
  hasNotifiedTeam: boolean("has_notified_team").default(false),
  readNotificationIds: jsonb("read_notification_ids").default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userApiKeys = pgTable(
  "user_api_keys",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider").notNull(),
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

// Login attempt tracking for account lockout protection
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    email: varchar("email").notNull(),
    failed: integer("failed").notNull().default(0),
    lastAttempt: timestamp("last_attempt").notNull().defaultNow(),
    lockedUntil: timestamp("locked_until"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("IDX_login_attempts_email").on(table.email),
    // eslint-disable-next-line no-secrets/no-secrets
    index("IDX_login_attempts_locked_until").on(table.lockedUntil),
  ],
);

export const insertUserApiKeySchema = createInsertSchema(userApiKeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserApiKey = typeof userApiKeys.$inferSelect;
export type InsertUserApiKey = z.infer<typeof insertUserApiKeySchema>;
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
