import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import {
  type CreateWorkspaceRequest,
  type UpdateWorkspaceRequest,
} from "@shared/schema";
import { secureFetch } from "../lib/secure-fetch";
import { useAuth } from "./use-auth";
import {
  type WorkspaceRole,
  canDelete,
  canManage,
  canEdit,
  canView,
  rank,
} from "@shared/permissions";
import type { Workspace } from "@shared/schema";

const rawApiUrl = (import.meta.env.VITE_API_URL as string) || "";
const API_BASE_URL = rawApiUrl.includes("railway") ? "" : rawApiUrl;

function getApiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}${path}`;
}

/** Extract a human-readable message from a failed response JSON */
async function extractError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  throw new Error(body.message ?? fallback);
}

// Hook to fetch all workspaces
export function useWorkspaces() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: [api.workspaces.list.path],
    queryFn: async () => {
      const res = await fetch(getApiUrl(api.workspaces.list.path), {
        credentials: "include",
      });
      if (!res.ok) {
        const errorText = await res.text().catch(() => "Unknown error");
        console.error(
          `[useWorkspaces] Failed with status ${res.status}:`,
          errorText,
        );
        if (res.status === 401)
          throw new Error(`Unauthorized (401) - Session expired or invalid`);
        throw new Error(
          `Failed to fetch workspaces (${res.status}): ${errorText}`,
        );
      }
      return api.workspaces.list.responses[200].parse(await res.json());
    },
    enabled: isAuthenticated, // Only fetch if authenticated
  });
}

// Hook to fetch a single workspace
export function useWorkspace(id: number) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: [api.workspaces.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.workspaces.get.path, { id });
      const res = await fetch(getApiUrl(url), { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch workspace");
      return api.workspaces.get.responses[200].parse(await res.json());
    },
    enabled: isAuthenticated && !!id,
  });
}

// Hook to create a workspace
export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWorkspaceRequest) => {
      const res = await secureFetch(getApiUrl(api.workspaces.create.path), {
        method: api.workspaces.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) await extractError(res, "Failed to create workspace");
      return api.workspaces.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [api.workspaces.list.path],
      });
    },
  });
}

// Optimistic update context type
interface WorkspaceUpdateContext {
  previousWorkspaces: unknown;
  previousWorkspace: unknown;
}

// Hook to update a workspace
export function useUpdateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: number } & UpdateWorkspaceRequest) => {
      const url = buildUrl(api.workspaces.update.path, { id });
      const res = await secureFetch(getApiUrl(url), {
        method: api.workspaces.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to update workspace");
      return api.workspaces.update.responses[200].parse(await res.json());
    },
    onMutate: async (newWorkspace): Promise<WorkspaceUpdateContext> => {
      await queryClient.cancelQueries({ queryKey: [api.workspaces.list.path] });
      await queryClient.cancelQueries({
        queryKey: [api.workspaces.get.path, newWorkspace.id],
      });

      const previousWorkspaces = queryClient.getQueryData([
        api.workspaces.list.path,
      ]);
      const previousWorkspace = queryClient.getQueryData([
        api.workspaces.get.path,
        newWorkspace.id,
      ]);

      if (previousWorkspaces) {
        queryClient.setQueryData(
          [api.workspaces.list.path],
          (old: Workspace[]) => {
            return old.map((w) =>
              w.id === newWorkspace.id ? { ...w, ...newWorkspace } : w,
            );
          },
        );
      }

      if (previousWorkspace) {
        queryClient.setQueryData(
          [api.workspaces.get.path, newWorkspace.id],
          (old: Workspace) => {
            return { ...old, ...newWorkspace };
          },
        );
      }

      return { previousWorkspaces, previousWorkspace };
    },
    onError: (
      _err,
      newWorkspace,
      context: WorkspaceUpdateContext | undefined,
    ) => {
      if (context?.previousWorkspaces) {
        queryClient.setQueryData(
          [api.workspaces.list.path],
          context.previousWorkspaces,
        );
      }
      if (context?.previousWorkspace) {
        queryClient.setQueryData(
          [api.workspaces.get.path, newWorkspace.id],
          context.previousWorkspace,
        );
      }
    },
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [api.workspaces.list.path],
      });
      void queryClient.invalidateQueries({
        queryKey: [api.workspaces.get.path, variables.id],
      });
    },
  });
}

// Hook to delete a workspace
export function useDeleteWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.workspaces.delete.path, { id });
      const res = await secureFetch(getApiUrl(url), {
        method: api.workspaces.delete.method,
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to delete workspace");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [api.workspaces.list.path],
      });
    },
  });
}

// Hook to duplicate a workspace
export function useDuplicateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, title }: { id: number; title?: string }) => {
      const url = buildUrl(api.workspaces.duplicate.path, { id });
      const res = await secureFetch(getApiUrl(url), {
        method: api.workspaces.duplicate.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to duplicate workspace");
      return api.workspaces.duplicate.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [api.workspaces.list.path],
      });
    },
  });
}

// Hook to fetch user's role for a workspace
export {
  type WorkspaceRole,
  canDelete,
  canManage,
  canEdit,
  canView,
  rank,
} from "@shared/permissions";

export function useWorkspaceRole(workspaceId: number | null) {
  return useQuery<{ role: WorkspaceRole }>({
    queryKey: ["workspace-role", workspaceId],
    queryFn: async () => {
      const res = await fetch(
        getApiUrl(`/api/v1/workspaces/${workspaceId}/role`),
        { credentials: "include" },
      );
      if (!res.ok) return { role: "none" as WorkspaceRole };
      return res.json() as Promise<{ role: WorkspaceRole }>;
    },
    enabled: !!workspaceId,
  });
}

// Hook to fetch all members for a workspace (via its team)
export interface WorkspaceMember {
  id: string;
  userId: string;
  email: string;
  firstName: string | null;
  profileImageUrl: string | null;
  role: string;
  color: string;
}

export function useWorkspaceMembers(workspaceId: number | null) {
  return useQuery<{ teamId: string | null; members: WorkspaceMember[] }>({
    queryKey: ["workspace-members", workspaceId],
    queryFn: async () => {
      const res = await fetch(
        getApiUrl(`/api/v1/workspaces/${workspaceId}/members`),
        { credentials: "include" },
      );
      if (!res.ok) return { teamId: null, members: [] };
      return res.json() as Promise<{
        teamId: string | null;
        members: WorkspaceMember[];
      }>;
    },
    enabled: !!workspaceId,
  });
}

// Hook to update a member's role
export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      userId,
      role,
    }: {
      teamId: string;
      userId: string;
      role: string;
    }) => {
      const res = await secureFetch(
        getApiUrl(`/api/v1/teams/${teamId}/members/${userId}/role`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
          credentials: "include",
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({ message: "Failed" }))) as {
          message?: string;
        };
        throw new Error(err.message ?? "Failed to update role");
      }
      return res.json() as Promise<{ role: string }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-role"] });
    },
  });
}
