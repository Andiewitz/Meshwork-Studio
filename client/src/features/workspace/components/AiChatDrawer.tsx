import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PaperAirplaneIcon,
  SparklesIcon,
  CpuChipIcon,
  ArrowPathIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { useReactFlow, useNodes, useEdges } from "@xyflow/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { validateAndRepairCanvas } from "@/lib/ai-canvas-utils";

// ─────────────────────────────────────────────────────────────
// GROUND TRUTH SYSTEM PROMPT
// Updated whenever node types or sizes change in dimensions.ts
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Meshwork AI — an expert cloud architecture co-pilot embedded inside Meshwork Studio, a professional infrastructure diagramming tool.

BEHAVIOR RULES:
1. Always reply in clear, natural language. Explain what you designed or changed (2-4 sentences) like a senior architect briefing their team.
2. When generating or modifying a diagram, ALWAYS output the FULL canvas JSON in a single \`\`\`json block AFTER your explanation.
3. When modifying an existing diagram, emit the COMPLETE updated nodes+edges (not just a diff).
4. Never show raw IDs, schema fields, or technical boilerplate in your conversational reply.
5. If the user asks a general question with no diagram change needed, reply normally with no JSON.

═══════════════════════════════════════
VALID NODE TYPES (use EXACTLY these strings — no variants):
═══════════════════════════════════════
Compute:     server | microservice | worker | logic
Data:        database | cache | storage | search | influxdb | snowflake | clickhouse
Networking:  gateway | loadBalancer | cdn | bus | queue | route53 | nats | socketio
Security:    vault | auth0 | waf
Monitoring:  prometheus | grafana | datadog
Infra (containers): vpc | region | k8s-namespace
External:    user | app | api | stripe | twilio | shopify
CI/CD:       github_actions | jenkins | gitlab | argocd
K8s:         k8s-pod | k8s-deployment | k8s-replicaset | k8s-statefulset | k8s-daemonset
             k8s-service | k8s-ingress | k8s-configmap | k8s-secret | k8s-pvc
             k8s-job | k8s-cronjob | k8s-hpa
Text/Labels: annotation | note

COMMON ALIASES (always translate these to the correct type):
  postgresql/postgres/mysql/mongodb → "database"
  redis → "cache"
  nginx/alb/elb → "loadBalancer"
  api-gateway/apigw → "gateway"
  lambda/function → "logic"
  kafka → "bus"
  rabbitmq/sqs → "queue"
  s3/blob → "storage"
  cloudfront/fastly → "cdn"
  react/vue/nextjs → "app"

═══════════════════════════════════════
EXACT NODE SIZES (use these, do not invent sizes):
═══════════════════════════════════════
user: 96×96        | server: 168×96    | microservice: 168×72  | worker: 168×72
logic: 120×72      | app: 168×72       | api: 168×72
database: 144×120  | cache: 144×120    | storage: 144×120     | search: 144×120
gateway: 192×72    | loadBalancer: 192×72 | cdn: 192×72       | bus: 192×72
queue: 192×72      | route53: 192×72   | nats: 192×72         | socketio: 144×72
auth0: 168×72      | vault: 168×72     | waf: 168×72
stripe: 168×72     | twilio: 168×72    | shopify: 168×72
prometheus: 168×72 | grafana: 168×72   | datadog: 168×72
github_actions: 168×72 | jenkins: 168×72 | gitlab: 168×72    | argocd: 168×72
influxdb: 144×120  | snowflake: 144×120 | clickhouse: 144×120
vpc: 408×312       | region: 600×408   | k8s-namespace: 408×312
k8s-pod: 144×96    | k8s-deployment: 192×96 | k8s-service: 168×72
k8s-ingress: 168×72 | k8s-configmap: 168×72 | k8s-secret: 168×72
k8s-pvc: 168×96   | k8s-job: 144×72   | k8s-cronjob: 168×96 | k8s-hpa: 168×96
annotation: 160×48 | note: 192×192

═══════════════════════════════════════
LAYOUT RULES (critical for on-screen placement):
═══════════════════════════════════════
- Use left-to-right flow: x increases by ~280px per column
- Stack vertically: y increases by ~140px per row
- Default starting position: x=100, y=200
- Minimum gap between nodes: 40px on all sides
- VPC/region containers: place at x=50, y=100, children use positions RELATIVE to container top-left
- Nodes inside vpc/region MUST have "parentId" set to the vpc/region id, and "extent": "parent"
- k8s-namespace behaves like vpc — children must have parentId set
- Place user nodes far left (x=100), databases far right
- Viewport center is provided in context — center your diagram around it

═══════════════════════════════════════
EDGE TYPES AND STYLES:
═══════════════════════════════════════
Edge "type" field:
  "smoothstep"  — curved, recommended for most connections
  "step"        — right-angle bends, good for clean diagrams
  "straight"    — direct line
  "default"     — bezier curve

Arrow and style options:
  No arrow (default):    omit markerEnd
  Arrow at target:       markerEnd: { type: "arrowclosed", color: "#555" }
  Dashed line:           style.strokeDasharray: "6 4"
  Dotted line:           style.strokeDasharray: "2 4"
  Thick line:            style.strokeWidth: 2.5
  Colored:               style.stroke: "#3B82F6" (use color to indicate data flow type)
  With label:            label: "REST" or label: "gRPC" etc.

Use colored edges to distinguish traffic types:
  "#3B82F6" blue  = HTTP/REST
  "#10B981" green = database queries
  "#F59E0B" amber = async/queue messages
  "#A855F7" purple = auth/security flows
  "#EF4444" red   = error/alert flows

═══════════════════════════════════════
ANNOTATION USAGE:
═══════════════════════════════════════
Use "annotation" nodes to label regions or add notes:
  { "id": "label-1", "type": "annotation", "position": { "x": 50, "y": 60 },
    "data": { "label": "⚡ High-throughput path", "category": "Core" },
    "style": { "width": 160, "height": 48 } }

Use "note" nodes for sticky-note style callouts with longer text.

═══════════════════════════════════════
REQUIRED JSON OUTPUT FORMAT:
═══════════════════════════════════════
\`\`\`json
{
  "nodes": [
    {
      "id": "unique-string",
      "type": "exactTypeString",
      "position": { "x": 100, "y": 200 },
      "data": { "label": "Display Name", "category": "Core", "provider": "postgresql" },
      "style": { "width": 144, "height": 120 }
    }
  ],
  "edges": [
    {
      "id": "e-1",
      "source": "node-id",
      "target": "node-id",
      "type": "smoothstep",
      "label": "optional label",
      "style": { "stroke": "#3B82F6", "strokeWidth": 1.5 },
      "markerEnd": { "type": "arrowclosed", "color": "#3B82F6" }
    }
  ]
}
\`\`\`

═══════════════════════════════════════
EXAMPLE — 3-tier web app:
═══════════════════════════════════════
User → CDN → LoadBalancer → API Gateway → [Database, Cache]
Positions: user(100,200), cdn(380,200), loadBalancer(660,200), gateway(940,200), database(1220,120), cache(1220,340)

EXAMPLE — VPC with services inside:
VPC at (50,50), size 408×312. Children: microservice at (80,120) parentId="vpc-1", database at (260,120) parentId="vpc-1"`;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  appliedToCanvas?: boolean;
}

const DEFAULT_SUGGESTIONS = [
  "Design a scalable Kubernetes microservices architecture",
  "Set up a high-availability Postgres cluster",
  "Build a serverless event-driven data pipeline",
  "Create a secure AWS VPC with public/private subnets",
];

export function AiChatDrawer({
  isLeftSidebarOpen = false,
  isRightSidebarOpen = false,
}: {
  isLeftSidebarOpen?: boolean;
  isRightSidebarOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDesigning, setIsDesigning] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { setNodes, setEdges, fitView, getNodes, getEdges, getViewport } =
    useReactFlow();

  const nodes = useNodes();
  const edges = useEdges();
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const [selectedModel, setSelectedModel] = useState("gemini-2.0-flash");

  const nodesKey = nodes.map((n) => `${n.id}:${n.type}`).join(",");
  const edgesKey = edges.map((e) => `${e.source}->${e.target}`).join(",");

  useEffect(() => {
    if (!isOpen) return;

    setIsLoadingSuggestions(true);
    const timer = setTimeout(async () => {
      try {
        const { secureFetch } = await import("@/lib/secure-fetch");
        const response = await secureFetch("/api/v1/ai/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canvas: { nodes, edges },
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as string[];
          if (Array.isArray(data)) {
            setSuggestions(data);
          }
        }
      } catch (err) {
        console.error("Failed to load suggestions:", err);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [isOpen, nodesKey, edgesKey]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
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
        const maxAttempts = 6;
        const baseDelay = 1500;

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
          throw new Error(
            `Invalid response format: ${JSON.stringify(aiResponse)}`,
          );
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
            "No API key configured. Please ensure your provider API key is set correctly.";
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

  // Auto-trigger from landing page prompt
  useEffect(() => {
    const autoPrompt = localStorage.getItem("meshwork_auto_trigger_mosh");
    const autoModel = localStorage.getItem("meshwork_auto_trigger_model");

    if (autoPrompt) {
      localStorage.removeItem("meshwork_auto_trigger_mosh");
      localStorage.removeItem("meshwork_auto_trigger_model");

      setIsOpen(true);
      if (autoModel) {
        setSelectedModel(autoModel);
      }

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
    <div
      className="fixed bottom-0 left-1/2 z-50 flex flex-col items-center pointer-events-none transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{
        transform: `translate(calc(-50% + ${
          (isLeftSidebarOpen ? 130 : 0) - (isRightSidebarOpen ? 140 : 0)
        }px), 0)`,
      }}
    >
      {/* Pull Tab */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="pointer-events-auto flex items-center gap-2 px-4 h-8 bg-[#121214]/80 backdrop-blur-xl border border-b-0 border-white/[0.08] rounded-t-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_-4px_20px_rgba(0,0,0,0.5)] hover:bg-[#1C1C1F]/90 transition-all cursor-pointer"
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
      >
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          <ChevronDownIcon className="w-3.5 h-3.5 text-white/50" />
        </motion.div>
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          <CpuChipIcon className="w-3.5 h-3.5 text-[#00E5A0]" />
        </motion.div>
        <span className="text-[11px] font-semibold tracking-widest uppercase text-white/60">
          Meshwork AI
        </span>
        <span className="text-[9px] text-white/25 border border-white/10 px-1.5 py-0.5 rounded-md font-mono">
          BETA
        </span>
      </motion.button>

      {/* Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 520, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 35 }}
            className="pointer-events-auto w-[640px] max-w-[92vw] flex flex-col overflow-hidden bg-[#121214]/80 backdrop-blur-xl border border-b-0 border-white/[0.08] rounded-t-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_-20px_60px_-10px_rgba(0,0,0,0.8)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, #10B981, #059669)",
                    boxShadow: "0 2px 12px rgba(16, 185, 129, 0.4)",
                  }}
                >
                  <CpuChipIcon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-[#00E5A0] font-semibold text-white/90 tracking-wide">
                      MESHWORK AI
                    </span>
                    <span className="text-[9px] text-[#00E5A0] border border-[rgba(0,229,160,0.22)] bg-[rgba(0,229,160,0.10)] px-1.5 py-0.5 rounded font-mono tracking-wider">
                      BETA
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <motion.div
                      className="w-1.5 h-1.5 rounded-full bg-[#00E5A0]"
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    />
                    <span className="text-[10px] text-white/30">
                      GPT OSS 120B · Canvas-aware
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-white/20 hover:text-white/60 hover:bg-white/5 transition-all"
              >
                <ChevronDownIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Chat */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 scrollbar-thin scrollbar-thumb-white/[0.06]">
              {/* Empty State & Suggestions */}
              {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="flex flex-col items-center justify-center text-center mt-8 mb-6 space-y-6"
                >
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white/[0.02] border border-white/[0.05] shadow-lg">
                    <CpuChipIcon className="w-8 h-8 text-[#00E5A0]" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-white font-medium text-sm">
                      I'm Meshwork AI. Let's design.
                    </h3>
                    <p className="text-white/40 text-xs max-w-[240px]">
                      Describe your cloud infrastructure or ask me to modify the
                      canvas.
                    </p>
                  </div>
                  <div className="flex flex-col w-full gap-2 px-2 mt-4">
                    {isLoadingSuggestions
                      ? Array.from({ length: 4 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-[38px] w-full rounded-xl bg-white/[0.02] border border-white/[0.04] animate-pulse flex items-center px-3"
                          >
                            <CpuChipIcon className="w-3.5 h-3.5 text-[#10B981]/30 mr-2 shrink-0" />
                            <div className="h-3 bg-white/[0.06] rounded w-2/3" />
                          </div>
                        ))
                      : suggestions.map((s, i) => (
                          <motion.button
                            key={s}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 + i * 0.05 }}
                            onClick={() => {
                              setInput(s);
                              textareaRef.current?.focus();
                            }}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] text-white/60 border border-white/[0.06] hover:border-[rgba(0,229,160,0.3)] hover:text-white/90 hover:bg-[rgba(0,229,160,0.08)] transition-all cursor-pointer text-left w-full group"
                          >
                            <CpuChipIcon className="w-3.5 h-3.5 text-[#00E5A0] group-hover:text-[#00E5A0] transition-colors shrink-0" />
                            <span className="truncate">{s}</span>
                          </motion.button>
                        ))}
                  </div>
                </motion.div>
              )}

              {/* Messages */}
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div
                      className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5 border border-white/[0.06]"
                      style={{
                        background: "linear-gradient(145deg, #1E1E1E, #141414)",
                      }}
                    >
                      <CpuChipIcon className="w-3.5 h-3.5 text-[#00E5A0]" />
                    </div>
                  )}
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${msg.role === "user" ? "rounded-tr-sm text-white/90" : "rounded-tl-sm text-white/80"}`}
                    style={
                      msg.role === "user"
                        ? {
                            background:
                              "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.08))",
                            border: "1px solid rgba(16,185,129,0.2)",
                          }
                        : {
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.055)",
                          }
                    }
                  >
                    {msg.role === "assistant" ? (
                      <>
                        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-p:leading-relaxed prose-headings:text-white/90 prose-headings:font-semibold prose-headings:my-2 prose-ul:my-1.5 prose-li:my-0.5 prose-li:text-white/70 prose-strong:text-white/90 prose-code:text-[#00E5A0] prose-code:bg-white/[0.06] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12px] prose-code:font-mono">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                        {msg.appliedToCanvas && (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-white/[0.06]"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                            <span className="text-[11px] text-emerald-400/60 font-medium">
                              Applied to canvas
                            </span>
                          </motion.div>
                        )}
                      </>
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Loading */}
              <AnimatePresence>
                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="flex gap-3"
                  >
                    <div
                      className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5 border border-white/[0.06]"
                      style={{
                        background: "linear-gradient(145deg, #1E1E1E, #141414)",
                      }}
                    >
                      <ArrowPathIcon className="w-3.5 h-3.5 text-[#10B981] animate-spin" />
                    </div>
                    <div
                      className="px-4 py-3 rounded-2xl rounded-tl-sm flex w-full max-w-[82%]"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.055)",
                      }}
                    >
                      <MoshLoadingIndicator isDesigning={isDesigning} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 pb-4 pt-2">
              <form
                onSubmit={handleSubmit}
                className="relative flex items-end gap-2 rounded-2xl p-1.5 transition-all"
                style={{
                  background: "rgba(20,20,20,0.9)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe an architecture, add annotations, or ask me to modify the canvas..."
                  className="flex-1 max-h-32 min-h-[44px] bg-transparent border-0 resize-none outline-none text-white/90 text-[13px] placeholder:text-white/25 px-3 py-3 leading-relaxed scrollbar-thin"
                  rows={1}
                />
                <motion.button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="w-10 h-10 shrink-0 flex items-center justify-center mb-0.5 rounded-xl text-white transition-all cursor-pointer disabled:cursor-default"
                  style={{
                    background:
                      input.trim() && !isLoading
                        ? "linear-gradient(135deg, #00E5A0, #059669)"
                        : "rgba(255,255,255,0.04)",
                    boxShadow:
                      input.trim() && !isLoading
                        ? "0 4px 16px rgba(0,229,160,0.3)"
                        : "none",
                  }}
                  whileHover={input.trim() && !isLoading ? { scale: 1.05 } : {}}
                  whileTap={input.trim() && !isLoading ? { scale: 0.95 } : {}}
                >
                  <PaperAirplaneIcon
                    className="w-4 h-4"
                    style={{ opacity: input.trim() && !isLoading ? 1 : 0.25 }}
                  />
                </motion.button>
              </form>
              <div className="flex items-center justify-center gap-1.5 mt-2.5">
                <SparklesIcon className="w-2.5 h-2.5 text-white/15" />
                <span className="text-[10px] text-white/20 tracking-wide">
                  Enter to send · Shift+Enter for new line
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const DESIGN_PHRASES = [
  "Thinking...",
  "Designing architecture...",
  "Generating layout...",
  "Positioning nodes...",
];

function MoshLoadingIndicator({ isDesigning }: { isDesigning: boolean }) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (!isDesigning) return;
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % DESIGN_PHRASES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [isDesigning]);

  if (!isDesigning) {
    return (
      <div className="flex items-center gap-1">
        {[0, 0.15, 0.3].map((delay, i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-[#10B981]/60"
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{
              repeat: Infinity,
              duration: 0.9,
              delay,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full gap-2">
      <div className="flex items-center justify-between">
        <motion.span
          key={phraseIndex}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="text-[11px] text-[#10B981] font-mono tracking-tight"
        >
          {DESIGN_PHRASES[phraseIndex]}
        </motion.span>
        <span className="text-[9px] text-white/30 font-mono animate-pulse">
          GENERATING
        </span>
      </div>
      <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden relative">
        <motion.div
          className="absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-[#10B981] to-transparent"
          animate={{ left: ["-30%", "100%"] }}
          transition={{
            duration: 1.5,
            ease: "easeInOut",
            repeat: Infinity,
            repeatType: "reverse",
          }}
        />
      </div>
    </div>
  );
}
