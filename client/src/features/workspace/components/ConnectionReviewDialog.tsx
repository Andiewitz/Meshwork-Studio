import React, { useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  reviewConnections,
  type ConnectionReviewRules,
} from "../utils/connectionReview";

export function ConnectionReviewDialog({
  open,
  onOpenChange,
  nodes,
  edges,
  onSelectEdge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: Node[];
  edges: Edge[];
  onSelectEdge: (edge: Edge) => void;
}) {
  const [rules, setRules] = useState<ConnectionReviewRules>({
    description: true,
    protocol: false,
    dataExchanged: false,
  });
  const findings = useMemo(
    () => reviewConnections(nodes, edges, rules),
    [nodes, edges, rules],
  );
  const enabled = Object.values(rules).some(Boolean);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="workspace-dialog ws-ink border ws-border rounded-2xl w-[calc(100%-2rem)] max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 select-text">
        <DialogTitle>Review connections</DialogTitle>
        <DialogDescription className="ws-muted">
          Optional checks for this canvas. Missing details are suggestions, and
          nothing is changed automatically.
        </DialogDescription>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold ws-ink mb-2">Checks</legend>
          {(
            [
              ["description", "Description or relationship"],
              ["protocol", "Protocol"],
              ["dataExchanged", "Data or event"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm ws-ink">
              <input
                type="checkbox"
                checked={rules[key]}
                onChange={(event) =>
                  setRules((previous) => ({
                    ...previous,
                    [key]: event.target.checked,
                  }))
                }
                className="h-4 w-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              />
              {label}
            </label>
          ))}
        </fieldset>
        <section aria-live="polite" className="border-t ws-border pt-3">
          <h3 className="text-sm font-semibold ws-ink">
            {findings.length}{" "}
            {findings.length === 1 ? "connection" : "connections"} to review
          </h3>
          {!enabled ? (
            <p className="mt-2 text-sm ws-muted">Choose at least one check.</p>
          ) : edges.length === 0 ? (
            <p className="mt-2 text-sm ws-muted">
              There are no connections on this canvas.
            </p>
          ) : findings.length === 0 ? (
            <p className="mt-2 text-sm ws-muted">
              No missing details found for the selected checks.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {findings.map((finding) => (
                <li key={finding.edgeId}>
                  <button
                    type="button"
                    onClick={() => {
                      const edge = edges.find(
                        (item) => item.id === finding.edgeId,
                      );
                      if (edge) {
                        onOpenChange(false);
                        onSelectEdge(edge);
                      }
                    }}
                    className="w-full rounded border ws-border px-3 py-2 text-left ws-hover-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                  >
                    <span className="block text-sm ws-ink break-words">
                      {finding.source} → {finding.target}
                    </span>
                    <span className="block text-xs ws-muted mt-1">
                      Missing: {finding.missing.join(", ")}
                    </span>
                    <span className="block text-xs ws-dim mt-1 break-all">
                      ID: {finding.edgeId}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
