// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePresence } from "@/hooks/use-presence";

vi.mock("@/auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = FakeSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  constructor() {
    FakeSocket.instances.push(this);
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  presence() {
    this.onmessage?.({ data: JSON.stringify({ type: "presence", users: [] }) });
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

describe("presence reconnection", () => {
  let root: Root;
  let container: HTMLDivElement;
  const reconnected = vi.fn();
  const disconnected = vi.fn();
  let connected = false;
  function Harness() {
    connected = usePresence(
      "workspace",
      undefined,
      undefined,
      undefined,
      undefined,
      reconnected,
      disconnected,
    ).isConnected;
    return null;
  }
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    FakeSocket.instances = [];
    reconnected.mockClear();
    disconnected.mockClear();
    container = document.createElement("div");
    root = createRoot(container);
    act(() => root.render(createElement(Harness)));
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("reports connected after room join and warns only after a rejoin", () => {
    const first = FakeSocket.instances[0];
    act(() => first.open());
    expect(connected).toBe(false);
    act(() => first.presence());
    expect(connected).toBe(true);
    expect(reconnected).not.toHaveBeenCalled();
    act(() => first.close(1013));
    expect(connected).toBe(false);
    expect(disconnected).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(1000));
    const second = FakeSocket.instances[1];
    act(() => second.open());
    expect(connected).toBe(false);
    act(() => second.presence());
    expect(connected).toBe(true);
    expect(reconnected).toHaveBeenCalledOnce();
  });
});
