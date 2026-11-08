import { useEffect, useRef, useState } from "react";
import { useCanvas } from "@/hooks/use-canvas";
import { getAbsoluteNodePosition } from "@/features/workspace/utils/containment";
import { getNodeDimensions } from "@/features/workspace/utils/nodeGeometry";
import { nodePresentation } from "@/components/canvas/nodes/nodePresentation";

function Diagram({ workspaceId }: { workspaceId: string }) {
  const { data, isError } = useCanvas(workspaceId);
  if (isError)
    return <span className="dashboard-muted text-xs">Preview unavailable</span>;
  if (!data)
    return <span className="dashboard-muted text-xs">Loading preview…</span>;
  const nodes = data.nodes
    .filter(
      (node) =>
        Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y),
    )
    .slice(0, 200);
  if (!nodes.length)
    return <span className="dashboard-muted text-xs">Empty canvas</span>;
  const frames = nodes.map((node) => ({
    node,
    ...getAbsoluteNodePosition(node, nodes),
    ...getNodeDimensions(node),
  }));
  const left = Math.min(...frames.map((f) => f.x));
  const top = Math.min(...frames.map((f) => f.y));
  const right = Math.max(...frames.map((f) => f.x + f.width));
  const bottom = Math.max(...frames.map((f) => f.y + f.height));
  const padding = Math.max(right - left, bottom - top) * 0.12 + 24;
  const byId = new Map(frames.map((f) => [f.node.id, f]));
  return (
    <svg
      aria-hidden="true"
      className="h-full w-full p-4"
      viewBox={`${left - padding} ${top - padding} ${right - left + padding * 2} ${bottom - top + padding * 2}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {data.edges.slice(0, 400).map((edge) => {
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target) return null;
        return (
          <line
            key={edge.id}
            x1={source.x + source.width / 2}
            y1={source.y + source.height / 2}
            x2={target.x + target.width / 2}
            y2={target.y + target.height / 2}
            className="dashboard-preview-link"
            strokeWidth={Math.max(2, padding / 20)}
          />
        );
      })}
      {frames.map(({ node, x, y, width, height }) => (
        <rect
          key={node.id}
          x={x}
          y={y}
          width={width}
          height={height}
          rx={
            Math.min(width, height) *
            (nodePresentation(node.type || "").shape === "pill" ? 0.5 : 0.15)
          }
          className={`dashboard-preview-node dashboard-preview-${nodePresentation(node.type || "").layer}`}
          strokeWidth={Math.max(2, padding / 20)}
        />
      ))}
    </svg>
  );
}

export function WorkspacePreview({ workspaceId }: { workspaceId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "150px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="absolute inset-0 flex items-center justify-center"
    >
      {visible && <Diagram workspaceId={workspaceId} />}
    </div>
  );
}
