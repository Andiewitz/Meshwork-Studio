import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  SparklesIcon,
  CpuChipIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  ChevronLeftIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  PlusIcon,
  ArrowUpRightIcon,
  CubeIcon,
  TrashIcon,
  StopIcon,
  CheckIcon,
  CommandLineIcon,
} from "@heroicons/react/24/outline";
import { useReactFlow, useNodes, useEdges } from "@xyflow/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { validateAndRepairCanvas } from "@/lib/ai-canvas-utils";
import {
  nodeTypesList,
  getDynamicFavorites,
  DEFAULT_FAVORITES,
  NODE_DESCRIPTIONS,
} from "@/features/workspace/utils/nodeTypes";

const SYSTEM_PROMPT = `You are Meshwork AI — an expert cloud architecture co-pilot embedded inside Meshwork Studio, a professional infrastructure diagramming tool.

BEHAVIOR RULES:
1. Always reply in clear, natural language. Explain what you designed or changed (2-4 sentences) like a senior architect briefing their team.
2. When generating or modifying a diagram, ALWAYS output the FULL canvas JSON in a single \`\`\`json block AFTER your explanation.
3. When modifying an existing diagram, emit the COMPLETE updated nodes+edges (not just a diff).
4. Never show raw IDs, schema fields, or technical boilerplate in your conversational reply.
5. If the user asks a general question with no diagram change needed, reply normally with no JSON.

VALID NODE TYPES:
Compute:     server | microservice | worker | logic
Data:        database | cache | storage | search | influxdb | snowflake | clickhouse
Networking:  gateway | loadBalancer | cdn | bus | queue | route53 | nats | socketio
Security:    vault | auth0 | waf
Monitoring:  prometheus | grafana | datadog
Infra:       vpc | region | k8s-namespace
External:    user | app | api | stripe | twilio | shopify
CI/CD:       github_actions | jenkins | gitlab | argocd
K8s:         k8s-pod | k8s-deployment | k8s-replicaset | k8s-statefulset | k8s-daemonset
             k8s-service | k8s-ingress | k8s-configmap | k8s-secret | k8s-pvc
             k8s-job | k8s-cronjob | k8s-hpa
Text/Labels: annotation | note

REQUIRED JSON OUTPUT FORMAT:
\`\`\`json
{
  "nodes": [
    {
      "id": "unique-string",
      "type": "database",
      "position": { "x": 100, "y": 200 },
      "data": { "label": "Display Name", "category": "Core" },
      "style": { "width": 144, "height": 120 }
    }
  ],
  "edges": [
    {
      "id": "e-1",
      "source": "node-1",
      "target": "node-2",
      "type": "smoothstep",
      "style": { "stroke": "#3B82F6", "strokeWidth": 1.5 }
    }
  ]
}
\`\`\`
`;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  appliedToCanvas?: boolean;
}

const DEFAULT_SUGGESTIONS = [
  "Design a scalable Kubernetes microservices architecture",
  "Set up a high-availability PostgreSQL cluster with Redis",
  "Build an event-driven data pipeline with Kafka & Workers",
  "Create a secure AWS VPC with public & private subnets",
];

const AVAILABLE_MODELS = [
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "Google" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "Google" },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { id: "gpt-oss-120b", name: "GPT OSS 120B", provider: "Meshwork" },
];

const CATEGORY_ORDER = ["Core", "More", "Kubernetes", "Templates"];

export interface WorkspaceLeftSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: "ai" | "nodes";
  setActiveTab: (tab: "ai" | "nodes") => void;
  onDragStart: (
    event: React.DragEvent,
    nodeType: string,
    label: string,
  ) => void;
}

export function WorkspaceLeftSidebar({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  onDragStart,
}: WorkspaceLeftSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDesigning, setIsDesigning] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gemini-2.0-flash");
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { setNodes, setEdges, fitView, getNodes, getEdges, getViewport } =
    useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();

  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");

  const filteredByCategory = useMemo(() => {
    const result: Record<string, typeof nodeTypesList> = {};
    const categories = activeFilter === "All" ? CATEGORY_ORDER : [activeFilter];
    for (const cat of categories) {
      const items = nodeTypesList.filter(
        (n) =>
          n.category === cat &&
          (searchTerm === "" ||
            n.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            n.type.toLowerCase().includes(searchTerm.toLowerCase())),
      );
      if (items.length > 0) result[cat] = items;
    }
    return result;
  }, [searchTerm, activeFilter]);

  useEffect(() => {
    if (!isOpen || activeTab !== "ai") return;
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
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [isOpen, activeTab, nodes.length, edges.length]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === "ai") {
      setTimeout(
        () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    }
  }, [messages, isOpen, activeTab]);

  const parseAIResponse = useCallback((content: string) => {
    const jsonMatch = /```(?:json)?\n([\s\S]*?)\n```/.exec(content);
    const display = content.replace(/```(?:json)?\n[\s\S]*?\n```/g, "").trim();
    return { display, jsonBlock: jsonMatch ? jsonMatch[1].trim() : null };
  }, []);

  const executePrompt = useCallback(
    async (userPrompt: string, modelOverride?: string) => {
      if (!userPrompt.trim()) return;

      const modelToUse = modelOverride || selectedModel;
      const isArchitectureTask =
        /design|create|build|add|connect|attach|draw|architecture|system|app|generate|make|put/i.test(
          userPrompt,
        );

      const userMsg: Message = {
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
      if (isArchitectureTask) {
        window.dispatchEvent(
          new CustomEvent("mosh:designing", {
            detail: { active: true, x: centerX, y: centerY },
          }),
        );
      }

      try {
        const { secureFetch } = await import("@/lib/secure-fetch");
        const currentNodes = getNodes();
        const currentEdges = getEdges();

        const canvasContext =
          currentNodes.length > 0
            ? `\n\nCURRENT CANVAS (${currentNodes.length} nodes, ${currentEdges.length} edges):\n\`\`\`json\n${JSON.stringify({ nodes: currentNodes, edges: currentEdges })}\n\`\`\`\nVIEWPORT CENTER: approximately x=${centerX}, y=${centerY}. Place new nodes near this center.\nWhen modifying, emit the COMPLETE updated nodes+edges.`
            : `\n\nThe canvas is empty. VIEWPORT CENTER: x=${centerX}, y=${centerY}. Start your diagram near this point.`;

        const fullSystemPrompt = SYSTEM_PROMPT + canvasContext;

        const payloadMessages = [
          { role: "system", content: fullSystemPrompt },
          ...messages
            .filter((m) => m.id !== "init")
            .map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: userMsg.content },
        ];

        let response: Response | null = null;
        let attempt = 0;
        const maxAttempts = 5;
        const baseDelay = 1200;

        while (attempt < maxAttempts) {
          try {
            response = await secureFetch("/api/v1/ai/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                provider: "gemini",
                model: modelToUse,
                messages: payloadMessages,
                stream: false,
              }),
            });
            if (response.ok) break;
            if (response.status === 429 || response.status >= 500) {
              attempt++;
              if (attempt >= maxAttempts) break;
              await new Promise((res) =>
                setTimeout(res, baseDelay * Math.pow(1.5, attempt - 1)),
              );
            } else {
              break;
            }
          } catch (err) {
            attempt++;
            if (attempt >= maxAttempts) throw err;
            await new Promise((res) =>
              setTimeout(res, baseDelay * Math.pow(1.5, attempt - 1)),
            );
          }
        }

        if (!response?.ok) {
          const errBody = (await response?.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          throw new Error(
            errBody?.error ??
              errBody?.message ??
              `Error ${response?.status ?? "Unknown after retries"}`,
          );
        }

        const aiResponse = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };

        if (!aiResponse.choices?.[0]) {
          throw new Error("Invalid AI response format received.");
        }

        const rawContent =
          aiResponse.choices[0]?.message?.content ?? "No response generated.";
        const { display, jsonBlock } = parseAIResponse(rawContent);

        let appliedToCanvas = false;
        if (jsonBlock) {
          try {
            const parsed = JSON.parse(jsonBlock);
            const repaired = validateAndRepairCanvas(parsed);
            if (repaired) {
              setNodes(repaired.nodes);
              setEdges(repaired.edges);
              setTimeout(() => fitView({ duration: 700, padding: 0.2 }), 100);
              appliedToCanvas = true;
            }
          } catch (err) {
            console.warn("[MeshworkAI] JSON parse failed:", err);
          }
        }

        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: display || rawContent,
            appliedToCanvas,
          },
        ]);
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
          new CustomEvent("mosh:designing", { detail: { active: false } }),
        );
      }
    },
    [
      getNodes,
      getEdges,
      getViewport,
      messages,
      parseAIResponse,
      selectedModel,
      setEdges,
      setNodes,
      fitView,
    ],
  );

  useEffect(() => {
    const autoPrompt = localStorage.getItem("meshwork_auto_trigger_mosh");
    const autoModel = localStorage.getItem("meshwork_auto_trigger_model");
    if (autoPrompt) {
      localStorage.removeItem("meshwork_auto_trigger_mosh");
      localStorage.removeItem("meshwork_auto_trigger_model");
      setActiveTab("ai");
      if (autoModel) setSelectedModel(autoModel);
      const timer = setTimeout(() => {
        void executePrompt(autoPrompt, autoModel || undefined);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [executePrompt, setActiveTab]);

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
      {/* ── Top Header Bar with Segmented Control ── */}
      <div className="p-2.5 border-b border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
        <div className="flex-1 flex items-center p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          <button
            onClick={() => setActiveTab("ai")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              activeTab === "ai"
                ? "bg-[#00E5A0]/15 text-[#00E5A0] shadow-[0_0_12px_rgba(0,229,160,0.2)]"
                : "text-white/40 hover:text-white/80"
            }`}
          >
            <SparklesIcon className="w-3 h-3" />
            <span>Mosh AI</span>
          </button>
          <button
            onClick={() => setActiveTab("nodes")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              activeTab === "nodes"
                ? "bg-white/[0.12] text-white shadow-sm"
                : "text-white/40 hover:text-white/80"
            }`}
          >
            <CubeIcon className="w-3 h-3" />
            <span>Components</span>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-all"
          title="Collapse sidebar"
        >
          <ChevronLeftIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Tab 1: Mosh AI Co-pilot ── */}
      {activeTab === "ai" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Sub-header: Model selector & clear button */}
          <div className="px-3 py-1.5 border-b border-white/[0.04] flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 text-white/50">
              <CpuChipIcon className="w-3 h-3 text-[#00E5A0]" />
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-transparent text-white/80 text-[10px] font-medium outline-none cursor-pointer hover:text-white"
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option
                    key={m.id}
                    value={m.id}
                    className="bg-[#18181b] text-white"
                  >
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="text-[9px] text-white/30 hover:text-red-400 flex items-center gap-1 transition-colors"
              >
                <TrashIcon className="w-2.5 h-2.5" />
                Clear
              </button>
            )}
          </div>

          {/* Chat Messages Feed */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin scrollbar-thumb-white/[0.08]">
            {messages.length === 0 && (
              <div className="py-4 flex flex-col items-center text-center space-y-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00E5A0]/20 to-[#3B82F6]/20 border border-[#00E5A0]/30 flex items-center justify-center shadow-[0_0_24px_rgba(0,229,160,0.15)]">
                  <SparklesIcon className="w-5 h-5 text-[#00E5A0]" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-xs font-semibold text-white">
                    Meshwork AI Architect
                  </h3>
                  <p className="text-[11px] text-white/40 max-w-[240px]">
                    Describe any system or ask to design, connect, and
                    optimize cloud topologies.
                  </p>
                </div>

                <div className="w-full space-y-1 pt-1">
                  <div className="text-[9px] uppercase font-bold tracking-wider text-white/30 text-left px-0.5">
                    Quick Suggestions
                  </div>
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setInput(s);
                        textareaRef.current?.focus();
                      }}
                      className="w-full flex items-center justify-between p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-[#00E5A0]/30 text-left text-[11px] text-white/70 hover:text-white transition-all group"
                    >
                      <span className="line-clamp-2">{s}</span>
                      <ArrowUpRightIcon className="w-2.5 h-2.5 text-white/20 group-hover:text-[#00E5A0] shrink-0 ml-2 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <CpuChipIcon className="w-3 h-3 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-[#FF6B35]/20 to-[#E8391A]/10 border border-[#FF6B35]/30 text-white rounded-tr-sm"
                      : "bg-white/[0.04] border border-white/[0.07] text-white/90 rounded-tl-sm"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <>
                      <div className="prose prose-invert prose-xs max-w-none prose-p:my-0.5 prose-headings:text-white prose-code:text-[#00E5A0] prose-code:bg-white/[0.06] prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                      {msg.appliedToCanvas && (
                        <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-white/[0.06] text-[9px] text-emerald-400 font-medium">
                          <CheckIcon className="w-2.5 h-2.5" />
                          Applied to canvas
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </motion.div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-[11px] text-white/50 py-1.5">
                <ArrowPathIcon className="w-3.5 h-3.5 text-[#00E5A0] animate-spin" />
                <span className="font-mono text-[10px] text-[#00E5A0]">
                  {isDesigning
                    ? "Synthesizing architecture..."
                    : "Thinking..."}
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Composer ── */}
          <div className="p-2.5 border-t border-white/[0.06]">
            <form
              onSubmit={handleSubmit}
              className="rounded-xl bg-white/[0.04] border border-white/[0.08] focus-within:border-[#00E5A0]/40 transition-all p-2 space-y-1.5"
            >
              <div className="flex items-center justify-between px-0.5 text-[9px] text-white/40">
                <span className="flex items-center gap-1">
                  <span className="text-[#00E5A0]">@</span> Canvas ({nodes.length} nodes)
                </span>
                <span className="font-mono text-[8px] text-white/20">
                  Shift+Enter ↵
                </span>
              </div>

              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Tell Mosh what to build..."
                className="w-full bg-transparent border-0 resize-none outline-none text-white text-[11px] placeholder:text-white/30 px-0.5 py-0.5 leading-relaxed min-h-[36px] max-h-24 scrollbar-thin"
                rows={1}
              />

              <div className="flex items-center justify-between pt-0.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setInput((prev) => prev + " @database @server");
                      textareaRef.current?.focus();
                    }}
                    className="px-1.5 py-0.5 rounded-md text-[9px] font-medium text-white/50 hover:text-white hover:bg-white/[0.06] transition-all flex items-center gap-0.5"
                    title="Add Reference"
                  >
                    <PlusIcon className="w-2.5 h-2.5" />
                    <span>Ref</span>
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-black disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 active:scale-95 transition-all"
                  style={{
                    background:
                      "linear-gradient(135deg, #00E5A0, #059669)",
                  }}
                >
                  <PaperAirplaneIcon className="w-3 h-3" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Tab 2: Components & Node Library ── */}
      {activeTab === "nodes" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="p-2.5 border-b border-white/[0.06] space-y-1.5">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
              <input
                type="text"
                placeholder="Search components..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-7 pr-6 py-1.5 text-[11px] bg-white/[0.04] border border-white/[0.08] rounded-lg text-white placeholder:text-white/30 outline-none focus:border-[#00E5A0]/40 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                >
                  <XMarkIcon className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex gap-0.5 overflow-x-auto pb-0.5 scrollbar-none">
              {["All", "Core", "More", "Kubernetes"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveFilter(cat)}
                  className={`px-2 py-0.5 rounded-md text-[9px] font-semibold shrink-0 transition-all ${
                    activeFilter === cat
                      ? "bg-white/[0.12] text-white"
                      : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                  }`}
                >
                  {cat === "Core"
                    ? "Compute"
                    : cat === "More"
                      ? "Vendor"
                      : cat === "Kubernetes"
                        ? "K8s"
                        : "All"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-3 scrollbar-thin scrollbar-thumb-white/[0.08]">
            {Object.entries(filteredByCategory).map(([category, items]) => (
              <div key={category} className="space-y-1">
                <div className="text-[9px] uppercase font-bold tracking-wider text-white/30 px-0.5">
                  {category === "Core"
                    ? "Compute & Storage"
                    : category === "More"
                      ? "Vendor & APIs"
                      : category === "Kubernetes"
                        ? "Kubernetes Primitives"
                        : category}
                </div>

                <div className="grid grid-cols-2 gap-1">
                  {items.map((node) => (
                    <div
                      key={node.type}
                      draggable
                      onDragStart={(e) =>
                        onDragStart(e, node.type, node.label)
                      }
                      className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/15 cursor-grab active:cursor-grabbing transition-all group select-none"
                      title={`Drag: ${NODE_DESCRIPTIONS[node.type] || node.label}`}
                    >
                      <div className="w-5 h-5 rounded-md bg-white/[0.06] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform text-white/80 group-hover:text-white">
                        <node.icon className="w-3 h-3" />
                      </div>
                      <span className="text-[10px] font-medium text-white/80 group-hover:text-white truncate">
                        {node.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
