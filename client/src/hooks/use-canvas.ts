import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest } from "../lib/queryClient";
import type { Node, Edge } from "@xyflow/react";

export * from "../lib/canvas-cache";
import { clearCanvasLocalCache } from "../lib/canvas-cache";
import { useAuth } from "./use-auth";

export function useCanvas(workspaceId: string | number | null | undefined) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const url = workspaceId
    ? buildUrl(api.workspaces.getCanvas.path, { id: workspaceId })
    : "";

  const query = useQuery({
    queryKey: [url],
    queryFn: async () => {
      if (!url) return { nodes: [], edges: [] };
      const res = await apiRequest("GET", url);
      return res.json() as Promise<{ nodes: Node[]; edges: Edge[] }>;
    },
    enabled: isAuthenticated && !!workspaceId,
  });

  const syncMutation = useMutation({
    mutationFn: async ({
      nodes,
      edges,
    }: {
      nodes: Node[];
      edges: Edge[];
      cacheGeneration?: number;
    }) => {
      if (!url) throw new Error("Workspace ID is required to sync canvas");
      // Normalize animated property for Postgres compatibility
      const normalizedEdges = edges.map((edge) => ({
        ...edge,
        animated: edge.animated ? 1 : 0,
      }));
      const res = await apiRequest("POST", url, {
        nodes,
        edges: normalizedEdges,
      });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      if (workspaceId)
        clearCanvasLocalCache(workspaceId, variables.cacheGeneration);
      queryClient.invalidateQueries({ queryKey: [url] });
    },
  });

  return {
    ...query,
    syncAsync: syncMutation.mutateAsync,
    sync: syncMutation.mutate,
    isSyncing: syncMutation.isPending,
  };
}
