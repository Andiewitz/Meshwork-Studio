import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canvasSaveDelay,
  scheduleCanvasSave,
} from "@/lib/canvas-save-scheduler";

describe("canvas save scheduling", () => {
  let page: EventTarget & { visibilityState: string };
  beforeEach(() => {
    vi.useFakeTimers();
    page = Object.assign(new EventTarget(), { visibilityState: "visible" });
    vi.stubGlobal("document", page);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("saves after the idle delay", () => {
    const save = vi.fn();
    scheduleCanvasSave(save);
    vi.advanceTimersByTime(2999);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledOnce();
  });
  it("flushes once when hidden and ignores the later timer", () => {
    const save = vi.fn();
    scheduleCanvasSave(save);
    page.dispatchEvent(new Event("visibilitychange"));
    expect(save).not.toHaveBeenCalled();
    page.visibilityState = "hidden";
    page.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(3000);
    expect(save).toHaveBeenCalledOnce();
  });
  it("does not save a cancelled or superseded snapshot", () => {
    const oldSave = vi.fn();
    const newSave = vi.fn();
    const cancel = scheduleCanvasSave(oldSave);
    cancel();
    scheduleCanvasSave(newSave);
    page.visibilityState = "hidden";
    page.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(3000);
    expect(oldSave).not.toHaveBeenCalled();
    expect(newSave).toHaveBeenCalledOnce();
  });
  it("saves within fifteen seconds during continuous edits", () => {
    const save = vi.fn();
    const firstEditAt = Date.now();
    let cancel = scheduleCanvasSave(
      save,
      canvasSaveDelay(firstEditAt, Date.now()),
    );
    for (let elapsed = 1000; elapsed < 15000; elapsed += 1000) {
      vi.advanceTimersByTime(1000);
      cancel();
      cancel = scheduleCanvasSave(
        save,
        canvasSaveDelay(firstEditAt, Date.now()),
      );
    }
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledOnce();
  });
});
