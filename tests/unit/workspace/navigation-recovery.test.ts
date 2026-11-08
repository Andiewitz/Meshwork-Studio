// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PageErrorBoundary } from "@/components/ui/page-error-boundary";
import { isChunkError, retryStaleChunkOnce } from "@/lib/chunk-recovery";

function Broken(): React.ReactNode {
  throw new Error("page crashed");
}
function Healthy() {
  return React.createElement("p", null, "Page is available");
}

describe.each([ErrorBoundary, PageErrorBoundary])(
  "navigation recovery",
  (Boundary) => {
    let container: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      vi.stubGlobal("React", React);
      vi.spyOn(console, "error").mockImplementation(() => {});
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
    });
    afterEach(() => {
      act(() => root.unmount());
      container.remove();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });
    it("shows a recovery action after a crash and opens a healthy page when the route changes", () => {
      act(() =>
        root.render(
          React.createElement(
            Boundary,
            { resetKey: "/broken" },
            React.createElement(Broken),
          ),
        ),
      );
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
      expect(container.textContent).toContain("Try again");
      act(() =>
        root.render(
          React.createElement(
            Boundary,
            { resetKey: "/home" },
            React.createElement(Healthy),
          ),
        ),
      );
      expect(container.textContent).toContain("Page is available");
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });
    it("retries a recovered page on the same route", () => {
      let fails = true;
      function Intermittent() {
        if (fails) throw new Error("transient");
        return React.createElement(Healthy);
      }
      act(() =>
        root.render(
          React.createElement(
            Boundary,
            { resetKey: "/home" },
            React.createElement(Intermittent),
          ),
        ),
      );
      fails = false;
      const retry = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.includes("Try again"),
      );
      expect(retry).toBeDefined();
      act(() => retry!.click());
      expect(container.textContent).toContain("Page is available");
    });
  },
);

describe("stale asset recovery", () => {
  it("recognizes browser chunk loading errors without treating normal errors as stale assets", () => {
    expect(
      isChunkError(new Error("Failed to fetch dynamically imported module")),
    ).toBe(true);
    expect(isChunkError(new Error("Importing a module script failed"))).toBe(
      true,
    );
    expect(isChunkError(new Error("page crashed"))).toBe(false);
  });
  it("does not reload for normal application errors", () => {
    sessionStorage.clear();
    retryStaleChunkOnce(new Error("page crashed"));
    expect(sessionStorage.length).toBe(0);
  });
  it("does not repeatedly reload if a chunk still fails after a recent reload", () => {
    sessionStorage.setItem("meshwork-chunk-reload-at", String(Date.now()));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    retryStaleChunkOnce(
      new Error("Failed to fetch dynamically imported module"),
    );
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
    sessionStorage.clear();
  });
});
