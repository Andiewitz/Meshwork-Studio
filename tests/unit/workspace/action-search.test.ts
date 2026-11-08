// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("wouter", () => ({ useLocation: () => ["/home", mocks.navigate] }));
vi.mock("@/hooks/use-workspaces", () => ({
  useWorkspaces: () => ({
    data: [
      {
        id: "project-42",
        title: "Payments Platform",
        description: "Checkout services",
        type: "architecture",
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));
import { ActionSearchBar } from "@/components/ui/action-searchbar";

describe("workspace search", () => {
  let container: HTMLDivElement;
  let root: Root;
  const selectNode = vi.fn();
  const close = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root.render(
        React.createElement(ActionSearchBar, {
          nodes: [
            {
              id: "db-1",
              type: "database",
              position: { x: 0, y: 0 },
              data: { label: "Orders DB", provider: "Postgres" },
            },
          ],
          onSelectNode: selectNode,
          onClose: close,
        }),
      ),
    );
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  function search(value: string) {
    const input = container.querySelector("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return input;
  }
  it("finds a workspace by description and opens the real workspace", () => {
    const input = search("checkout");
    expect(container.textContent).toContain("Payments Platform");
    act(() =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(mocks.navigate).toHaveBeenCalledWith("/workspace/project-42");
    expect(close).toHaveBeenCalled();
  });
  it("finds current canvas nodes by provider and selects them", () => {
    const input = search("postgres orders");
    expect(container.textContent).toContain("Orders DB");
    act(() =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(selectNode).toHaveBeenCalledWith("db-1");
  });
  it("navigates results with arrows and routes templates to the library", () => {
    const input = search("navigation");
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    act(() =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(mocks.navigate).toHaveBeenCalledWith("/templates");
  });
  it("shows an honest empty state", () => {
    search("nothing-matches-xyz");
    expect(container.textContent).toContain("No results for");
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(0);
  });
});
