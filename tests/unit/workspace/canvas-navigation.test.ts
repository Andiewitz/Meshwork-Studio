// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CanvasNavigation } from "@/features/workspace/components/CanvasNavigation";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

it("navigates to an ancestor and finds a node in the current canvas", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const element = document.createElement("div");
  document.body.appendChild(element);
  const root = createRoot(element);
  const onExit = vi.fn();
  const onFocusNode = vi.fn();
  const onFitSelection = vi.fn();
  await act(async () =>
    root.render(
      createElement(CanvasNavigation, {
        workspaceTitle: "Production",
        path: [
          { nodeId: "a", label: "Region" },
          { nodeId: "b", label: "Cluster" },
        ],
        nodes: [
          {
            id: "api",
            type: "service",
            position: { x: 0, y: 0 },
            data: { label: "Payments API", tags: ["billing"] },
          },
          {
            id: "db",
            type: "database",
            position: { x: 100, y: 0 },
            data: { label: "Orders" },
          },
        ],
        selectedCount: 1,
        disabled: false,
        onExit,
        onFitSelection,
        onFocusNode,
      }),
    ),
  );
  const buttons = () => [...document.querySelectorAll("button")];
  await act(async () =>
    buttons()
      .find((item) => item.textContent === "Region")!
      .click(),
  );
  expect(onExit).toHaveBeenCalledWith(1);
  await act(async () =>
    buttons()
      .find((item) => item.getAttribute("aria-label") === "Fit selection")!
      .click(),
  );
  expect(onFitSelection).toHaveBeenCalledOnce();
  await act(async () =>
    buttons()
      .find((item) => item.getAttribute("aria-label") === "Open node outline")!
      .click(),
  );
  const input = document.querySelector("input")!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, "billing");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(document.body.textContent).toContain("Payments API");
  expect(document.body.textContent).not.toContain("Orders");
  await act(async () =>
    buttons()
      .find((item) => item.textContent?.includes("Payments API"))!
      .click(),
  );
  expect(onFocusNode).toHaveBeenCalledWith("api");
  await act(async () => root.unmount());
});
