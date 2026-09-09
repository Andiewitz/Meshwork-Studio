import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  ClientDisconnectedError,
  createProviderAbortScope,
  ProviderTimeoutError,
} from "@services/ai/providers/runtime";

function fakeRequestResponse() {
  return {
    req: new EventEmitter() as Request,
    res: new EventEmitter() as Response,
  };
}

describe("AI provider abort scope", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.AI_PROVIDER_TIMEOUT_MS;
  });

  it("cancels the upstream provider call when the client disconnects", () => {
    const { req, res } = fakeRequestResponse();
    const scope = createProviderAbortScope(req, res);

    req.emit("aborted");

    expect(scope.signal.aborted).toBe(true);
    expect(scope.signal.reason).toBeInstanceOf(ClientDisconnectedError);
    scope.dispose();
  });

  it("enforces the configured provider deadline", () => {
    vi.useFakeTimers();
    process.env.AI_PROVIDER_TIMEOUT_MS = "5000";
    const { req, res } = fakeRequestResponse();
    const scope = createProviderAbortScope(req, res);

    vi.advanceTimersByTime(5_000);

    expect(scope.signal.aborted).toBe(true);
    expect(scope.signal.reason).toBeInstanceOf(ProviderTimeoutError);
    scope.dispose();
  });

  it("removes listeners and the timer when the request completes", () => {
    vi.useFakeTimers();
    const { req, res } = fakeRequestResponse();
    const scope = createProviderAbortScope(req, res);
    scope.dispose();

    res.emit("close");
    vi.advanceTimersByTime(90_000);

    expect(scope.signal.aborted).toBe(false);
  });
});
