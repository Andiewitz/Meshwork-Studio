/**
 * Server-side permission helpers.
 *
 * Wraps shared/permissions with null-safe variants used by the server routes,
 * where getWorkspaceRole() can return null (no membership) in addition to
 * the WorkspaceRole union values.
 *
 * When individual modules are extracted to microservices, this becomes
 * a shared library package (e.g., @meshwork/permissions).
 */
import {
  ROLE_RANK,
  rank as sharedRank,
  type WorkspaceRole,
} from "@shared/permissions";

export type { WorkspaceRole };
export type EffectiveRole = WorkspaceRole | null;
export { ROLE_RANK };

function toRole(role: EffectiveRole): WorkspaceRole {
  return role ?? "none";
}

export function rank(role: EffectiveRole): number {
  return sharedRank(toRole(role));
}

export function canDeleteWorkspace(role: EffectiveRole): boolean {
  return rank(role) >= ROLE_RANK.admin;
}

export function canManageWorkspace(role: EffectiveRole): boolean {
  return rank(role) >= ROLE_RANK.admin;
}

export function canEditWorkspace(role: EffectiveRole): boolean {
  return rank(role) >= ROLE_RANK.editor;
}

export function canViewWorkspace(role: EffectiveRole): boolean {
  return rank(role) >= ROLE_RANK.viewer;
}

export function isOwner(role: EffectiveRole): boolean {
  return role === "workspace-owner" || role === "owner";
}
