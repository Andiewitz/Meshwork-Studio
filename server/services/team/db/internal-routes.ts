// Internal HTTP surface for the team service. Key-guarded, loopback only.

import { Router, type Express, type Request, type Response } from "express";
import { requireInternalKey } from "@server/lib/internal";
import { teams } from "../db/schema";
import { db } from "../db/connection";
import { sql } from "drizzle-orm";

export function registerTeamInternalRoutes(app: Express) {
  const internal = Router();
  internal.use(requireInternalKey);

  // GET /internal/v1/team/stats — counter for the metrics collector.
  internal.get("/stats", async (_req: Request, res: Response) => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(teams);
    res.json({ totalTeams: row?.n ?? 0 });
  });

  app.use("/internal/v1/team", internal);
}
