// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReactFlow, type Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemNode } from "@/components/canvas/nodes/SystemNode";
import { nodeAccessibleLabel } from "@/components/canvas/nodes/nodePresentation";

const nodeTypes = { database: SystemNode };

describe("node appearance through React Flow", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  async function renderNode(node: Node) {
    await act(async () =>
      root.render(
        createElement(ReactFlow, {
          nodes: [node],
          edges: [],
          nodeTypes,
          width: 800,
          height: 600,
        }),
      ),
    );
  }
  it("displays the redesigned shape for older editor defaults without changing saved data", async () => {
    const style = {
      backgroundColor: "#4169E1",
      borderColor: "#3050B0",
      borderRadius: 8,
      opacity: 1,
      fontSize: 13,
    };
    await renderNode({
      id: "db",
      type: "database",
      position: { x: 0, y: 0 },
      width: 144,
      height: 120,
      data: {
        label: "Orders",
        fontColor: "#ffffff",
        theme: "default",
        icon: null,
      },
      style,
    });
    const title = Array.from(container.querySelectorAll("div")).find(
      (el) => el.textContent === "Orders",
    );
    expect(title).toBeTruthy();
    const surface = title!.parentElement!.parentElement!;
    expect(surface.style.backgroundColor).toBe("#dff2e5");
    expect(surface.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(style.backgroundColor).toBe("#4169E1");
  });
  it("applies custom background, border, text, size and icon from saved node fields", async () => {
    await renderNode({
      id: "db",
      type: "database",
      position: { x: 0, y: 0 },
      width: 144,
      height: 120,
      data: { label: "Orders", fontColor: "#112233", icon: "Server" },
      style: {
        backgroundColor: "#ddeeff",
        borderColor: "#123456",
        borderRadius: 20,
        fontSize: 16,
      },
    });
    const title = Array.from(container.querySelectorAll("div")).find(
      (el) => el.textContent === "Orders",
    ) as HTMLElement;
    expect(title.style.fontSize).toBe("16px");
    expect(title.parentElement?.style.color).toBe("#112233");
    const surface = title.parentElement!.parentElement!;
    expect(surface.style.backgroundColor).toBe("#ddeeff");
    expect(surface.style.borderColor).toBe("#123456");
    expect(surface.style.borderRadius).toBe("20px");
    const customIconPath = surface.querySelector("svg path")?.getAttribute("d");
    expect(customIconPath).toBeTruthy();
    await renderNode({
      id: "db",
      type: "database",
      position: { x: 0, y: 0 },
      width: 144,
      height: 120,
      data: { label: "Orders" },
    });
    const defaultIconPath = container
      .querySelector(".react-flow__node svg path")
      ?.getAttribute("d");
    expect(defaultIconPath).toBeTruthy();
    expect(customIconPath).not.toBe(defaultIconPath);
  });
  it("exposes the full description when the canvas node receives keyboard focus", async () => {
    const data = {
      label: "Orders",
      provider: "PostgreSQL",
      description: "Stores all order records",
    };
    await renderNode({
      id: "db",
      type: "database",
      position: { x: 0, y: 0 },
      width: 144,
      height: 120,
      data,
      ariaLabel: nodeAccessibleLabel("database", data),
    });
    const node = container.querySelector<HTMLElement>('[data-id="db"]')!;
    expect(node.getAttribute("aria-label")).toBe(
      "Orders. PostgreSQL. Stores all order records",
    );
    await act(async () => node.focus());
    expect(document.activeElement).toBe(node);
    expect(node.querySelector('[role="tooltip"]')?.textContent).toContain(
      "Stores all order records",
    );
  });
});
