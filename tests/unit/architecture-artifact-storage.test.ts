import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return {
    S3Client: class {
      send = mocks.send;
      destroy = mocks.destroy;
    },
    PutObjectCommand: class PutObjectCommand extends Command {},
    GetObjectCommand: class GetObjectCommand extends Command {},
    ListObjectsV2Command: class ListObjectsV2Command extends Command {},
    DeleteObjectsCommand: class DeleteObjectsCommand extends Command {},
  };
});
import {
  architectureArtifacts,
  closeArchitectureArtifacts,
} from "@services/canvas/db/architecture-artifacts";
const input = {
  prompt: "Plan it",
  baseSnapshot: "{}",
  plan: {
    title: "API",
    summary: "An API",
    assumptions: [],
    risks: [],
    components: [{ id: "api", type: "server", label: "API" }],
    connections: [],
  },
};
afterEach(() => {
  closeArchitectureArtifacts();
  mocks.send.mockReset();
  delete process.env.ARTIFACT_S3_BUCKET;
});
describe("architecture artifact object storage", () => {
  it("writes private project-scoped JSON containing the readable plan", async () => {
    process.env.ARTIFACT_S3_BUCKET = "private-plans";
    mocks.send.mockResolvedValue({});
    const saved = await architectureArtifacts.create("project/a", input);
    const command = mocks.send.mock.calls[0][0];
    expect(command.input.Bucket).toBe("private-plans");
    expect(command.input.Key).toBe(
      `projects/project%2Fa/plans/${saved.id}.json`,
    );
    expect(JSON.parse(command.input.Body).markdown).toContain("# API");
  });
  it("purges only objects in the requested project prefix", async () => {
    process.env.ARTIFACT_S3_BUCKET = "private-plans";
    mocks.send
      .mockResolvedValueOnce({
        Contents: [
          { Key: "projects/a/plans/one.json" },
          { Key: "projects/b/plans/other.json" },
        ],
      })
      .mockResolvedValueOnce({});
    await architectureArtifacts.purge("a");
    expect(mocks.send.mock.calls[0][0].input.Prefix).toBe("projects/a/plans/");
    expect(mocks.send.mock.calls[1][0].input.Delete.Objects).toEqual([
      { Key: "projects/a/plans/one.json" },
    ]);
  });
});
