// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  WorkspaceHeader,
  type WorkspaceHeaderProps,
} from "@/features/workspace/components/WorkspaceHeader";
vi.mock("@/features/workspace/components/WorkspaceMembers", () => ({
  WorkspaceMembers: () => null,
}));
vi.mock("@/features/workspace/components/CollaboratorsDialog", () => ({
  CollaboratorsDialog: () => null,
}));
afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
it("keeps one project title and provides actions through the project menu", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  const onArrangeNodes = vi.fn();
  const handleExportPng = vi.fn();
  const noOp = vi.fn();
  const props: WorkspaceHeaderProps = {
    theme: "dark",
    onToggleTheme: noOp,
    onOpenSearch: noOp,
    onReviewConnections: noOp,
    onArrangeNodes,
    arrangeDisabled: false,
    workspace: { title: "Payments", userId: "u" },
    workspaceId: "ws",
    user: { id: "u" },
    userRole: "workspace-owner",
    canEdit: true,
    canManage: true,
    canDelete: true,
    saveStatus: "saved",
    isSimulating: false,
    setIsSimulating: noOp,
    undo: noOp,
    redo: noOp,
    isSidebarOpen: false,
    setIsSidebarOpen: noOp,
    collaborators: [],
    handleExportPng,
    handleExportSvg: noOp,
    handleExportJson: noOp,
    handleImportJson: noOp,
    handleDuplicate: noOp,
    handleDeleteWorkspace: noOp,
    handleRename: noOp,
    openSettings: noOp,
    snapToGrid: false,
    setSnapToGrid: noOp,
    gridSize: 20,
    setGridSize: noOp,
    hasArrow: false,
    setHasArrow: noOp,
    edgeType: "step",
    setEdgeType: noOp,
    edgeStyle: "solid",
    setEdgeStyle: noOp,
    bgVariant: "dots",
    setBgVariant: noOp,
  };
  await act(async () => root.render(createElement(WorkspaceHeader, props)));
  expect(
    [...document.querySelectorAll(".workspace-floating-title")].map(
      (e) => e.textContent,
    ),
  ).toEqual(["Payments"]);
  expect(document.body.textContent).not.toContain("Upgrade");
  expect(document.body.textContent).not.toContain("Publish");
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Project menu"]')!
      .click(),
  );
  expect(document.body.textContent).toContain("Export as PNG");
  const arrange = [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Arrange nodes",
  )!;
  await act(async () => arrange.click());
  expect(onArrangeNodes).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});
