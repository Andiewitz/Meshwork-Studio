import { useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import ReactMarkdown from "react-markdown";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useEdges, useNodes, useReactFlow } from "@xyflow/react";
import { secureFetch } from "@/lib/secure-fetch";
import {
  planToMarkdown,
  type ArchitectureArtifact,
  type CreateArchitectureArtifact,
} from "@shared/architecture-plan";
import {
  canvasFingerprint,
  generateArchitecturePlan,
  validatePlanGraph,
} from "../agent/architecturePlanner";
import { executeCanvasToolCalls } from "../agent/tools/canvasToolExecutor";

export function ArchitecturePlans({
  workspaceId,
  prompt,
  model,
  disabled,
  onBeforeApply,
  onApplied,
}: {
  workspaceId: string;
  prompt: string;
  model: string;
  disabled: boolean;
  onBeforeApply: () => void;
  onApplied: (
    result: ReturnType<typeof executeCanvasToolCalls>,
    oldNodes: Node[],
    oldEdges: Edge[],
  ) => void;
}) {
  const { getNodes, getEdges, getViewport, setNodes, setEdges, fitView } =
    useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<CreateArchitectureArtifact | null>(null);
  const [artifact, setArtifact] = useState<ArchitectureArtifact | null>(null);
  const [saved, setSaved] = useState<{ id: string; createdAt: string }[]>([]);
  const path = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/architecture-plans`;
  const stale = Boolean(
    artifact && artifact.baseSnapshot !== canvasFingerprint(nodes, edges),
  );
  async function readResponse(response: Response) {
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message || `Request failed (${response.status}).`);
    return data;
  }
  async function refresh() {
    setSaved(await readResponse(await secureFetch(path)));
  }
  async function save(value: CreateArchitectureArtifact) {
    const savedPlan = await readResponse(
      await secureFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      }),
    );
    setArtifact(savedPlan);
    setDraft(null);
    try {
      await refresh();
    } catch {
      /* The saved plan remains available. */
    }
  }
  async function generate() {
    if (!prompt.trim() || disabled) return;
    setOpen(true);
    setBusy(true);
    setError("");
    setDraft(null);
    setArtifact(null);
    try {
      const currentNodes = getNodes();
      const currentEdges = getEdges();
      const baseSnapshot = canvasFingerprint(currentNodes, currentEdges);
      if (baseSnapshot.length > 500000)
        throw new Error("This canvas is too large to create a plan.");
      const plan = await generateArchitecturePlan(
        prompt,
        model,
        currentNodes,
        currentEdges,
      );
      const value = { prompt, baseSnapshot, plan };
      setDraft(value);
      await save(value);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create the plan.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function showSaved() {
    setOpen(true);
    setBusy(true);
    setError("");
    try {
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load plans.");
    } finally {
      setBusy(false);
    }
  }
  async function load(id: string) {
    setBusy(true);
    setError("");
    try {
      setArtifact(
        await readResponse(
          await secureFetch(`${path}/${encodeURIComponent(id)}`),
        ),
      );
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the plan.");
    } finally {
      setBusy(false);
    }
  }
  function apply() {
    if (!artifact || disabled) return;
    const currentNodes = getNodes();
    const currentEdges = getEdges();
    try {
      if (
        artifact.baseSnapshot !== canvasFingerprint(currentNodes, currentEdges)
      )
        throw new Error(
          "The canvas changed since this plan was created. Create a fresh plan before applying it.",
        );
      validatePlanGraph(artifact.plan, currentNodes);
      const viewport = getViewport();
      const center = {
        x: (-viewport.x + window.innerWidth / 2) / viewport.zoom,
        y: (-viewport.y + window.innerHeight / 2) / viewport.zoom,
      };
      const result = executeCanvasToolCalls(
        currentNodes,
        currentEdges,
        [
          {
            action: "add",
            nodes: artifact.plan.components,
            edges: artifact.plan.connections,
          },
        ],
        center,
      );
      if (!result.applied) throw new Error("The plan could not be applied.");
      onBeforeApply();
      setNodes(result.nodes);
      setEdges(result.edges);
      onApplied(result, currentNodes, currentEdges);
      setArtifact(null);
      setOpen(false);
      setTimeout(() => fitView({ duration: 500, padding: 0.2 }), 100);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not apply the plan.",
      );
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={() => void showSaved()}
        className="h-7 px-2 rounded-full ws-muted ws-hover-ink text-[11px]"
        title="Open saved architecture plans"
      >
        Plans
      </button>
      <button
        type="button"
        onClick={() => void generate()}
        disabled={!prompt.trim() || disabled || busy}
        className="h-7 px-3 rounded-full ws-surface-soft border ws-border ws-ink text-[11px] disabled:opacity-30"
      >
        Plan
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="ws-surface-soft ws-ink border ws-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col p-5 gap-3 select-text">
          <div className="flex justify-between items-center">
            <DialogTitle className="text-lg font-semibold">
              Architecture plans
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm ws-muted">
            Review the plan before adding anything to your canvas.
          </DialogDescription>
          {busy && (
            <p role="status" className="text-sm">
              Working on your plan…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          {saved.length > 0 && (
            <label className="text-sm">
              Saved plans{" "}
              <select
                className="ml-2 ws-surface-soft ws-ink border ws-border rounded p-1"
                value={artifact?.id || ""}
                onChange={(e) => {
                  if (e.target.value) void load(e.target.value);
                }}
              >
                <option value="">Choose a plan</option>
                {saved.map((item) => (
                  <option key={item.id} value={item.id}>
                    {new Date(item.createdAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(artifact || draft) && (
            <div className="break-words overflow-auto flex-1 min-h-0 rounded-lg border ws-border p-4 text-sm leading-relaxed [&_h1]:font-semibold [&_h1]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_li]:ml-4 [&_li]:list-disc">
              <ReactMarkdown>
                {artifact?.markdown || planToMarkdown(draft!.plan)}
              </ReactMarkdown>
            </div>
          )}
          {draft && (
            <div>
              <p className="text-sm">This draft has not been saved yet.</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void save(draft)
                    .catch((err) => setError(err.message))
                    .finally(() => setBusy(false));
                }}
                className="mt-2 px-3 py-1 rounded ws-primary"
              >
                Retry save
              </button>
            </div>
          )}
          {artifact && (
            <div className="flex items-center justify-between gap-2">
              {stale ? (
                <p className="text-sm ws-muted">
                  Canvas changed. Create a new plan to apply it.
                </p>
              ) : (
                <p className="text-sm ws-muted">Saved to this project.</p>
              )}
              <button
                type="button"
                onClick={apply}
                disabled={stale || busy || disabled}
                className="px-4 py-2 rounded-lg ws-primary disabled:opacity-40"
              >
                Apply to canvas
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
