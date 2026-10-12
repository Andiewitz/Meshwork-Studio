// Internal HTTP surface for the workspace service. Key-guarded, loopback
// only (NGINX never routes /internal/*).

import { Router, type Express, type Request, type Response } from "express";
import { z } from "zod";
import { requireInternalKey } from "@server/lib/internal";
import { workspaceStorage } from "../db/storage";

export function registerWorkspaceInternalRoutes(app: Express) {
  const internal = Router();
  internal.use(requireInternalKey);

  // GET /internal/workspaces/lookup?ids=a,b,c
  // Ownership + title for arbitrary ids — consumed by the team service's
  // read-through mirror so its role checks stay local queries.
  internal.get("/workspaces/lookup", async (req: Request, res: Response) => {
    const parsed = z
      .string()
      .max(4096)
      .parse(req.query.ids ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);

    const found = await Promise.all(
      parsed.map(async (id) => {
        const ws = await workspaceStorage.getWorkspace(id);
        return ws
          ? { id: ws.id, ownerId: ws.userId ?? "", title: ws.title }
          : null;
      }),
    );

    res.json({ workspaces: found.filter(Boolean) });
  });

  // GET /internal/stats — counters for the metrics collector.
  internal.get("/stats", async (_req: Request, res: Response) => {
    const rows = await workspaceStorage.countWorkspaces();
    res.json({ totalWorkspaces: rows });
  });

  app.use("/internal", internal);
}
