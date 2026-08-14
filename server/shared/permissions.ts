export type WorkspaceRole =
  "workspace-owner" | "owner" | "admin" | "editor" | "viewer" | "none";

export const ROLE_RANK: Record<WorkspaceRole, number> = {
  "workspace-owner": 5,
  owner: 5,
  admin: 4,
  editor: 3,
  viewer: 2,
  none: 0,
};

export function rank(role: WorkspaceRole): number {
  return ROLE_RANK[role];
}

export function canDelete(role: WorkspaceRole): boolean {
  return rank(role) >= ROLE_RANK.admin;
}

export function canManage(role: WorkspaceRole): boolean {
  return rank(role) >= ROLE_RANK.admin;
}

export function canEdit(role: WorkspaceRole): boolean {
  return rank(role) >= ROLE_RANK.editor;
}

export function canView(role: WorkspaceRole): boolean {
  return rank(role) >= ROLE_RANK.viewer;
}

export function isOwner(role: WorkspaceRole): boolean {
  return role === "workspace-owner" || role === "owner";
}
