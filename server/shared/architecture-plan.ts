import { z } from "zod";

const shortText = z.string().trim().min(1).max(500);
const id = z.string().trim().min(1).max(200);

/** Provider-independent, reviewable proposal. It cannot execute delete actions. */
export const architecturePlanSchema = z
  .object({
    title: shortText,
    summary: z.string().trim().min(1).max(4000),
    assumptions: z.array(shortText).max(20),
    components: z
      .array(
        z.object({
          id,
          type: z.string().trim().min(1).max(100),
          label: shortText,
          description: z.string().trim().max(1000).optional(),
          parentId: id.optional(),
        }),
      )
      .min(1)
      .max(100),
    connections: z
      .array(
        z.object({
          source: id,
          target: id,
          label: z.string().trim().max(200).optional(),
          kind: z.enum(["sync", "async", "primary"]).optional(),
        }),
      )
      .max(200),
    risks: z.array(shortText).max(20),
  })
  .superRefine((plan, ctx) => {
    const ids = new Set<string>();
    plan.components.forEach((component, index) => {
      if (ids.has(component.id))
        ctx.addIssue({
          code: "custom",
          path: ["components", index, "id"],
          message: "Component IDs must be unique.",
        });
      ids.add(component.id);
    });
  });
export type ArchitecturePlan = z.infer<typeof architecturePlanSchema>;

export const createArchitectureArtifactSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  baseSnapshot: z.string().max(500_000),
  plan: architecturePlanSchema,
});
export type CreateArchitectureArtifact = z.infer<
  typeof createArchitectureArtifactSchema
>;

export interface ArchitectureArtifact extends CreateArchitectureArtifact {
  id: string;
  createdAt: string;
  markdown: string;
}

export function planToMarkdown(plan: ArchitecturePlan): string {
  const list = (items: string[]) =>
    items.length
      ? items.map((item) => `- ${item}`).join("\n")
      : "- None specified.";
  return [
    `# ${plan.title}`,
    plan.summary,
    "## Assumptions",
    list(plan.assumptions),
    "## Components",
    list(
      plan.components.map(
        (c) =>
          `**${c.label}** (${c.type})${c.description ? ` — ${c.description}` : ""}${c.parentId ? `; inside ${c.parentId}` : ""}`,
      ),
    ),
    "## Connections",
    list(
      plan.connections.map(
        (c) =>
          `**${c.source} → ${c.target}**${c.label ? ` — ${c.label}` : ""} (${c.kind || "sync"})`,
      ),
    ),
    "## Risks and tradeoffs",
    list(plan.risks),
  ].join("\n\n");
}
