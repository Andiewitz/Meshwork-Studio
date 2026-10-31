import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest } from "../lib/queryClient";
import type { Node, Edge } from "@xyflow/react";

export * from "../lib/canvas-cache";
import { clearCanvasLocalCache } from "../lib/canvas-cache";
import {
  normalizeCanvasEdge,
  type CanvasSaveChanges,
} from "../lib/canvas-delta";
import { useAuth } from "./use-auth";

export interface CanvasSyncInput {
  nodes: Node[];
  edges: Edge[];
  baseRevision: number;
  cacheGeneration?: number;
  changes?: CanvasSaveChanges;
}

export function useCanvas(workspaceId: string | number | null | undefined) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const url = workspaceId
    ? buildUrl(api.workspaces.getCanvas.path, { id: workspaceId })
    : "";

  const query = useQuery({
    queryKey: [url],
    queryFn: async () => {
      if (!url) return { nodes: [], edges: [], revision: 0 };
      const res = await apiRequest("GET", url);
      return res.json() as Promise<{
        nodes: Node[];
        edges: Edge[];
        revision: number;
      }>;
    },
    enabled: isAuthenticated && !!workspaceId,
  });

  const syncMutation = useMutation({
    mutationFn: async ({
      nodes,
      edges,
      baseRevision,
      changes,
    }: CanvasSyncInput) => {
      if (!url) throw new Error("Workspace ID is required to sync canvas");
      const body = changes
        ? { changes, baseRevision }
        : {
            nodes,
            edges: edges.map(normalizeCanvasEdge),
            baseRevision,
          };
      const res = await apiRequest("POST", url, body);
      return res.json() as Promise<{ success: boolean; revision: number }>;
    },
    onSuccess: (data, variables) => {
      if (workspaceId)
        clearCanvasLocalCache(workspaceId, variables.cacheGeneration);
      queryClient.setQueryData<{
        nodes: Node[];
        edges: Edge[];
        revision: number;
      }>([url], (current) =>
        current && current.revision > data.revision
          ? current
          : {
              nodes: variables.nodes,
              edges: variables.edges,
              revision: data.revision,
            },
      );
    },
  });

  return {
    ...query,
    syncAsync: syncMutation.mutateAsync,
    sync: syncMutation.mutate,
    isSyncing: syncMutation.isPending,
  };
}
