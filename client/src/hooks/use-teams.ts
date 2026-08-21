import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { secureFetch } from "../lib/secure-fetch";
import { useAuth } from "./use-auth";
import { api } from "@shared/routes";
import type { Team, TeamMember, Workspace } from "@shared/schema";

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

// ─── Types ───────────────────────────────────────────────────────────

export interface TeamWithCount extends Team {
  memberCount: number;
}

export interface TeamDetail extends Team {
  members: (TeamMember & {
    email: string;
    firstName: string | null;
    profileImageUrl: string | null;
  })[];
}

// ─── Queries ─────────────────────────────────────────────────────────

export function useTeams() {
  const { isAuthenticated } = useAuth();

  return useQuery<TeamWithCount[]>({
    queryKey: ["/api/v1/teams"],
    queryFn: async () => {
      const res = await secureFetch(getApiUrl("/api/v1/teams"), {
        credentials: "include",
      });
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent("session-expired"));
      }
      if (!res.ok) throw new Error("Failed to fetch teams");
      return res.json() as Promise<TeamWithCount[]>;
    },
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });
}

export function useTeam(teamId: string | null) {
  const { isAuthenticated } = useAuth();

  return useQuery<TeamDetail>({
    queryKey: ["/api/v1/teams", teamId],
    queryFn: async () => {
      const res = await secureFetch(getApiUrl(`/api/v1/teams/${teamId}`), {
        credentials: "include",
      });
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent("session-expired"));
      }
      if (!res.ok) throw new Error("Failed to fetch team");
      return res.json() as Promise<TeamDetail>;
    },
    enabled: isAuthenticated && !!teamId,
    refetchInterval: 5000,
  });
}

export function useTeamWorkspaces(teamId: string | null) {
  const { isAuthenticated } = useAuth();

  return useQuery<Workspace[]>({
    queryKey: ["/api/v1/teams", teamId, "workspaces"],
    queryFn: async () => {
      const res = await secureFetch(
        getApiUrl(`/api/v1/teams/${teamId}/workspaces`),
        {
          credentials: "include",
        },
      );
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent("session-expired"));
      }
      if (!res.ok) throw new Error("Failed to fetch team workspaces");
      return res.json() as Promise<Workspace[]>;
    },
    enabled: isAuthenticated && !!teamId,
    refetchInterval: 5000,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────

export function useCreateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const res = await secureFetch(getApiUrl("/api/v1/teams"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        credentials: "include",
      });
      if (!res.ok) await extractError(res, "Failed to create team");
      return res.json() as Promise<Team>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/v1/teams"] });
    },
  });
}

export function useJoinTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteCode: string) => {
      const res = await secureFetch(getApiUrl("/api/v1/teams/join"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode }),
        credentials: "include",
      });
      if (!res.ok) await extractError(res, "Invalid invite code");
      return res.json() as Promise<Team>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/v1/teams"] });
      void queryClient.invalidateQueries({
        queryKey: [api.workspaces.list.path],
      });
    },
  });
}

export function useLeaveTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      userId,
    }: {
      teamId: string;
      userId: string;
    }) => {
      const res = await secureFetch(
        getApiUrl(`/api/v1/teams/${teamId}/members/${userId}`),
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (!res.ok) await extractError(res, "Failed to leave team");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/v1/teams"] });
      void queryClient.invalidateQueries({
        queryKey: [api.workspaces.list.path],
      });
    },
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (teamId: string) => {
      const res = await secureFetch(getApiUrl(`/api/v1/teams/${teamId}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) await extractError(res, "Failed to delete team");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/v1/teams"] });
      void queryClient.invalidateQueries({
        queryKey: [api.workspaces.list.path],
      });
    },
  });
}

export function useShareWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      workspaceId,
    }: {
      teamId: string;
      workspaceId: number;
    }) => {
      const res = await secureFetch(
        getApiUrl(`/api/v1/teams/${teamId}/workspaces`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
          credentials: "include",
        },
      );
      if (!res.ok) await extractError(res, "Failed to share workspace");
      return res.json() as Promise<{ message: string }>;
    },
    onSuccess: (_, { teamId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/v1/teams", teamId, "workspaces"],
      });
      void queryClient.invalidateQueries({
        queryKey: [api.workspaces.list.path],
      });
    },
  });
}

export function useRegenerateInviteCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (teamId: string) => {
      const res = await secureFetch(
        getApiUrl(`/api/v1/teams/${teamId}/regenerate-code`),
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!res.ok) await extractError(res, "Failed to regenerate code");
      return res.json() as Promise<{ inviteCode: string }>;
    },
    onSuccess: (_, teamId) => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/v1/teams", teamId],
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/v1/teams"] });
    },
  });
}
