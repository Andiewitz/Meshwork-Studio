// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StreamingText from "@/components/ui/streaming-text";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("reveals the message and notifies its parent after completion", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onComplete = vi.fn();
  await act(async () =>
    root.render(
      React.createElement(StreamingText, {
        content: "Diagram ready",
        isStreaming: true,
        onComplete,
      }),
    ),
  );
  expect(onComplete).not.toHaveBeenCalled();
  for (let index = 0; index < 4; index++)
    await act(async () => vi.advanceTimersByTime(60));
  expect(container.textContent).toContain("Diagram ready");
  expect(onComplete).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
  container.remove();
});
