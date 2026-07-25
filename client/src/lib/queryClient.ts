import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { secureFetch } from "./secure-fetch";
import { ApiError } from "./error-utils";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

function getApiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}${path}`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let message = res.statusText || "Request failed";
    let payload: unknown;

    try {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        payload = json;
        if (json && typeof json.message === "string") {
          message = json.message;
        } else if (json && typeof json.error === "string") {
          message = json.error;
        }
      } catch {
        if (text && text.length < 200 && !text.startsWith("<")) {
          message = text;
        }
      }
    } catch {
      // Ignore text extraction failure
    }

    // Dev-only sanitized debug log (NO sensitive data, payload, or tokens logged)
    if (import.meta.env.DEV) {
      try {
        const urlPath = new URL(res.url, window.location.origin).pathname;
        console.debug(`[API ${res.status}] ${urlPath}: ${message}`);
      } catch {
        console.debug(`[API ${res.status}]: ${message}`);
      }
    }

    throw new ApiError(res.status, message, payload);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  const res = await secureFetch(getApiUrl(url), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(getApiUrl(queryKey.join("/")), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
