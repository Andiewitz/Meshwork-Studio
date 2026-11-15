// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    getNodes: () => [],
    getEdges: () => [],
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setNodes: vi.fn(),
    setEdges: vi.fn(),
    fitView: vi.fn(),
  }),
  useNodes: () => [],
  useEdges: () => [],
}));
vi.mock("@/features/workspace/components/ArchitecturePlans", () => ({
  ArchitecturePlans: () => null,
}));
vi.mock("@/lib/secure-fetch", () => ({
  secureFetch: vi.fn(async () => ({ ok: false })),
}));
import { WorkspaceLeftSidebar } from "@/features/workspace/components/WorkspaceLeftSidebar";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
it("shows a named chat, useful composer, full model names and a working close button", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const root = createRoot(mount);
  const onClose = vi.fn();
  await act(async () =>
    root.render(
      createElement(WorkspaceLeftSidebar, {
        isOpen: true,
        onClose,
        workspaceId: "ws",
        planDisabled: false,
        onBeforePlanApply: vi.fn(),
        onPlanApplied: vi.fn(),
      }),
    ),
  );
  expect(document.body.textContent).toContain("AI chat");
  expect(document.querySelector('select[aria-label="AI model"]')).toBeNull();
  await act(async () => {
    const trigger = document.querySelector('[aria-label="AI chat options"]')!;
    trigger.click();
  });
  expect(
    document
      .querySelector('textarea[aria-label="Message Jenkos"]')
      ?.getAttribute("placeholder"),
  ).toContain("Ask Jenkos");
  expect(
    document.querySelector('select[aria-label="AI model"]')?.textContent,
  ).toContain("Gemini 3.5 Flash Lite");
  expect(document.querySelector('[title="Chat History"]')).toBeNull();
  await act(async () =>
    document.querySelector('[aria-label="Close AI chat"]')!.click(),
  );
  expect(onClose).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});
