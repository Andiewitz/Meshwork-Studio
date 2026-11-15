// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionReviewDialog } from "@/features/workspace/components/ConnectionReviewDialog";

describe("connection review dialog", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });
  it("opens an identified finding without changing the graph", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const element = document.createElement("div");
    document.body.appendChild(element);
    const root = createRoot(element);
    const edge = { id: "e1", source: "a", target: "b" };
    const onSelectEdge = vi.fn();
    const onOpenChange = vi.fn();
    await act(async () =>
      root.render(
        createElement(ConnectionReviewDialog, {
          open: true,
          onOpenChange,
          onSelectEdge,
          nodes: [
            { id: "a", position: { x: 0, y: 0 }, data: { label: "Client" } },
            { id: "b", position: { x: 1, y: 1 }, data: { label: "API" } },
          ],
          edges: [edge],
        }),
      ),
    );
    expect(document.body.textContent).toContain("Client → API");
    const button = Array.from(document.querySelectorAll("button")).find(
      (item) => item.textContent?.includes("ID: e1"),
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(onSelectEdge).toHaveBeenCalledWith(edge);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await act(async () => root.unmount());
  });
});
