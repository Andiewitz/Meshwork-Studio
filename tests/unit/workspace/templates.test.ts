import { describe, it, expect } from "vitest";
import { PRELOADED_TEMPLATES } from "../../../client/src/features/workspace/utils/preloadedTemplates";
import { insertWorkspaceSchema } from "../../../shared/schema";

describe("Preloaded Templates Validation", () => {
  it("should export exactly 6 templates", () => {
    expect(PRELOADED_TEMPLATES).toHaveLength(6);
  });

  describe("Template Titles", () => {
    PRELOADED_TEMPLATES.forEach((template) => {
      it(`should pass workspace schema validation for template: "${template.title}"`, () => {
        // When we create a workspace from a template, we pass these fields
        const mockWorkspacePayload = {
          title: template.title,
          description: template.description,
          type: "architecture",
          groups: [],
          tags: [template.category],
        };

        // The schema should parse it successfully without throwing a ZodError
        const result = insertWorkspaceSchema.safeParse(mockWorkspacePayload);

        if (!result.success) {
          console.error(
            `Validation failed for "${template.title}":`,
            result.error.format(),
          );
        }

        expect(result.success).toBe(true);
      });

      it(`should have a title length <= 16 chars: "${template.title}"`, () => {
        expect(template.title.length).toBeLessThanOrEqual(16);
      });

      it(`should only contain alphanumeric characters, spaces, hyphens, and underscores: "${template.title}"`, () => {
        const titleRegex = /^[a-zA-Z0-9\-_\s]+$/;
        expect(titleRegex.test(template.title)).toBe(true);
      });
    });
  });

  describe("Template Structure", () => {
    PRELOADED_TEMPLATES.forEach((template) => {
      it(`should have valid nodes and edges for template: "${template.title}"`, () => {
        expect(template.nodes).toBeInstanceOf(Array);
        expect(template.edges).toBeInstanceOf(Array);
        expect(template.nodes.length).toBeGreaterThan(0);

        // Each node should have an id, type, position, and data
        template.nodes.forEach((node) => {
          expect(node).toHaveProperty("id");
          expect(node).toHaveProperty("type");
          expect(node).toHaveProperty("position");
          expect(node).toHaveProperty("data");
        });

        // Each edge should have an id, source, and target
        template.edges.forEach((edge) => {
          expect(edge).toHaveProperty("id");
          expect(edge).toHaveProperty("source");
          expect(edge).toHaveProperty("target");
        });
      });
    });
  });
});
