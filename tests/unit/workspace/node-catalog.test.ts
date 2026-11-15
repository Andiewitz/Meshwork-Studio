import { describe, expect, it } from "vitest";
import { NODE_DEFINITIONS } from "@/features/workspace/utils/nodeRegistry";
import {
  nodeTypes,
  nodeTypesList,
  NODE_DESCRIPTIONS,
  searchNodeCatalog,
} from "@/features/workspace/utils/nodeTypes";

describe("node catalog consistency", () => {
  it("registers a renderer for every persisted type", () => {
    expect(Object.keys(nodeTypes).sort()).toEqual(
      NODE_DEFINITIONS.map(({ id }) => id).sort(),
    );
    for (const definition of NODE_DEFINITIONS)
      expect(nodeTypes[definition.id]).toBeDefined();
  });
  it("derives visible palette entries and descriptions from definitions", () => {
    const entries = nodeTypesList.filter(
      ({ type }) => !type.startsWith("template:"),
    );
    const expected = NODE_DEFINITIONS.filter(({ palette }) => palette).sort(
      (a, b) => a.palette!.order - b.palette!.order,
    );
    expect(entries.map(({ type }) => type)).toEqual(
      expected.map(({ id }) => id),
    );
    for (const entry of entries) expect(entry.icon).toBeDefined();
    for (const definition of NODE_DEFINITIONS)
      if (definition.description)
        expect(NODE_DESCRIPTIONS[definition.id]).toBe(definition.description);
    expect(
      nodeTypesList.filter(({ type }) => type.startsWith("template:")),
    ).toHaveLength(6);
  });
  it("finds infrastructure roles and existing aliases without listing templates", () => {
    expect(searchNodeCatalog("firewall").map((node) => node.type)).toContain(
      "firewall",
    );
    expect(searchNodeCatalog("credential").map((node) => node.type)).toContain(
      "secrets-manager",
    );
    expect(searchNodeCatalog("postgres").map((node) => node.type)).toContain(
      "database",
    );
    expect(
      searchNodeCatalog("").some((node) => node.type.startsWith("template:")),
    ).toBe(false);
    expect(searchNodeCatalog("no-such-component-xyz")).toEqual([]);
  });
});
