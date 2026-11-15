import type { Edge, Node } from "@xyflow/react";

export interface ConnectionReviewRules {
  description: boolean;
  protocol: boolean;
  dataExchanged: boolean;
}

export interface ConnectionFinding {
  edgeId: string;
  source: string;
  target: string;
  missing: string[];
}

const hasText = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0;

/** Advisory only: never guesses facts or mutates the graph. */
export function reviewConnections(
  nodes: Node[],
  edges: Edge[],
  rules: ConnectionReviewRules,
): ConnectionFinding[] {
  const names = new Map(
    nodes.map((node) => [
      node.id,
      hasText(node.data?.label) ? String(node.data.label) : node.id,
    ]),
  );
  return edges.flatMap((edge) => {
    const missing: string[] = [];
    if (
      rules.description &&
      ![
        edge.label,
        edge.data?.label,
        edge.data?.description,
        edge.data?.relationshipType,
      ].some(hasText)
    )
      missing.push("Description or relationship");
    if (rules.protocol && !hasText(edge.data?.protocol))
      missing.push("Protocol");
    if (rules.dataExchanged && !hasText(edge.data?.dataExchanged))
      missing.push("Data or event");
    return missing.length
      ? [
          {
            edgeId: edge.id,
            source: names.get(edge.source) ?? edge.source,
            target: names.get(edge.target) ?? edge.target,
            missing,
          },
        ]
      : [];
  });
}
