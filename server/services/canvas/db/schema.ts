import {
  pgTable,
  text,
  integer,
  jsonb,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { workspaces } from "@services/workspace/db/schema";

export const nodes = pgTable(
  "nodes",
  {
    id: text("id").notNull(),
    workspaceId: integer("workspace_id")
      .references(() => workspaces.id)
      .notNull(),
    type: text("type"),
    position: jsonb("position").$type<{ x: number; y: number }>().notNull(),
    data: jsonb("data").$type<any>().notNull(),
    parentId: text("parent_id"),
    extent: text("extent"),
    style: jsonb("style").$type<any>(),
    width: integer("width"),
    height: integer("height"),
    measured: jsonb("measured").$type<any>(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.workspaceId] }),
    index("IDX_nodes_workspace_id").on(table.workspaceId),
  ],
);

export const edges = pgTable(
  "edges",
  {
    id: text("id").notNull(),
    workspaceId: integer("workspace_id")
      .references(() => workspaces.id)
      .notNull(),
    source: text("source").notNull(),
    target: text("target").notNull(),
    sourceHandle: text("source_handle"),
    targetHandle: text("target_handle"),
    type: text("type"),
    data: jsonb("data").$type<any>(),
    style: jsonb("style").$type<any>(),
    markerEnd: jsonb("marker_end").$type<any>(),
    animated: integer("animated").default(0),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.workspaceId] }),
    index("IDX_edges_workspace_id").on(table.workspaceId),
  ],
);

export const insertNodeSchema = createInsertSchema(nodes);
export const insertEdgeSchema = createInsertSchema(edges);

export type Node = typeof nodes.$inferSelect;
export type InsertNode = z.infer<typeof insertNodeSchema>;
export type Edge = typeof edges.$inferSelect;
export type InsertEdge = z.infer<typeof insertEdgeSchema>;
