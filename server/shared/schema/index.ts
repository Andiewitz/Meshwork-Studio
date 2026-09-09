// Shared TYPE + CONTRACT surface only.
//
// Table definitions (pgTable) live inside their owning service
// (server/services/<svc>/db/schema.ts) and must never be re-exported here —
// this file is imported by the client bundle, and after the
// database-per-service split no module outside a service may touch its
// tables. Everything below is the client↔server contract: hand-written
// interfaces mirroring each database's columns, plus plain zod request
// contracts.

// ─── auth_db (owned by server/services/auth) ────────────────────────────────

export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  authProvider: string;
  isAdmin?: boolean;
  isActive?: boolean | null;
  hasNotifiedTeam?: boolean | null;
  readNotificationIds?: unknown;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

// ─── workspace_db ────────────────────────────────────────────────────────────

export interface Collection {
  id: number;
  title: string;
  description: string | null;
  userId: string | null;
  parentId: number | null;
  createdAt: Date | string | null;
}

export interface Workspace {
  id: string;
  title: string;
  type: string;
  icon: string | null;
  isFavorite: boolean | null;
  userId: string | null;
  collectionId: number | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  description: string | null;
  author: string | null;
  aiContext: string | null;
  groups: string[] | null;
  tags: string[] | null;
  canvasCopyStatus: "ready" | "copying" | "failed";
  canvasCopySourceId: string | null;
}

export {
  insertWorkspaceSchema,
  type InsertWorkspace,
  type UpdateWorkspaceRequest,
} from "./workspace-contract";

// ─── team_db (throwaway surface pending collaborators revamp) ───────────────

export interface Team {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
  createdAt: Date | string | null;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: string;
  color: string;
  joinedAt: Date | string | null;
}

export interface TeamWorkspace {
  id: string;
  teamId: string;
  workspaceId: string;
  sharedAt: Date | string | null;
}

export {
  insertTeamSchema,
  insertTeamMemberSchema,
  insertTeamWorkspaceSchema,
  joinTeamSchema,
  updateMemberRoleSchema,
  TEAM_ROLES,
  CURSOR_COLORS,
} from "@services/team/db/schema";
export type {
  InsertTeam,
  InsertTeamMember,
  InsertTeamWorkspace,
  TeamRole,
} from "@services/team/db/schema";

// ─── canvas (DynamoDB documents; shapes mirror the wire format) ────────────

export interface CanvasNode {
  id: string;
  workspaceId: string;
  type: string | null;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  parentId: string | null;
  extent: string | null;
  style: Record<string, unknown> | null;
  width: number | null;
  height: number | null;
  measured: Record<string, unknown> | null;
}

export interface CanvasEdge {
  id: string;
  workspaceId: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  type: string | null;
  data: Record<string, unknown> | null;
  style: Record<string, unknown> | null;
  markerEnd: Record<string, unknown> | null;
  animated: number | null;
}

// ─── jenkos_db (owned by server/services/ai) ────────────────────────────────

export type JenkosScope = "workspace" | "global" | "meshlabs" | "search";

export interface Conversation {
  id: string;
  userId: string;
  workspaceId?: string | null;
  scope: JenkosScope | string;
  title: string;
  context?: Record<string, unknown> | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool" | string;
  content: string;
  toolCalls?: Record<string, unknown>[] | null;
  toolResults?: Record<string, unknown>[] | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | string | null;
}

export type MemoryCategory =
  "architectural_decision" | "user_preference" | "system_pattern" | "fact";

export interface Memory {
  id: string;
  userId: string;
  workspaceId?: string | null;
  scope: "global" | "workspace" | "user" | "meshlabs" | string;
  category: MemoryCategory | string;
  key: string;
  content: string;
  tags?: string[] | null;
  confidence?: number | null;
  sourceMessageId?: string | null;
  lastRecalledAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface UserApiKeyPublic {
  id: string;
  provider: string;
  keyHint?: string | null;
  isActive: boolean;
  createdAt?: Date | string | null;
}
