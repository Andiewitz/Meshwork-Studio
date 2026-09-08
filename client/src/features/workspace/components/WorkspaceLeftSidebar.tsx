import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  SparklesIcon,
  CpuChipIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  PlusIcon,
  ArrowUpRightIcon,
  TrashIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { LuHistory, LuPlus } from "react-icons/lu";
import { useReactFlow, useNodes, useEdges } from "@xyflow/react";
import StreamingText from "@/components/ui/streaming-text";
import LoadingState from "@/components/ui/loading-state";
import {
  runJenkosAgent,
  JenkosAgentMessage,
} from "@/features/workspace/agent/jenkosAgent";

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
}

export function WorkspaceLeftSidebar({
  isOpen,
  onClose,
}: WorkspaceLeftSidebarProps) {
  const [messages, setMessages] = useState<JenkosAgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState("Consulting Jenkos...");
  const [isDesigning, setIsDesigning] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gemini-3.5-flash");
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
        window.dispatchEvent(
          new CustomEvent("jenkos:designing", {
            detail: { active: true, x: centerX, y: centerY },
          }),
        );
      }

      try {
        const currentNodes = getNodes();
        const currentEdges = getEdges();

        const agentResult = await runJenkosAgent({
          userPrompt,
          history: messages,
          currentNodes,
          currentEdges,
          viewportCenter: { x: centerX, y: centerY },
          model: modelToUse,
          onStatusUpdate: (status) => setAgentStatus(status),
        });

        if (agentResult.canvasResult?.applied) {
          setNodes(agentResult.canvasResult.nodes);
          setEdges(agentResult.canvasResult.edges);
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
    <div className="h-full flex flex-col overflow-hidden select-none">
      {/* ── Jenkos AI Co-pilot (always-on, no tabs) ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Tiny clear button */}
        {messages.length > 0 && (
          <div className="px-3 pt-2 flex justify-end">
            <button
              onClick={() => setMessages([])}
              className="text-[9px] text-white/25 hover:text-red-400 flex items-center gap-1 transition-colors"
            >
              <TrashIcon className="w-2.5 h-2.5" />
              Clear
            </button>
          </div>
        )}

        {/* Chat Messages Feed */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin scrollbar-thumb-white/[0.08]">
          {/* Top action icons: reverse clock (history) and plus (new chat) */}
          <div className="flex items-center justify-between pb-1">
            <button
              type="button"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Chat History"
            >
              <LuHistory className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setMessages([])}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="New Chat"
            >
              <LuPlus className="w-4 h-4" />
            </button>
          </div>

          {messages.length === 0 && (
            <div className="py-2 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-md bg-white/[0.07] border border-white/[0.08] flex items-center justify-center shrink-0">
                  <CpuChipIcon className="w-3 h-3 text-white/70" />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-white/80">
                    Jenkos
                  </p>
                  <p className="text-[10px] text-white/35">
                    Describe any system or ask to design cloud topologies.
                  </p>
                </div>
              </div>

              {/* Suggestions as border-b list */}
              <div className="flex flex-col">
                {suggestions.map((s, sIdx) => (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => {
                      setInput(s);
                      textareaRef.current?.focus();
                    }}
                    className="flex items-center gap-2 border-b border-white/[0.06] py-2 px-0.5 text-left text-[11.5px] text-white/55 hover:bg-white/[0.04] hover:text-white/85 transition-colors duration-100 cursor-pointer rounded-sm"
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
                      className="shrink-0 text-white/25"
                    >
                      <path d="M9 10l-5 5 5 5" />
                      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                    </svg>
                    <span className="line-clamp-2">{s}</span>
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
                  <div
                    className="max-w-[85%] rounded-xl rounded-tr-sm px-3 py-2 text-[11px] text-white"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.12)",
                    }}
                  >
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  </div>
                </div>
              ) : (
                /* Assistant — no bubble */
                <div className="flex gap-2">
                  <div className="w-5 h-5 rounded-md bg-white/[0.07] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5 text-white/70">
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
                      <div className="space-y-1.5 mt-2 pt-2 border-t border-white/[0.06]">
                        {msg.toolCalls.map((tc) => (
                          <div
                            key={tc.id}
                            className="flex items-start gap-2 p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[10px] text-white/70 font-mono"
                          >
                            <SparklesIcon className="w-3 h-3 mt-0.5 text-white/50 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-white/80">
                                {tc.name === "edit_canvas"
                                  ? "🛠️ Canvas Action"
                                  : `🛠️ ${tc.name}`}
                              </div>
                              <div className="text-white/60 text-[9px] mt-0.5 whitespace-normal">
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
                      <div className="flex items-center gap-1.5 mt-1.5 text-[9px] text-white/40 font-medium">
                        <div className="w-1 h-1 rounded-full bg-white/40" />
                        Applied to canvas
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 py-1.5 pl-7">
              <LoadingState label="Churning" variant="Drive" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Composer Card ── */}
        <div className="p-2.5 pt-1">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl bg-white/[0.04] border border-white/[0.08] focus-within:border-white/20 transition-all p-2.5 space-y-2"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Queue follow-up..."
              className="w-full bg-transparent border-0 resize-none outline-none text-white text-[12px] placeholder:text-white/30 px-0.5 py-0.5 leading-relaxed min-h-[44px] max-h-28 scrollbar-thin"
              rows={1}
            />

            <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setInput((prev) => prev + " @context");
                    textareaRef.current?.focus();
                  }}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition-all"
                  title="Add context"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                </button>

                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="h-6 px-2 rounded-full bg-white/[0.06] border border-white/[0.08] text-white text-[10px] font-medium outline-none cursor-pointer hover:bg-white/[0.1] transition-all"
                >
                  {AVAILABLE_MODELS.map((m) => (
                    <option
                      key={m.id}
                      value={m.id}
                      className="bg-[#18181b] text-white"
                    >
                      Build ▾ ({m.name.split(" ")[0]})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="h-7 px-3.5 rounded-full flex items-center gap-1.5 bg-white text-black font-semibold text-[11px] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/90 active:scale-95 transition-all shadow-sm cursor-pointer"
                >
                  <PaperAirplaneIcon className="w-3 h-3" />
                  <span>Build</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
