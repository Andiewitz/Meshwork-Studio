import { afterEach, expect, it, vi } from "vitest";
import {
  lookupCollaboratorIdentity,
  getCollaboratorProfiles,
} from "@server/auth/internal-client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("sends collaborator lookups privately and validates both responses", async () => {
  vi.stubEnv("AUTH_INTERNAL_KEY", "identity-key");
  vi.stubEnv("AUTH_SERVICE_URL", "http://127.0.0.1:8081");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ user: null }))
    .mockResolvedValueOnce(
      Response.json({
        users: [
          {
            id: "legacy-id",
            email: "u@example.com",
            name: "User",
            profileImageUrl: null,
          },
        ],
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(lookupCollaboratorIdentity("u@example.com")).resolves.toEqual({
    user: null,
  });
  expect(fetcher).toHaveBeenNthCalledWith(
    1,
    "http://127.0.0.1:8081/internal/collaborators/lookup",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ email: "u@example.com" }),
      headers: {
        "X-Internal-Key": "identity-key",
        "Content-Type": "application/json",
      },
    }),
  );
  await expect(getCollaboratorProfiles(["legacy-id"])).resolves.toMatchObject({
    users: [{ id: "legacy-id" }],
  });
  expect(fetcher).toHaveBeenNthCalledWith(
    2,
    "http://127.0.0.1:8081/internal/collaborators/profiles",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ ids: ["legacy-id"] }),
    }),
  );
});
it("rejects malformed collaborator identity responses", async () => {
  vi.stubEnv("AUTH_INTERNAL_KEY", "identity-key");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ user: { id: "id" } })),
  );
  await expect(
    lookupCollaboratorIdentity("u@example.com"),
  ).rejects.toMatchObject({ reason: "invalid_response" });
});
