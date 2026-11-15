import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  SparklesIcon,
  CpuChipIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  ArrowUpRightIcon,
  TrashIcon,
  CheckIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
import { LuPlus, LuX } from "react-icons/lu";
import { useReactFlow, useNodes, useEdges } from "@xyflow/react";
import StreamingText from "@/components/ui/streaming-text";
import {
  runJenkosAgent,
  JenkosAgentMessage,
} from "@/features/workspace/agent/jenkosAgent";
import { executeCanvasToolCalls } from "@/features/workspace/agent/tools/canvasToolExecutor";
import {
  canvasMatchesPreview,
  describeCanvasChanges,
  type CanvasChangePreview,
} from "@/features/workspace/agent/tools/canvasChangePreview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ArchitecturePlans } from "./ArchitecturePlans";
import type { Node, Edge } from "@xyflow/react";

const DEFAULT_SUGGESTIONS = [
  "Add a Redis caching layer to the backend",
  "Design a secure AWS VPC with public & private subnets",
  "Set up a high-availability PostgreSQL cluster",
  "Build an event-driven Kafka stream processing pipeline",
];

const AVAILABLE_MODELS = [
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", provider: "Google" },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash Lite",
    provider: "Google",
  },
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", provider: "Google" },
  { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash", provider: "Google" },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { id: "gpt-oss-120b", name: "GPT OSS 120B", provider: "Meshwork" },
];

const CATEGORY_ORDER = ["Core", "More", "Kubernetes", "Templates"];

export interface WorkspaceLeftSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  planDisabled: boolean;
  onBeforePlanApply: (snapshot?: { nodes: Node[]; edges: Edge[] }) => void;
  onPlanApplied: (
    result: ReturnType<typeof executeCanvasToolCalls>,
    oldNodes: Node[],
    oldEdges: Edge[],
  ) => void;
}

export function WorkspaceLeftSidebar({
  isOpen,
  onClose,
  workspaceId,
  planDisabled,
  onBeforePlanApply,
  onPlanApplied,
}: WorkspaceLeftSidebarProps) {
  const [messages, setMessages] = useState<JenkosAgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState("Consulting Jenkos...");
  const [isDesigning, setIsDesigning] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gemini-3.5-flash");
  const [editScope, setEditScope] = useState<"canvas" | "selection">("canvas");
  const [pendingChange, setPendingChange] = useState<{
    workspaceId: string;
    base: string;
    result: ReturnType<typeof executeCanvasToolCalls>;
    preview: CanvasChangePreview;
    message: JenkosAgentMessage;
    scope: "canvas" | "selection";
  } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const activeWorkspaceRef = useRef(workspaceId);
  activeWorkspaceRef.current = workspaceId;
  const editDisabledRef = useRef(planDisabled);
  editDisabledRef.current = planDisabled;
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { setNodes, setEdges, fitView, getNodes, getEdges, getViewport } =
    useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();

  const cancelPreview = () => {
    setPendingChange(null);
    setPreviewError("");
    setMessages((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "AI changes were cancelled. The canvas was not changed.",
      },
    ]);
  };
  const applyPreview = () => {
    if (!pendingChange) return;
    const latestNodes = getNodes();
    const latestEdges = getEdges();
    if (
      editDisabledRef.current ||
      activeWorkspaceRef.current !== pendingChange.workspaceId
    ) {
      setPreviewError("Editing is unavailable. No changes were applied.");
      return;
    }
    if (!canvasMatchesPreview(pendingChange.base, latestNodes, latestEdges)) {
      setPreviewError(
        "The canvas changed since this preview was created. Cancel and ask again to review an updated proposal.",
      );
      return;
    }
    onBeforePlanApply({ nodes: latestNodes, edges: latestEdges });
    setNodes(pendingChange.result.nodes);
    setEdges(pendingChange.result.edges);
    onPlanApplied(pendingChange.result, latestNodes, latestEdges);
    setMessages((previous) => [
      ...previous,
      { ...pendingChange.message, appliedToCanvas: true },
    ]);
    setPendingChange(null);
    setPreviewError("");
    setTimeout(() => fitView({ duration: 700, padding: 0.2 }), 100);
  };

  useEffect(() => {
    if (!isOpen) return;
    setIsLoadingSuggestions(true);
    const timer = setTimeout(async () => {
      try {
        const { secureFetch } = await import("@/lib/secure-fetch");
        const response = await secureFetch("/api/v1/ai/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canvas: { nodes, edges } }),
        });
        if (response.ok) {
          const data = (await response.json()) as string[];
          if (Array.isArray(data) && data.length > 0) {
            setSuggestions(data);
          }
        }
      } catch {
        // suggestions fallback to defaults
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 400);
    return () => clearTimeout(timer);
    // Suggestions are advisory and provider-backed. Request them when the panel
    // opens, not for every canvas edit; users can reopen the panel for a refresh.
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(
        () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    }
  }, [messages, isOpen]);

  const executePrompt = useCallback(
    async (userPrompt: string, modelOverride?: string) => {
      if (!userPrompt.trim()) return;

      const modelToUse = modelOverride || selectedModel;
      const isArchitectureTask =
        /design|create|build|add|connect|attach|draw|architecture|system|app|generate|make|put|update|delete|remove/i.test(
          userPrompt,
        );

      const userMsg: JenkosAgentMessage = {
        id: Date.now().toString(),
        role: "user",
        content: userPrompt,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      const viewport = getViewport();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const centerX = Math.round((-viewport.x + vw / 2) / viewport.zoom);
      const centerY = Math.round((-viewport.y + vh / 2) / viewport.zoom);

      setIsLoading(true);
      setIsDesigning(isArchitectureTask);
      setAgentStatus("Consulting Jenkos...");

      if (isArchitectureTask) {
        window.dispatchEvent(
          new CustomEvent("jenkos:designing", {
            detail: { active: true, x: centerX, y: centerY },
          }),
        );
      }

      try {
        const currentNodes = getNodes();
        const currentEdges = getEdges();
        const selectionScope =
          editScope === "selection"
            ? {
                nodeIds: currentNodes
                  .filter((node) => node.selected)
                  .map((node) => node.id),
                edgeIds: currentEdges
                  .filter((edge) => edge.selected)
                  .map((edge) => edge.id),
              }
            : undefined;
        if (
          selectionScope &&
          !selectionScope.nodeIds.length &&
          !selectionScope.edgeIds.length
        ) {
          throw new Error(
            "Select at least one node or connection, or change the scope to entire canvas.",
          );
        }
        const initialCanvas = JSON.stringify({
          nodes: currentNodes,
          edges: currentEdges,
        });

        const agentResult = await runJenkosAgent({
          userPrompt,
          history: messages,
          currentNodes,
          currentEdges,
          selectionScope,
          viewportCenter: { x: centerX, y: centerY },
          model: modelToUse,
          onStatusUpdate: (status) => setAgentStatus(status),
        });

        if (agentResult.canvasResult?.applied) {
          if (
            editDisabledRef.current ||
            activeWorkspaceRef.current !== workspaceId
          )
            throw new Error(
              "Editing is unavailable. No AI changes were applied.",
            );
          const latestNodes = getNodes();
          const latestEdges = getEdges();
          const operations = agentResult.message.toolCalls?.map(
            (toolCall) => toolCall.args,
          );
          const canvasChangedWhileWaiting =
            initialCanvas !==
            JSON.stringify({ nodes: latestNodes, edges: latestEdges });
          if (canvasChangedWhileWaiting) {
            throw new Error(
              "The canvas changed while the diagram was being generated. No changes were applied; please try again.",
            );
          }
          const canvasResult = agentResult.canvasResult;
          if (!canvasResult.applied)
            throw new Error("The AI could not apply this change.");
          const preview = describeCanvasChanges(
            latestNodes,
            latestEdges,
            canvasResult.nodes,
            canvasResult.edges,
            operations,
          );
          if (preview.requiresReview) {
            setPreviewError("");
            setPendingChange({
              workspaceId,
              base: initialCanvas,
              result: canvasResult,
              preview,
              message: agentResult.message,
              scope: selectionScope ? "selection" : "canvas",
            });
            return;
          }
          onBeforePlanApply({ nodes: latestNodes, edges: latestEdges });
          setNodes(canvasResult.nodes);
          setEdges(canvasResult.edges);
          onPlanApplied(canvasResult, latestNodes, latestEdges);
          setTimeout(() => fitView({ duration: 700, padding: 0.2 }), 100);
        }

        const newMsg = agentResult.message;
        setStreamingMessageId(newMsg.id);
        setMessages((prev) => [...prev, newMsg]);
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : "";
        let errorMessage = "An unexpected error occurred.";
        if (errMsg.includes("key") || errMsg.includes("API")) {
          errorMessage =
            "No API key configured. Please ensure your provider API key is set.";
        } else if (
          errMsg.includes("429") ||
          errMsg.toLowerCase().includes("rate limit")
        ) {
          errorMessage =
            "Rate limit exceeded. Please try again in a few moments.";
        } else if (errMsg) {
          errorMessage = errMsg;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `⚠️ **System Error**\n\n${errorMessage}`,
          },
        ]);
      } finally {
        setIsLoading(false);
        setIsDesigning(false);
        window.dispatchEvent(
          new CustomEvent("jenkos:designing", { detail: { active: false } }),
        );
      }
    },
    [
      getNodes,
      getEdges,
      getViewport,
      messages,
      editScope,
      workspaceId,
      onBeforePlanApply,
      onPlanApplied,
      selectedModel,
      setEdges,
      setNodes,
      fitView,
    ],
  );

  useEffect(() => {
    const autoPrompt =
      localStorage.getItem("meshwork_auto_trigger_jenkos") ||
      localStorage.getItem("meshwork_auto_trigger_mosh");
    const autoModel = localStorage.getItem("meshwork_auto_trigger_model");
    if (autoPrompt) {
      localStorage.removeItem("meshwork_auto_trigger_jenkos");
      localStorage.removeItem("meshwork_auto_trigger_mosh");
      localStorage.removeItem("meshwork_auto_trigger_model");
      if (autoModel) setSelectedModel(autoModel);
      const timer = setTimeout(() => {
        void executePrompt(autoPrompt, autoModel || undefined);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [executePrompt]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    await executePrompt(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="workspace-assistant h-full flex flex-col overflow-hidden select-none">
      <div className="assistant-header">
        <div>
          <p className="assistant-title">AI chat</p>
          <p className="assistant-subtitle">Jenkos assistant</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI chat"
          title="Close AI chat"
          className="assistant-icon-button"
        >
          <LuX aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {/* ── Jenkos AI Co-pilot (always-on, no tabs) ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Tiny clear button */}
        {messages.length > 0 && (
          <div className="px-3 pt-2 flex justify-end">
            <button
              onClick={() => setMessages([])}
              className="text-[11px] ws-dim hover:text-red-400 flex items-center gap-1 transition-colors"
            >
              <TrashIcon className="w-2.5 h-2.5" />
              Clear
            </button>
          </div>
        )}

        {/* Chat Messages Feed */}
        <div className="assistant-feed flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/[0.08]">
          {/* Top action icons: reverse clock (history) and plus (new chat) */}
          <div className="assistant-section-heading">
            <span>Conversation</span>

            <button
              type="button"
              onClick={() => setMessages([])}
              className="assistant-icon-button"
              title="New Chat"
              aria-label="New chat"
            >
              <LuPlus className="w-4 h-4" />
            </button>
          </div>

          {messages.length === 0 && (
            <div className="workspace-assistant-intro assistant-intro">
              <div className="assistant-intro-heading">
                <div className="assistant-avatar">
                  <CpuChipIcon className="w-4 h-4 ws-ink" />
                </div>
                <div>
                  <p className="assistant-intro-title">
                    What are you building?
                  </p>
                  <p className="assistant-intro-copy">
                    Describe a system or ask a question about your canvas.
                  </p>
                </div>
              </div>

              {/* Suggestions as border-b list */}
              <div className="assistant-suggestions">
                {suggestions.map((s, sIdx) => (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => {
                      setInput(s);
                      textareaRef.current?.focus();
                    }}
                    className="assistant-suggestion"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 ws-dim"
                    >
                      <path d="M9 10l-5 5 5 5" />
                      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                    </svg>
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {msg.role === "user" ? (
                <div className="flex justify-end">
                  <div className="workspace-user-message max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ws-ink">
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  </div>
                </div>
              ) : (
                /* Assistant — no bubble */
                <div className="flex gap-2">
                  <div className="w-5 h-5 rounded-md ws-surface-soft border ws-border flex items-center justify-center shrink-0 mt-0.5 ws-ink">
                    <CpuChipIcon className="w-3 h-3" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <StreamingText
                      content={msg.content}
                      isStreaming={msg.id === streamingMessageId}
                      onComplete={() => setStreamingMessageId(null)}
                      onRetry={() => {
                        const prevUserMsg = messages
                          .slice(0, idx)
                          .reverse()
                          .find((m) => m.role === "user");
                        if (prevUserMsg)
                          void executePrompt(prevUserMsg.content);
                      }}
                    />

                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="space-y-1.5 mt-2 pt-2 border-t ws-border">
                        {msg.toolCalls.map((tc) => (
                          <div
                            key={tc.id}
                            className="flex items-start gap-2 p-1.5 rounded-lg ws-surface-soft border ws-border text-[11px] ws-ink font-mono"
                          >
                            <SparklesIcon className="w-3 h-3 mt-0.5 ws-muted shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold ws-ink">
                                {tc.name === "edit_canvas"
                                  ? "🛠️ Canvas Action"
                                  : `🛠️ ${tc.name}`}
                              </div>
                              <div className="ws-muted text-[11px] mt-0.5 whitespace-normal">
                                {tc.result?.summary ||
                                  tc.args.explanation ||
                                  "Modified architecture components."}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {msg.appliedToCanvas && !msg.toolCalls && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-[11px] ws-muted font-medium">
                        <div className="w-1 h-1 rounded-full ws-surface-soft" />
                        Applied to canvas
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          ))}

          {isLoading && (
            <div
              role="status"
              aria-live="polite"
              className="pl-7 py-1.5 space-y-2"
            >
              <p className="text-xs ws-muted">{agentStatus}</p>
              <div
                aria-hidden="true"
                className="space-y-1.5 motion-safe:animate-pulse"
              >
                <div className="h-2 w-4/5 rounded ws-surface-soft" />
                <div className="h-2 w-3/5 rounded ws-surface-soft" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Composer Card ── */}
        <div className="assistant-composer-wrap">
          <form
            onSubmit={handleSubmit}
            className="workspace-composer assistant-composer"
          >
            <textarea
              ref={textareaRef}
              aria-label="Message Jenkos"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask Jenkos or describe a diagram..."
              className="assistant-input ws-placeholder"
              rows={1}
            />

            <div className="assistant-composer-actions">
              <div className="flex min-w-0 items-center gap-1.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="AI chat options"
                      title="AI chat options"
                      className="assistant-icon-button"
                    >
                      <AdjustmentsHorizontalIcon
                        aria-hidden="true"
                        className="h-4 w-4"
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    side="top"
                    sideOffset={8}
                    className="workspace-popover assistant-options w-64 max-w-[calc(100vw-2rem)] ws-option ws-ink border ws-border"
                  >
                    <p className="assistant-options-title">Chat options</p>
                    <label className="assistant-options-field">
                      <span>AI model</span>
                      <select
                        aria-label="AI model"
                        value={selectedModel}
                        onChange={(event) =>
                          setSelectedModel(event.target.value)
                        }
                        className="assistant-options-select"
                      >
                        {AVAILABLE_MODELS.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="assistant-options-field">
                      <span>AI edit scope</span>
                      <select
                        aria-label="AI edit scope"
                        value={editScope}
                        onChange={(event) =>
                          setEditScope(
                            event.target.value as "canvas" | "selection",
                          )
                        }
                        className="assistant-options-select"
                      >
                        <option value="canvas">Entire canvas</option>
                        <option value="selection">
                          Selected items (
                          {nodes.filter((node) => node.selected).length +
                            edges.filter((edge) => edge.selected).length}
                          )
                        </option>
                      </select>
                    </label>
                    {editScope === "selection" && (
                      <p className="text-xs ws-muted">
                        Only selected existing items can be changed or removed.
                        Select affected connections too.
                      </p>
                    )}
                  </PopoverContent>
                </Popover>
                {editScope === "selection" && (
                  <span className="text-xs ws-muted">Selected items only</span>
                )}
              </div>

              <div className="flex items-center gap-1">
                <ArchitecturePlans
                  key={workspaceId}
                  workspaceId={workspaceId}
                  prompt={input}
                  model={selectedModel}
                  disabled={isLoading || planDisabled}
                  onBeforeApply={onBeforePlanApply}
                  onApplied={onPlanApplied}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="assistant-send ws-primary"
                >
                  <PaperAirplaneIcon className="w-3 h-3" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
      <Dialog
        open={Boolean(pendingChange)}
        onOpenChange={(open) => {
          if (!open && pendingChange) cancelPreview();
        }}
      >
        <DialogContent className="workspace-dialog ws-ink border ws-border rounded-2xl w-[calc(100%-2rem)] max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 select-text">
          <DialogTitle>Review AI changes</DialogTitle>
          <DialogDescription className="ws-muted">
            Scope:{" "}
            {pendingChange?.scope === "selection"
              ? "selected items"
              : "entire canvas"}
            . Review the affected items before applying.
          </DialogDescription>
          {pendingChange && (
            <div className="space-y-4">
              {[
                pendingChange.preview.addedNodes,
                pendingChange.preview.changedNodes,
                pendingChange.preview.removedNodes,
                pendingChange.preview.addedEdges,
                pendingChange.preview.changedEdges,
                pendingChange.preview.removedEdges,
              ].every((items) => items.length === 0) && (
                <p className="text-sm ws-muted">
                  No item differences were found.
                </p>
              )}
              {(
                [
                  ["Nodes to add", pendingChange.preview.addedNodes],
                  ["Nodes to change", pendingChange.preview.changedNodes],
                  ["Nodes to remove", pendingChange.preview.removedNodes],
                  ["Connections to add", pendingChange.preview.addedEdges],
                  ["Connections to change", pendingChange.preview.changedEdges],
                  ["Connections to remove", pendingChange.preview.removedEdges],
                ] as const
              )
                .filter(([, items]) => items.length > 0)
                .map(([title, items]) => (
                  <section key={title}>
                    <h3 className="text-sm font-semibold ws-ink">
                      {title} ({items.length})
                    </h3>
                    <ul className="mt-1 space-y-1 text-sm ws-muted">
                      {items.map((item) => (
                        <li key={item.id} className="break-words">
                          {item.label}{" "}
                          <span className="ws-dim">({item.id})</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              {previewError && (
                <p role="alert" className="text-sm text-red-400">
                  {previewError}
                </p>
              )}
              <div className="flex justify-end gap-2 border-t ws-border pt-3">
                <button
                  type="button"
                  onClick={cancelPreview}
                  className="rounded px-3 py-2 text-sm ws-muted ws-hover-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyPreview}
                  className="rounded px-3 py-2 text-sm font-semibold ws-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                >
                  Apply changes
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
