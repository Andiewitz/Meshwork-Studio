import type { Edge, Node } from "@xyflow/react";
import { getNodeDimensions } from "./nodeGeometry";

export type LayoutStrategy = "flow" | "hierarchy" | "grid" | "swimlanes";
export type LayoutScope = "canvas" | "selection";

export interface LayoutResult {
  nodes: Node[];
  movedIds: string[];
  fixedIds: string[];
  warnings: string[];
  error?: string;
}

const GAP = 32;
const MAX_NODES = 1000;
const MAX_SEARCH = 5000;
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width + GAP &&
    a.x + a.width + GAP > b.x &&
    a.y < b.y + b.height + GAP &&
    a.y + a.height + GAP > b.y
  );
}

/** Pinning a descendant also fixes its ancestors so its absolute position stays put. */
function fixedNodes(nodes: Node[]): Set<string> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const fixed = new Set<string>();
  for (const node of nodes) {
    if (node.data?.layoutPinned !== true && node.draggable !== false) continue;
    let current: Node | undefined = node;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      fixed.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return fixed;
}

/** Topological levels. Cycles and anything downstream of them remain grouped. */
function graphLevels(
  nodes: Node[],
  edges: Edge[],
): { levels: Node[][]; cyclic: boolean } {
  const ids = new Set(nodes.map((node) => node.id));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    outgoing.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, indegree.get(edge.target)! + 1);
  }
  const queue = nodes
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id);
  const ranks = new Map(nodes.map((node) => [node.id, 0]));
  let cursor = 0;
  while (cursor < queue.length) {
    const id = queue[cursor++];
    for (const target of outgoing.get(id) ?? []) {
      ranks.set(target, Math.max(ranks.get(target)!, ranks.get(id)! + 1));
      const remaining = indegree.get(target)! - 1;
      indegree.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }
  const cyclic = queue.length !== nodes.length;
  if (cyclic) {
    const cycleRank = Math.max(0, ...queue.map((id) => ranks.get(id)!)) + 1;
    for (const node of nodes)
      if (indegree.get(node.id)! > 0) ranks.set(node.id, cycleRank);
  }
  const grouped = new Map<number, Node[]>();
  for (const node of nodes) {
    const rank = ranks.get(node.id)!;
    const group = grouped.get(rank) ?? [];
    group.push(node);
    grouped.set(rank, group);
  }
  return {
    levels: [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, group]) => group),
    cyclic,
  };
}

function suggestedPositions(
  nodes: Node[],
  edges: Edge[],
  strategy: Exclude<LayoutStrategy, "swimlanes">,
  origin: { x: number; y: number },
): { positions: Map<string, { x: number; y: number }>; cyclic: boolean } {
  const positions = new Map<string, { x: number; y: number }>();
  if (strategy === "grid") {
    const columns = Math.ceil(Math.sqrt(nodes.length));
    const widths = Array(columns).fill(0) as number[];
    const heights: number[] = [];
    nodes.forEach((node, index) => {
      const size = getNodeDimensions(node);
      widths[index % columns] = Math.max(widths[index % columns], size.width);
      const row = Math.floor(index / columns);
      heights[row] = Math.max(heights[row] ?? 0, size.height);
    });
    const xs = widths.map(
      (_, index) =>
        origin.x +
        widths.slice(0, index).reduce((sum, width) => sum + width + GAP, 0),
    );
    const ys = heights.map(
      (_, index) =>
        origin.y +
        heights.slice(0, index).reduce((sum, height) => sum + height + GAP, 0),
    );
    nodes.forEach((node, index) =>
      positions.set(node.id, {
        x: xs[index % columns],
        y: ys[Math.floor(index / columns)],
      }),
    );
    return { positions, cyclic: false };
  }
  const { levels, cyclic } = graphLevels(nodes, edges);
  let major = strategy === "flow" ? origin.x : origin.y;
  for (const level of levels) {
    let minor = strategy === "flow" ? origin.y : origin.x;
    let maxMajor = 0;
    for (const node of level) {
      const size = getNodeDimensions(node);
      positions.set(
        node.id,
        strategy === "flow" ? { x: major, y: minor } : { x: minor, y: major },
      );
      minor += (strategy === "flow" ? size.height : size.width) + GAP;
      maxMajor = Math.max(
        maxMajor,
        strategy === "flow" ? size.width : size.height,
      );
    }
    major += maxMajor + GAP * 3;
  }
  return { positions, cyclic };
}

function arrangeGroup(
  allNodes: Node[],
  edges: Edge[],
  candidates: Node[],
  parent: Node | undefined,
  strategy: Exclude<LayoutStrategy, "swimlanes">,
  fixed: Set<string>,
): {
  positions: Map<string, { x: number; y: number }>;
  fixedIds: string[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const fixedIds = candidates
    .filter((node) => fixed.has(node.id))
    .map((node) => node.id);
  const moving = candidates.filter((node) => !fixed.has(node.id));
  if (!moving.length) return { positions: new Map(), fixedIds, warnings };
  const movingIds = new Set(moving.map((node) => node.id));
  const siblings = allNodes.filter(
    (node) => (node.parentId ?? "") === (parent?.id ?? ""),
  );
  const occupied: Box[] = siblings
    .filter((node) => !movingIds.has(node.id))
    .map((node) => ({ ...node.position, ...getNodeDimensions(node) }));
  const origin = parent
    ? { x: 24, y: 48 }
    : {
        x: Math.min(...candidates.map((node) => node.position.x)),
        y: Math.min(...candidates.map((node) => node.position.y)),
      };
  const layout = suggestedPositions(moving, edges, strategy, origin);
  if (layout.cyclic)
    warnings.push(
      "Some connections form a cycle; those nodes and their downstream nodes are grouped rather than ordered.",
    );
  const bounds = parent ? getNodeDimensions(parent) : undefined;
  const fits = (box: Box) =>
    !bounds ||
    (box.x >= 24 &&
      box.y >= 48 &&
      box.x + box.width <= bounds.width - 24 &&
      box.y + box.height <= bounds.height - 24);
  const accepted = new Map<string, { x: number; y: number }>();
  for (const node of moving) {
    const desired = layout.positions.get(node.id)!;
    const size = getNodeDimensions(node);
    let box: Box = { ...desired, ...size };
    let attempts = 0;
    while (
      fits(box) &&
      occupied.some((other) => overlaps(box, other)) &&
      attempts++ < MAX_SEARCH
    ) {
      const hits = occupied.filter((other) => overlaps(box, other));
      if (strategy === "hierarchy")
        box.x = Math.max(...hits.map((other) => other.x + other.width + GAP));
      else
        box.y = Math.max(...hits.map((other) => other.y + other.height + GAP));
    }
    if ((!fits(box) || attempts >= MAX_SEARCH) && bounds) {
      // Search the available container area without moving fixed siblings.
      box = { x: 24, y: 48, ...size };
      attempts = 0;
      while (
        fits(box) &&
        occupied.some((other) => overlaps(box, other)) &&
        attempts++ < MAX_SEARCH
      ) {
        box.x += 24;
        if (box.x + box.width > bounds.width - 24) {
          box.x = 24;
          box.y += 24;
        }
      }
    }
    if (
      !fits(box) ||
      attempts >= MAX_SEARCH ||
      occupied.some((other) => overlaps(box, other))
    ) {
      warnings.push(
        parent
          ? `Not enough space inside ${String(parent.data?.label || parent.id)}; its nodes were left in place.`
          : "Could not find clear positions; the nodes were left in place.",
      );
      return { positions: new Map(), fixedIds, warnings };
    }
    occupied.push(box);
    accepted.set(node.id, { x: box.x, y: box.y });
  }
  return { positions: accepted, fixedIds, warnings };
}

/** Computes a proposal only. It never mutates the input graph or changes edges. */
export function arrangeCanvas(
  nodes: Node[],
  edges: Edge[],
  options: {
    strategy: LayoutStrategy;
    scope: LayoutScope;
    selectedIds?: readonly string[];
  },
): LayoutResult {
  const base: LayoutResult = {
    nodes,
    movedIds: [],
    fixedIds: [],
    warnings: [],
  };
  if (nodes.length > MAX_NODES)
    return {
      ...base,
      error: `Layout supports up to ${MAX_NODES} nodes at a time. Use a smaller canvas.`,
    };
  const selected = new Set(options.selectedIds ?? []);
  const fixed = fixedNodes(nodes);
  const positions = new Map<string, { x: number; y: number }>();
  const fixedIds = new Set<string>();
  const warnings: string[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (options.strategy === "swimlanes") {
    const lanes = nodes.filter(
      (node) =>
        node.type === "workflow-lane" &&
        (options.scope === "canvas" || selected.has(node.id)),
    );
    if (!lanes.length)
      return {
        ...base,
        error:
          options.scope === "selection"
            ? "Select one or more swimlanes."
            : "This canvas has no swimlanes.",
      };
    for (const lane of lanes) {
      const children = nodes.filter((node) => node.parentId === lane.id);
      const group = arrangeGroup(nodes, edges, children, lane, "flow", fixed);
      for (const [id, position] of group.positions) positions.set(id, position);
      group.fixedIds.forEach((id) => fixedIds.add(id));
      warnings.push(...group.warnings);
    }
  } else {
    const candidates =
      options.scope === "canvas"
        ? nodes.filter((node) => !node.parentId)
        : nodes.filter((node) => selected.has(node.id));
    if (candidates.length < 2)
      return {
        ...base,
        error:
          options.scope === "selection"
            ? "Select at least two nodes in the same container."
            : "At least two top-level nodes are needed.",
      };
    const parents = new Set(candidates.map((node) => node.parentId ?? ""));
    if (parents.size !== 1)
      return {
        ...base,
        error:
          "Select nodes from the same container; parents and their children must be arranged separately.",
      };
    const parentId = candidates[0].parentId;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parentId && !parent)
      return { ...base, error: "The selected container could not be found." };
    const group = arrangeGroup(
      nodes,
      edges,
      candidates,
      parent,
      options.strategy,
      fixed,
    );
    for (const [id, position] of group.positions) positions.set(id, position);
    group.fixedIds.forEach((id) => fixedIds.add(id));
    warnings.push(...group.warnings);
  }
  const movedIds: string[] = [];
  const result = nodes.map((node) => {
    const position = positions.get(node.id);
    if (
      !position ||
      (position.x === node.position.x && position.y === node.position.y)
    )
      return node;
    movedIds.push(node.id);
    return { ...node, position };
  });
  return {
    nodes: result,
    movedIds,
    fixedIds: [...fixedIds],
    warnings: [...new Set(warnings)],
  };
}
