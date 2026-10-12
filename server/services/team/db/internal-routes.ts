// Internal HTTP surface for the team service. Key-guarded, loopback only.

import { Router, type Express, type Request, type Response } from "express";
import { requireInternalKey } from "@server/lib/internal";
import {
  teamMembers as teamMembersTable,
  teams,
  teamWorkspaces,
} from "../db/schema";
import { inArray } from "drizzle-orm";
import { db } from "../db/connection";
import { eq, sql } from "drizzle-orm";

export function registerTeamInternalRoutes(app: Express) {
  const internal = Router();
  internal.use(requireInternalKey);

  // GET /internal/users/:userId/shared-workspace-ids
  // THROWAWAY: replaced by the collaborators/permissions revamp.
  internal.get(
    "/users/:userId/shared-workspace-ids",
    async (req: Request, res: Response) => {
      const userId = String(req.params.userId);
      const memberships = await db
        .select({ teamId: teamMembersTable.teamId })
        .from(teamMembersTable)
        .where(eq(teamMembersTable.userId, userId));

      if (memberships.length === 0) {
        res.json({ workspaceIds: [] });
        return;
      }

      const shared = await db
        .select({ workspaceId: teamWorkspaces.workspaceId })
        .from(teamWorkspaces)
        .where(
          inArray(
            teamWorkspaces.teamId,
            memberships.map((m) => m.teamId),
          ),
        );

      res.json({ workspaceIds: shared.map((s) => s.workspaceId) });
    },
  );

  // GET /internal/stats — counter for the metrics collector.
  internal.get("/stats", async (_req: Request, res: Response) => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(teams);
    res.json({ totalTeams: row?.n ?? 0 });
  });

  app.use("/internal", internal);
}
