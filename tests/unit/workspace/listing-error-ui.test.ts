import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/error-utils";

const { query } = vi.hoisted(() => {
  const query: {
    data: { id: string; title: string; type: string }[] | undefined;
    isLoading: boolean;
    isError: boolean;
    error: Error | undefined;
    isFetching: boolean;
    refetch: ReturnType<typeof vi.fn>;
  } = {
    data: undefined,
    isLoading: false,
    isError: true,
    error: undefined,
    isFetching: false,
    refetch: vi.fn(),
  };
  return { query };
});
vi.mock("@/hooks/use-workspaces", () => ({
  useWorkspaces: () => query,
  useDeleteWorkspace: () => ({ mutate: vi.fn() }),
  useCreateWorkspace: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { firstName: "Test" } }),
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/home", vi.fn()],
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("react-helmet-async", () => ({ Helmet: () => null }));
vi.mock("@/features/workspace/components/CreateWorkspaceDialog", () => ({
  CreateWorkspaceDialog: () => null,
}));
vi.mock("@/features/workspace/components/WorkspaceCard", () => ({
  WorkspaceCard: () => React.createElement("div", null, "Cached project"),
}));
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
    }) => React.createElement("div", { className }, children),
  },
}));
import Home from "@/pages/Home";

beforeEach(() => {
  // The app's Vite React plugin supplies automatic JSX; this bare Vitest
  // configuration uses the classic transform for the imported TSX component.
  vi.stubGlobal("React", React);
  query.data = undefined;
  query.isError = true;
  query.error = new ApiError(
    503,
    "Workspace listing is temporarily unavailable.",
    { requestId: "aabbccdd12345678" },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("workspace listing error presentation", () => {
  it("shows a retryable error with support reference instead of an empty account", () => {
    const html = renderToStaticMarkup(React.createElement(Home));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Retry");
    expect(html).toContain("AABB-5678");
    expect(html).not.toContain("No workspaces yet");
  });

  it("keeps cached items visible and explicitly stale when refresh fails", () => {
    query.data = [{ id: "cached", title: "Cached", type: "system" }];
    const html = renderToStaticMarkup(React.createElement(Home));
    expect(html).toContain("Cached project");
    expect(html).toContain("Previously loaded projects may be out of date");
  });
});
