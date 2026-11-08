import type { Express } from "express";
import { csrfProtect } from "../../../auth";
import { fail } from "@server/lib/errorEnvelope";
import { canEditWorkspace } from "@server/lib/permissions";
import { workspaceAccess } from "@server/lib/workspace-access";
import { getWorkspaceSummary } from "@services/workspace/public";
import { createArchitectureArtifactSchema } from "@shared/architecture-plan";
import type { CanvasRouteDependencies } from "../dependencies";
import {
  architectureArtifacts,
  type ArchitectureArtifactStore,
} from "../db/architecture-artifacts";

export function registerArchitectureArtifactRoutes(
  app: Express,
  context: CanvasRouteDependencies,
  store: ArchitectureArtifactStore = architectureArtifacts,
) {
  const path = "/api/v1/workspaces/:id/architecture-plans";
  const access = workspaceAccess(context.directAccess);
  const param = (value: string | string[]) =>
    Array.isArray(value) ? value[0] : value;
  async function authorize(req: any, res: any, edit: boolean) {
    const workspace = await getWorkspaceSummary(
      context.workspaces,
      req.params.id,
    );
    if (!workspace) {
      fail(req, res, "NOT_FOUND", "Project not found.");
      return false;
    }
    const role =
      workspace.userId === req.user.id
        ? "workspace-owner"
        : await access.getWorkspaceRole(workspace.id, req.user.id);
    if (edit ? !canEditWorkspace(role) : !role) {
      fail(req, res, "FORBIDDEN", "You do not have access to these plans.");
      return false;
    }
    return true;
  }
  app.get(path, context.isAuthenticated, async (req, res) => {
    if (!(await authorize(req, res, false))) return;
    try {
      res.json(await store.list(param(req.params.id)));
    } catch {
      fail(
        req,
        res,
        "SERVICE_UNAVAILABLE",
        "Plan storage is unavailable or not configured.",
      );
    }
  });
  app.get(`${path}/:planId`, context.isAuthenticated, async (req, res) => {
    if (!(await authorize(req, res, false))) return;
    try {
      const artifact = await store.get(
        param(req.params.id),
        param(req.params.planId),
      );
      if (!artifact) return fail(req, res, "NOT_FOUND", "Plan not found.");
      res.json(artifact);
    } catch {
      fail(
        req,
        res,
        "SERVICE_UNAVAILABLE",
        "Plan storage is unavailable or not configured.",
      );
    }
  });
  app.post(path, csrfProtect, context.isAuthenticated, async (req, res) => {
    if (!(await authorize(req, res, true))) return;
    const input = createArchitectureArtifactSchema.safeParse(req.body);
    if (!input.success)
      return fail(
        req,
        res,
        "VALIDATION_FAILED",
        "The architecture plan is invalid.",
      );
    try {
      res
        .status(201)
        .json(await store.create(param(req.params.id), input.data));
    } catch {
      fail(
        req,
        res,
        "SERVICE_UNAVAILABLE",
        "Plan storage is unavailable or not configured.",
      );
    }
  });
}
