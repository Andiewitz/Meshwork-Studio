import { describe, expect, it } from "vitest";
import { canvasSnapshotSyncSchema } from "@shared/canvas";
import {
  canApplyDiagramStarter,
  createDiagramStarter,
  STARTER_RECOMMENDATIONS,
  type DiagramStarter,
} from "@/features/workspace/utils/diagramStarters";
import {
  nodeTypesList,
  searchNodeCatalog,
} from "@/features/workspace/utils/nodeTypes";

describe("diagram starters", () => {
  it.each([
    ["architecture", ["user", "microservice", "database"]],
    [
      "workflow",
      [
        "workflow-input",
        "workflow-task",
        "workflow-decision",
        "workflow-output",
      ],
    ],
    [
      "data",
      ["data-source", "data-transform", "data-dataset", "data-destination"],
    ],
  ] as [DiagramStarter, string[]][])(
    "builds a valid editable %s starter",
    (kind, expected) => {
      let id = 0;
      const graph = createDiagramStarter(
        kind,
        { x: 20, y: 30 },
        () => `id-${++id}`,
        false,
      );
      expect(graph.nodes.map((node) => node.type)).toEqual(expected);
      expect(graph.edges).toHaveLength(expected.length - 1);
      expect(
        new Set([...graph.nodes, ...graph.edges].map((item) => item.id)).size,
      ).toBe(expected.length + graph.edges.length);
      for (let index = 0; index < graph.edges.length; index++) {
        expect(graph.edges[index]).toMatchObject({
          source: graph.nodes[index].id,
          target: graph.nodes[index + 1].id,
        });
        expect(graph.edges[index].data?.connectionKind).toBeUndefined();
      }
      expect(
        canvasSnapshotSyncSchema.safeParse({ ...graph, baseRevision: 0 })
          .success,
      ).toBe(true);
    },
  );
  it("never allows a starter on a non-empty, unavailable, nested or read-only canvas", () => {
    const valid = {
      canEdit: true,
      conflict: false,
      ready: true,
      root: true,
      idle: true,
    };
    const empty = { nodes: [], edges: [] };
    expect(canApplyDiagramStarter(empty, valid)).toBe(true);
    expect(
      canApplyDiagramStarter(
        { nodes: [{ id: "n", position: { x: 0, y: 0 }, data: {} }], edges: [] },
        valid,
      ),
    ).toBe(false);
    expect(
      canApplyDiagramStarter(
        { nodes: [], edges: [{ id: "e", source: "a", target: "b" }] },
        valid,
      ),
    ).toBe(false);
    for (const change of [
      { canEdit: false },
      { conflict: true },
      { ready: false },
      { root: false },
      { idle: false },
    ])
      expect(canApplyDiagramStarter(empty, { ...valid, ...change })).toBe(
        false,
      );
  });
  it("recommends real catalog nodes without restricting search across contexts", () => {
    for (const ids of Object.values(STARTER_RECOMMENDATIONS))
      for (const id of ids)
        expect(nodeTypesList.some((node) => node.type === id)).toBe(true);
    expect(
      searchNodeCatalog("data source").some(
        (node) => node.type === "data-source",
      ),
    ).toBe(true);
    expect(
      searchNodeCatalog("workflow").some(
        (node) => node.type === "workflow-task",
      ),
    ).toBe(true);
  });
});
