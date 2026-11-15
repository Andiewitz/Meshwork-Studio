import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Node } from "@xyflow/react";
import {
  ListBulletIcon,
  ArrowsPointingOutIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

interface CanvasNavigationProps {
  workspaceTitle: string;
  path: { nodeId: string; label: string }[];
  nodes: Node[];
  selectedCount: number;
  disabled: boolean;
  onExit: (level: number) => void;
  onFitSelection: () => void;
  onFocusNode: (id: string) => void;
}

export function CanvasNavigation({
  workspaceTitle,
  path,
  nodes,
  selectedCount,
  disabled,
  onExit,
  onFitSelection,
  onFocusNode,
}: CanvasNavigationProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pathRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (pathRef.current)
      pathRef.current.scrollLeft = pathRef.current.scrollWidth;
  }, [path]);
  const results = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return nodes.filter(
      (node) =>
        node.type !== "junction" &&
        terms.every((term) =>
          [
            node.data?.label,
            node.type,
            node.data?.description,
            node.data?.provider,
            ...(Array.isArray(node.data?.tags) ? node.data.tags : []),
          ]
            .filter((value) => typeof value === "string")
            .join(" ")
            .toLocaleLowerCase()
            .includes(term),
        ),
    );
  }, [nodes, query]);
  return (
    <>
      <div className="absolute left-3 right-3 top-3 z-10 flex items-start justify-between gap-2 pointer-events-none">
        <nav
          ref={pathRef}
          aria-label="Canvas path"
          className="pointer-events-auto min-w-0 max-w-[70%] overflow-x-auto rounded-lg border ws-border ws-option px-2 py-1.5 text-xs ws-ink"
        >
          <ol className="flex w-max max-w-none items-center gap-1">
            <li>
              {path.length ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onExit(0)}
                  className="rounded px-1 py-0.5 ws-hover-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                >
                  {workspaceTitle}
                </button>
              ) : (
                <span aria-current="page" className="px-1">
                  {workspaceTitle}
                </span>
              )}
            </li>
            {path.map((level, index) => (
              <li
                key={`${level.nodeId}-${index}`}
                className="flex items-center gap-1"
              >
                <ChevronRightIcon
                  aria-hidden="true"
                  className="h-3 w-3 ws-muted"
                />
                {index === path.length - 1 ? (
                  <span aria-current="page" className="px-1">
                    {level.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onExit(index + 1)}
                    className="rounded px-1 py-0.5 ws-hover-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                  >
                    {level.label}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="pointer-events-auto flex shrink-0 gap-1 rounded-lg border ws-border ws-option p-1">
          <button
            type="button"
            onClick={onFitSelection}
            disabled={disabled || selectedCount === 0}
            title={
              selectedCount
                ? `Fit ${selectedCount} selected node${selectedCount === 1 ? "" : "s"}`
                : "Select nodes to fit"
            }
            aria-label="Fit selection"
            className="rounded p-1.5 ws-muted ws-hover-ink ws-hover-surface disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <ArrowsPointingOutIcon aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={disabled}
            title="Node outline"
            aria-label="Open node outline"
            className="rounded p-1.5 ws-muted ws-hover-ink ws-hover-surface disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <ListBulletIcon aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setQuery("");
        }}
      >
        <DialogContent className="workspace-dialog ws-ink border ws-border rounded-2xl w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] p-5 flex flex-col">
          <DialogTitle>Node outline</DialogTitle>
          <DialogDescription className="ws-muted">
            Find and focus a node in the current canvas:{" "}
            {path.at(-1)?.label || workspaceTitle}.
          </DialogDescription>
          <label className="text-sm ws-muted">
            Filter nodes
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, type, or tag"
              className="mt-1 block w-full rounded border ws-border ws-surface-soft ws-ink px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            />
          </label>
          <p role="status" className="text-xs ws-muted">
            {results.length} {results.length === 1 ? "node" : "nodes"}
            {results.length > 100
              ? "; showing the first 100. Filter to narrow the list."
              : ""}
          </p>
          <ul className="min-h-0 max-h-80 overflow-y-auto divide-y ws-border">
            {results.slice(0, 100).map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setQuery("");
                    onFocusNode(node.id);
                  }}
                  className="w-full rounded px-2 py-2 text-left ws-hover-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                >
                  <span className="block text-sm ws-ink truncate">
                    {typeof node.data?.label === "string" &&
                    node.data.label.trim()
                      ? node.data.label
                      : "Untitled node"}
                  </span>
                  <span className="block text-xs ws-muted truncate">
                    {node.type || "Node"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {results.length === 0 && (
            <p className="py-4 text-sm ws-muted">No nodes match this filter.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
