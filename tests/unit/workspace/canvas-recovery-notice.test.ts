// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CanvasRecoveryNotice } from "@/features/workspace/components/CanvasRecoveryNotice";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
it("keeps the draft available when checking the saved version fails", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const root = createRoot(mount);
  const onExport = vi.fn();
  const onLoadSaved = vi.fn(
    async () => "Could not reach the saved version. Your draft is still here.",
  );
  await act(async () =>
    root.render(
      createElement(CanvasRecoveryNotice, {
        disabled: false,
        onExport,
        onLoadSaved,
      }),
    ),
  );
  const button = (label: string) =>
    [...document.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === label,
    )!;
  await act(async () => button("Review").click());
  await act(async () => button("Export draft").click());
  expect(onExport).toHaveBeenCalledOnce();
  await act(async () => button("Load saved version").click());
  expect(onLoadSaved).not.toHaveBeenCalled();
  await act(async () => button("Discard and reload").click());
  expect(onLoadSaved).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "draft is still here",
  );
  expect(button("Export draft")).toBeDefined();
  await act(async () => root.unmount());
});
