import React, { useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  arrangeCanvas,
  type LayoutResult,
  type LayoutScope,
  type LayoutStrategy,
} from "../utils/canvasLayout";
import { getNodeDimensions } from "../utils/nodeGeometry";
import { getAbsoluteNodePosition } from "../utils/containment";

export function layoutFingerprint(
  nodes: Node[],
  edges: Edge[],
  selection: readonly string[],
): string {
  return JSON.stringify({ nodes, edges, selection: [...selection].sort() });
}

function LayoutPreview({
  nodes,
  edges,
  fixedIds,
}: {
  nodes: Node[];
  edges: Edge[];
  fixedIds: string[];
}) {
  const visible = nodes.slice(0, 120);
  if (!visible.length) return null;
  const boxes = visible.map((node) => ({
    node,
    ...getAbsoluteNodePosition(node, nodes),
    ...getNodeDimensions(node),
  }));
  const minX = Math.min(...boxes.map((box) => box.x)) - 30;
  const minY = Math.min(...boxes.map((box) => box.y)) - 30;
  const maxX = Math.max(...boxes.map((box) => box.x + box.width)) + 30;
  const maxY = Math.max(...boxes.map((box) => box.y + box.height)) + 30;
  const byId = new Map(boxes.map((box) => [box.node.id, box]));
  const fixed = new Set(fixedIds);
  return (
    <>
      <svg
        role="img"
        aria-label="Overview of proposed node positions; dashed outlines are fixed nodes"
        viewBox={`${minX} ${minY} ${Math.max(1, maxX - minX)} ${Math.max(1, maxY - minY)}`}
        className="w-full h-44 rounded border ws-border ws-surface-soft ws-muted"
      >
        {edges.map((edge) => {
          const a = byId.get(edge.source);
          const b = byId.get(edge.target);
          return a && b ? (
            <line
              key={edge.id}
              x1={a.x + a.width / 2}
              y1={a.y + a.height / 2}
              x2={b.x + b.width / 2}
              y2={b.y + b.height / 2}
              stroke="currentColor"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              opacity="0.55"
            />
          ) : null;
        })}
        {boxes.map(({ node, x, y, width, height }) => (
          <g key={node.id}>
            <title>
              {typeof node.data.label === "string" ? node.data.label : node.id}
            </title>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              rx="8"
              fill="var(--workspace-node-bg)"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={
                fixed.has(node.id) ||
                node.data.layoutPinned === true ||
                node.draggable === false
                  ? "6 3"
                  : undefined
              }
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
      </svg>
      <p className="text-xs ws-muted">
        Dashed outlines are fixed.{" "}
        {nodes.length > visible.length
          ? `Showing ${visible.length} of ${nodes.length} nodes.`
          : ""}
      </p>
    </>
  );
}

export function CanvasLayoutDialog({
  open,
  onOpenChange,
  nodes,
  edges,
  selectedIds,
  disabled,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: Node[];
  edges: Edge[];
  selectedIds: string[];
  disabled: boolean;
  onApply: (nodes: Node[], base: string, selection: string[]) => string | null;
}) {
  const [strategy, setStrategy] = useState<LayoutStrategy>("flow");
  const [scope, setScope] = useState<LayoutScope>("canvas");
  const [preview, setPreview] = useState<{
    base: string;
    selection: string[];
    result: LayoutResult;
  } | null>(null);
  const [error, setError] = useState("");
  const currentSelection = scope === "selection" ? selectedIds : [];
  const stale = Boolean(
    preview &&
    preview.base !==
      layoutFingerprint(nodes, edges, scope === "selection" ? selectedIds : []),
  );
  const fixedCount = useMemo(
    () =>
      nodes.filter(
        (node) => node.data.layoutPinned === true || node.draggable === false,
      ).length,
    [nodes],
  );
  const reset = () => {
    setPreview(null);
    setError("");
  };
  const prepare = () => {
    const selection = [...currentSelection];
    const base = layoutFingerprint(nodes, edges, selection);
    const snapshot = JSON.parse(base) as { nodes: Node[]; edges: Edge[] };
    const result = arrangeCanvas(snapshot.nodes, snapshot.edges, {
      strategy,
      scope,
      selectedIds: selection,
    });
    setPreview({ base, selection, result });
    setError(result.error ?? "");
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) reset();
        onOpenChange(value);
      }}
    >
      <DialogContent className="workspace-dialog ws-ink border ws-border rounded-2xl w-[calc(100%-2rem)] max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 select-text">
        <DialogTitle>Arrange nodes</DialogTitle>
        <DialogDescription className="ws-muted">
          Preview a layout before applying it. Pinned nodes stay in place;
          connections and node data are preserved.
        </DialogDescription>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm ws-muted">
            Layout
            <select
              aria-label="Layout"
              value={strategy}
              onChange={(event) => {
                setStrategy(event.target.value as LayoutStrategy);
                reset();
              }}
              className="block w-full rounded border ws-border ws-surface-soft ws-ink px-2 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              <option value="flow">Flow: left to right</option>
              <option value="hierarchy">Hierarchy: top to bottom</option>
              <option value="grid">Grid</option>
              <option value="swimlanes">Within swimlanes</option>
            </select>
          </label>
          <label className="space-y-1 text-sm ws-muted">
            Scope
            <select
              aria-label="Layout scope"
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as LayoutScope);
                reset();
              }}
              className="block w-full rounded border ws-border ws-surface-soft ws-ink px-2 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              <option value="canvas">Entire canvas</option>
              <option value="selection">
                Selected nodes ({selectedIds.length})
              </option>
            </select>
          </label>
        </div>
        <p className="text-xs ws-muted">
          {strategy === "swimlanes"
            ? "Arranges direct children inside swimlanes without resizing them. For selection, select the swimlanes."
            : "The entire-canvas option arranges top-level nodes. To arrange children, select nodes in the same container."}{" "}
          {fixedCount
            ? `${fixedCount} pinned or locked node${fixedCount === 1 ? "" : "s"} on this canvas.`
            : "Pin nodes in their properties to keep their positions."}
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={prepare}
          className="justify-self-start rounded border ws-border px-3 py-2 text-sm ws-ink ws-hover-surface disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          Preview layout
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        {preview && !preview.result.error && (
          <section
            aria-live="polite"
            className="space-y-2 border-t ws-border pt-3"
          >
            <p className="text-sm ws-ink">
              {preview.result.movedIds.length} nodes to move ·{" "}
              {preview.result.fixedIds.length} fixed
            </p>
            <LayoutPreview
              nodes={preview.result.nodes}
              edges={edges}
              fixedIds={preview.result.fixedIds}
            />
            {preview.result.warnings.map((warning) => (
              <p key={warning} className="text-sm ws-muted">
                {warning}
              </p>
            ))}
            {stale && (
              <p role="alert" className="text-sm text-red-400">
                The canvas or selection changed. Preview again before applying.
              </p>
            )}
          </section>
        )}
        <div className="flex justify-end gap-2 border-t ws-border pt-3">
          <button
            type="button"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            className="rounded px-3 py-2 text-sm ws-muted ws-hover-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              disabled ||
              !preview ||
              Boolean(preview.result.error) ||
              !preview.result.movedIds.length ||
              stale
            }
            onClick={() => {
              if (!preview) return;
              const failure = onApply(
                preview.result.nodes,
                preview.base,
                preview.selection,
              );
              if (failure) {
                setError(failure);
                return;
              }
              reset();
              onOpenChange(false);
            }}
            className="rounded px-3 py-2 text-sm font-semibold ws-primary disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            Apply layout
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
