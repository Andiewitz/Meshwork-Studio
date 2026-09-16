import { Node, Edge } from "@xyflow/react";

/**
 * Canonical data shapes for canvas nodes and edges.
 * These types represent the structured data stored inside @xyflow/react Node.data and Edge.data fields.
 */

export interface NodeAiData {
  summary?: string;
  notes?: string;
  lastAnalyzed?: string | null;
}

/** Data stored inside a canvas node (Node.data) */
export interface NodeData extends Record<string, unknown> {
  label?: string;
  description?: string;
  category?: string;
  /** Original unregistered component type, rendered through the generic node. */
  originalType?: string;
  tags?: string[];
  provider?: string;
  accentColor?: string;
  note?: string;
  /** Display / visual overrides stored in data (not in CSS style) */
  fontColor?: string;
  icon?: string | null;
  theme?: string;
  /** Database-type nodes: collection/table names */
  collections?: string[];
  /** K8s nodes: deployment status */
  status?: string;
  ai?: NodeAiData;
  /** Nested/sub-canvas content for drill-down nodes */
  subCanvas?: {
    nodes?: Node[];
    edges?: Edge[];
  };
}

/** Data stored inside a canvas edge (Edge.data) */
export interface EdgeData extends Record<string, unknown> {
  label?: string;
  description?: string;
  ai?: {
    notes?: string;
  };
}

/** CSS-compatible style overrides for canvas nodes (used as node.style) */
export interface NodeStyle {
  width?: number;
  height?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderRadius?: number;
  opacity?: number;
  fontSize?: number;
}
