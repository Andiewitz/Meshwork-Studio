// Internal HTTP surface for the workspace service. Key-guarded, loopback
// only (NGINX never routes /internal/*).

import { Router, type Express, type Request, type Response } from "express";
import { z } from "zod";
import { requireInternalKey } from "@server/lib/internal";
import { fail } from "@server/lib/errorEnvelope";
import { workspaceStorage } from "../db/storage";
import { createWorkspaceAccessReader } from "../public";
import { readQuery } from "@server/lib/module-outcomes";

export function registerWorkspaceInternalRoutes(app: Express) {
  const internal = Router();
  const accessReader = createWorkspaceAccessReader(workspaceStorage);
  internal.use(requireInternalKey);

  // GET /internal/v1/workspace/lookup?ids=a,b,c
  // Ownership + title for arbitrary ids — consumed by the team service's
  // read-through mirror so its role checks stay local queries.
  internal.get("/lookup", async (req: Request, res: Response) => {
    const parsed = z
      .string()
      .max(4096)
      .parse(req.query.ids ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);

    const ids = [...new Set(parsed)];
    const rows = await workspaceStorage.getWorkspacesByIds(ids);
    const byId = new Map(rows.map((workspace) => [workspace.id, workspace]));
    const found = ids
      .map((id) => byId.get(id))
      .filter((workspace) => workspace !== undefined)
      .map((workspace) => ({
        id: workspace.id,
        ownerId: workspace.userId ?? "",
        title: workspace.title,
      }));

    res.json({ workspaces: found });
  });

  // Workspace owns the access decision for each user and workspace.
  internal.get("/access", async (req: Request, res: Response) => {
    const parsed = z
      .object({
        workspaceId: z.string().min(1).max(128),
        userId: z.string().min(1).max(128),
      })
      .safeParse(req.query);
    if (!parsed.success) {
      return fail(req, res, "VALIDATION_FAILED", "Invalid access query");
    }
    const access = readQuery(
      await accessReader.getAccess(parsed.data.workspaceId, parsed.data.userId),
    );
    return res.json({ access });
  });

  // GET /internal/v1/workspace/stats — counters for the metrics collector.
  internal.get("/stats", async (_req: Request, res: Response) => {
    const rows = await workspaceStorage.countWorkspaces();
    res.json({ totalWorkspaces: rows });
  });

  app.use("/internal/v1/workspace", internal);
}
