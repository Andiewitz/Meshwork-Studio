import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { secureFetch } from "@/lib/secure-fetch";

export type CollaboratorPermission = "view" | "edit";
export interface Collaborator {
  userId: string;
  permission: CollaboratorPermission;
  profile: {
    id: string;
    email: string;
    name: string;
    profileImageUrl: string | null;
  } | null;
}

async function request(path: string, init?: RequestInit) {
  const base = (import.meta.env.VITE_API_URL as string) || "";
  const response = await secureFetch(`${base}${path}`, init);
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(
      data.message || "Unable to update collaborators. Try again.",
    );
  }
  if (response.status === 204) return null;
  return response.json();
}

export function useCollaborators(workspaceId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const key = ["workspace-collaborators", workspaceId];
  const path = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/collaborators`;
  const query = useQuery<{ collaborators: Collaborator[] }>({
    queryKey: key,
    enabled: enabled && Boolean(workspaceId),
    queryFn: () => request(path),
  });
  const mutation = useMutation({
    mutationFn: ({
      method,
      userId,
      data,
    }: {
      method: "POST" | "PATCH" | "DELETE";
      userId?: string;
      data?: unknown;
    }) =>
      request(`${path}${userId ? `/${encodeURIComponent(userId)}` : ""}`, {
        method,
        ...(data
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            }
          : {}),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  return { ...query, change: mutation };
}
