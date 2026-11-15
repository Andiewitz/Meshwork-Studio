// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiagramStarterChooser } from "@/features/workspace/components/DiagramStarterChooser";

describe("diagram starter chooser", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });
  it("offers three editable examples and a blank option", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const element = document.createElement("div");
    document.body.appendChild(element);
    const root = createRoot(element);
    const onChoose = vi.fn();
    const onBlank = vi.fn();
    await act(async () =>
      root.render(createElement(DiagramStarterChooser, { onChoose, onBlank })),
    );
    const buttons = Array.from(element.querySelectorAll("button"));
    expect(buttons).toHaveLength(4);
    expect(element.textContent).toContain("Architecture");
    expect(element.textContent).toContain("Workflow");
    expect(element.textContent).toContain("Data pipeline");
    await act(async () => buttons[2].click());
    expect(onChoose).toHaveBeenCalledWith("data");
    await act(async () => buttons[3].click());
    expect(onBlank).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });
});
