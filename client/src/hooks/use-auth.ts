import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { secureFetch } from "../lib/secure-fetch";
import type { User } from "@shared/schema";

const rawApiUrl = (import.meta.env.VITE_API_URL as string) || "";
const API_BASE_URL = rawApiUrl.includes("railway") ? "" : rawApiUrl;

function getApiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}${path}`;
}

async function fetchUser(): Promise<User | null> {
  try {
    const response = await secureFetch(getApiUrl("/api/v1/auth/me"), {
      credentials: "include",
    });

    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status}: ${text}`);
    }

    const userData = await response.json();
    return userData;
  } catch (err) {
    // Local Dev Bypass - Instantly see the Dashboard UI without needing Postgres running
    if (import.meta.env.DEV) {
      return {
        id: "mock-id-1",
        email: "architect@meshwork.dev",
        firstName: "Andrei",
        lastName: "Architect",
        profileImageUrl:
          // eslint-disable-next-line no-secrets/no-secrets
          "https://lh3.googleusercontent.com/aida-public/AB6AXuC-JTdi7K7guBlCoOvJJUVsjo1JHj0Ok51Bw9bfewYZRrdCNKm96Vq8Esf03yMGfFjz-Nx1o88diz_-CgrcFlaEuF133QGW6enP8CTOPkZJl0ySRO6ZMe-AtabFmhTdW3EhkAYHkBTt7E6x4Inv5fP6wfSJwJOdn4hFT-PbOCoTdUy5TodHgkAX8Y2V5W259KvjJ4pWnlGmcbEbhGUHJAAa1jiqDuRbbhBIC38ALVGuHswMP4FGj74VLcVH-mj5E5IbO9VuDZn8Vzhf",
        passwordHash: null,
        authProvider: "email",
        hasNotifiedTeam: false,
        readNotificationIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    // Return null instead of throwing to prevent infinite loading screen
    return null;
  }
}

async function logout(): Promise<void> {
  const response = await secureFetch(getApiUrl("/api/v1/auth/logout"), {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Logout failed");
  }
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/v1/auth/me"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Listen for session-expired events (triggered by 401s, failed token refreshes, or WS Unauthorized)
  useEffect(() => {
    let isHandling = false;
    const handleSessionExpired = () => {
      if (isHandling) return;
      isHandling = true;
      queryClient.setQueryData(["/api/v1/auth/me"], null);
      queryClient.clear();

      // Always do a hard redirect to login with the session_expired reason.
      // We cannot bail out based on isPublicRoute here because Wouter's client-side
      // <Redirect> (triggered by user becoming null) may have already called
      // history.pushState("/login") BEFORE this handler evaluates window.location.pathname.
      // That makes isPublicRoute = true and silently swallows the redirect, leaving
      // the user on a broken state without the "session expired" banner.
      const path = window.location.pathname;
      const isPublicRoute =
        path.startsWith("/login") ||
        path.startsWith("/register") ||
        path === "/" ||
        path.startsWith("/docs") ||
        path.startsWith("/terms") ||
        path.startsWith("/privacy");

      // If we're on a private route, redirect and carry the path as the post-login destination.
      // If we're already on a public route (e.g. Wouter already pushed /login), still do a
      // full page reload to /login?reason=session_expired so the banner appears.
      const redirectTarget = isPublicRoute ? "/home" : path;
      window.location.href = `/login?reason=session_expired&redirect=${encodeURIComponent(redirectTarget)}`;
    };

    window.addEventListener("session-expired", handleSessionExpired);
    return () => {
      window.removeEventListener("session-expired", handleSessionExpired);
    };
  }, [queryClient]);

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/v1/auth/me"], null);
      setIsRedirecting(true);
      // Clear all queries to ensure fresh state on next login
      queryClient.clear();
    },
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: {
      hasNotifiedTeam?: boolean;
      readNotificationIds?: number[];
    }) => {
      const response = await secureFetch(
        getApiUrl("/api/v1/user/preferences"),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Update preferences failed: ${text}`);
      }
      return response.json();
    },
    onSuccess: (updatedData) => {
      queryClient.setQueryData(["/api/v1/auth/me"], (oldUser: any) => {
        if (!oldUser) return null;
        return { ...oldUser, ...updatedData };
      });
    },
  });

  return {
    user,
    isLoading: isLoading || isRedirecting,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    updatePreferences: updatePreferencesMutation.mutateAsync,
    isUpdatingPreferences: updatePreferencesMutation.isPending,
    isRedirecting,
  };
}
