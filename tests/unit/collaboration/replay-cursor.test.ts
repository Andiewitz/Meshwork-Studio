import { describe, expect, it } from "vitest";
import {
  createReplayCursorSigner,
  type ReplayCursorBinding,
} from "@services/collaboration/websocket/replay-cursor";

const binding: ReplayCursorBinding = {
  workspaceId: "workspace",
  userId: "user",
  sessionId: "session-hash",
  accessEpoch: "42",
  streamIncarnation: "a".repeat(40),
};
const input = { version: 1 as const, ...binding, streamId: "123-0" };

describe("replay cursor signatures", () => {
  it("accepts a signed cursor only for its original binding before expiry", () => {
    const signer = createReplayCursorSigner(Buffer.alloc(32, 7));
    const token = signer.sign(input, 1000);
    expect(signer.verify(token, binding, 1001)).toMatchObject(input);
    expect(signer.verify(token, binding, 301000)).toBeNull();
    for (const changed of [
      { workspaceId: "other" },
      { userId: "other" },
      { sessionId: "other" },
      { accessEpoch: "43" },
      { streamIncarnation: "b".repeat(40) },
    ])
      expect(signer.verify(token, { ...binding, ...changed }, 1001)).toBeNull();
  });
  it("rejects tampering, malformed tokens, missing bindings and different keys", () => {
    const signer = createReplayCursorSigner(Buffer.alloc(32, 7));
    const token = signer.sign(input, 1000);
    const [payload, signature] = token.split(".");
    const mutated = `${payload}.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;
    expect(signer.verify(mutated, binding, 1001)).toBeNull();
    expect(signer.verify(`${token}.extra`, binding, 1001)).toBeNull();
    expect(signer.verify("x".repeat(4097), binding, 1001)).toBeNull();
    expect(signer.verify(token, {} as ReplayCursorBinding, 1001)).toBeNull();
    expect(
      createReplayCursorSigner(Buffer.alloc(32, 8)).verify(
        token,
        binding,
        1001,
      ),
    ).toBeNull();
    expect(() => createReplayCursorSigner(Buffer.alloc(31))).toThrow();
  });
  it("copies the signing key and rejects invalid cursor data", () => {
    const key = Buffer.alloc(32, 7);
    const signer = createReplayCursorSigner(key);
    const token = signer.sign(input, 1000);
    key.fill(8);
    expect(signer.verify(token, binding, 1001)).not.toBeNull();
    expect(() =>
      signer.sign({ ...input, streamId: "invalid" }, 1000),
    ).toThrow();
    expect(() => signer.sign({ ...input, accessEpoch: "0" }, 1000)).toThrow();
  });
});
