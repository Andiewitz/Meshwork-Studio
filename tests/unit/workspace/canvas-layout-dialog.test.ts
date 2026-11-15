// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CanvasLayoutDialog } from "@/features/workspace/components/CanvasLayoutDialog";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

it("previews a layout, prevents applying a stale preview, and applies a refreshed one", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const element = document.createElement("div");
  document.body.appendChild(element);
  const root = createRoot(element);
  const onApply = vi.fn(() => null);
  const onOpenChange = vi.fn();
  const nodes = [
    { id: "a", position: { x: 0, y: 0 }, data: { label: "A" } },
    { id: "b", position: { x: 5, y: 5 }, data: { label: "B" } },
  ];
  const render = (currentNodes: typeof nodes) =>
    root.render(
      createElement(CanvasLayoutDialog, {
        open: true,
        onOpenChange,
        nodes: currentNodes,
        edges: [],
        selectedIds: [],
        disabled: false,
        onApply,
      }),
    );
  const button = (name: string) =>
    [...document.querySelectorAll("button")].find((item) =>
      item.textContent?.includes(name),
    )!;
  await act(async () => render(nodes));
  await act(async () => button("Preview layout").click());
  expect(button("Apply layout").disabled).toBe(false);
  const changed = [nodes[0], { ...nodes[1], position: { x: 30, y: 20 } }];
  await act(async () => render(changed));
  expect(document.body.textContent).toContain("canvas or selection changed");
  expect(button("Apply layout").disabled).toBe(true);
  await act(async () => button("Preview layout").click());
  await act(async () => button("Apply layout").click());
  expect(onApply).toHaveBeenCalledOnce();
  expect(onOpenChange).toHaveBeenCalledWith(false);
  await act(async () => root.unmount());
});
