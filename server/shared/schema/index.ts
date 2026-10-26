// Shared TYPE + CONTRACT surface only.
//
// Table definitions (pgTable) live inside their owning service
// (server/services/<svc>/db/schema.ts) and must never be re-exported here —
// this file is imported by the client bundle, and after the
// database-per-service split no module outside a service may touch its
// tables. Everything below is the client↔server contract: hand-written
// JSON DTOs with string timestamps, plus plain Zod request contracts.

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
  createdAt?: string | null;
  updatedAt?: string | null;
}

// ─── workspace_db ────────────────────────────────────────────────────────────

export type {
  CollectionDto as Collection,
  WorkspaceDto as Workspace,
} from "../contracts/dtos";

export {
  insertWorkspaceSchema,
  type InsertWorkspace,
  type UpdateWorkspaceRequest,
  workspaceCollaboratorPermissionSchema,
  workspaceAccessSchema,
  upsertWorkspaceCollaboratorSchema,
  updateWorkspaceCollaboratorPermissionSchema,
  type WorkspaceCollaboratorPermission,
  type WorkspaceAccess,
  type UpsertWorkspaceCollaborator,
} from "./workspace-contract";

// ─── team_db (throwaway surface pending collaborators revamp) ───────────────

export type {
  TeamDto as Team,
  TeamMemberDto as TeamMember,
  TeamWorkspaceDto as TeamWorkspace,
} from "../contracts/dtos";

export {
  insertTeamSchema,
  insertTeamMemberSchema,
  insertTeamWorkspaceSchema,
  joinTeamSchema,
  updateMemberRoleSchema,
  TEAM_ROLES,
  CURSOR_COLORS,
} from "./team-contract";
export type {
  InsertTeam,
  InsertTeamMember,
  InsertTeamWorkspace,
  TeamRole,
} from "./team-contract";

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
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool" | string;
  content: string;
  toolCalls?: Record<string, unknown>[] | null;
  toolResults?: Record<string, unknown>[] | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
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
  lastRecalledAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface UserApiKeyPublic {
  id: string;
  provider: string;
  keyHint?: string | null;
  isActive: boolean;
  createdAt?: string | null;
}
