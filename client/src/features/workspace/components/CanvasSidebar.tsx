import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  Bars3Icon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  PlayIcon,
  PencilIcon,
  SparklesIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  LinkIcon,
  TrashIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  TagIcon,
  PaperAirplaneIcon,
  CpuChipIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Link } from "wouter";
import { useReactFlow, useNodes, useEdges } from "@xyflow/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { validateAndRepairCanvas } from "@/lib/ai-canvas-utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

// ── System prompt (kept in sync with AiChatDrawer) ──────────────────
const SYSTEM_PROMPT = `You are Meshwork AI — an expert cloud architecture co-pilot embedded inside Meshwork Studio, a professional infrastructure diagramming tool.

BEHAVIOR RULES:
1. Always reply in clear, natural language. Explain what you designed or changed (2-4 sentences) like a senior architect briefing their team.
2. When generating or modifying a diagram, ALWAYS output the FULL canvas JSON in a single \`\`\`json block AFTER your explanation.
3. When modifying an existing diagram, emit the COMPLETE updated nodes+edges (not just a diff).
4. Never show raw IDs, schema fields, or technical boilerplate in your conversational reply.
5. If the user asks a general question with no diagram change needed, reply normally with no JSON.

VALID NODE TYPES: server | microservice | worker | logic | database | cache | storage | search | gateway | loadBalancer | cdn | bus | queue | vault | auth0 | waf | prometheus | grafana | datadog | vpc | region | k8s-namespace | k8s-pod | k8s-deployment | k8s-service | k8s-ingress | user | app | api | stripe | annotation | note | github_actions | jenkins

LAYOUT RULES:
- Use left-to-right flow: x increases by ~280px per column
- Stack vertically: y increases by ~140px per row
- Default starting position: x=100, y=200

REQUIRED JSON OUTPUT FORMAT:
\`\`\`json
{ "nodes": [...], "edges": [...] }
\`\`\``;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  appliedToCanvas?: boolean;
}

const DEFAULT_SUGGESTIONS = [
  "Design a scalable Kubernetes microservices architecture",
  "Set up a high-availability Postgres cluster with Redis cache",
  "Build a serverless event-driven pipeline",
  "Create a secure AWS VPC with public/private subnets",
];

interface CanvasSidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  workspaceTitle: string;
  canEdit: boolean;
  canManage: boolean;
  canDelete: boolean;
  isRenaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onStartRename: () => void;
  onRename: () => void;
  setIsRenaming: (v: boolean) => void;
  isSimulating: boolean;
  setIsSimulating: (v: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  saveStatus: "saved" | "saving" | "unsaved";
  onSave: () => void;
  onOpenSettings: () => void;
  onDuplicate: () => void;
  onCopyInvite: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportJson: () => void;
  onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onDelete: () => void;
  wsDescription: string;
  wsTags: string[];
}

export function CanvasSidebar({
  collapsed,
  setCollapsed,
  workspaceTitle,
  canEdit,
  canDelete,
  isRenaming,
  renameValue,
  setRenameValue,
  onStartRename,
  onRename,
  setIsRenaming,
  isSimulating,
  setIsSimulating,
  onUndo,
  onRedo,
  saveStatus,
  onSave,
  onOpenSettings,
  onDuplicate,
  onCopyInvite,
  onExportPng,
  onExportSvg,
  onExportJson,
  onImportJson,
  isFullscreen,
  onToggleFullscreen,
  onDelete,
  wsDescription,
  wsTags,
}: CanvasSidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  // ── AI Chat State ──────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDesigning, setIsDesigning] = useState(false);
  const [suggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [selectedModel] = useState("gemini-3.5-flash");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { setNodes, setEdges, fitView, getNodes, getEdges, getViewport } =
    useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();

  useEffect(() => {
    if (!collapsed) {
      setTimeout(
        () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    }
  }, [messages, collapsed]);

  const parseAIResponse = useCallback((content: string) => {
    const jsonMatch = /```(?:json)?\n([\s\S]*?)\n```/.exec(content);
    const display = content.replace(/```(?:json)?\n[\s\S]*?\n```/g, "").trim();
    return { display, jsonBlock: jsonMatch ? jsonMatch[1].trim() : null };
  }, []);

  const executePrompt = useCallback(
    async (userPrompt: string) => {
      if (!userPrompt.trim()) return;

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
                model: selectedModel,
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
            } else break;
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
              `Error ${response?.status ?? "Unknown"}`,
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
          errorMessage = "No API key configured.";
        } else if (
          errMsg.includes("429") ||
          errMsg.toLowerCase().includes("rate limit")
        ) {
          errorMessage = "Rate limit exceeded. Please try again in a moment.";
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
      if (autoModel) {
        /* model parameter */
      }
      const timer = setTimeout(() => {
        void executePrompt(autoPrompt);
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

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  // ── Collapsed Rail ──────────────────────────────────────────────────
  if (collapsed) {
    return (
      <motion.aside
        initial={false}
        animate={{ width: 52 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="h-full flex flex-col items-center py-3 gap-1 bg-[#0E0E10] border-r border-white/[0.06] z-30 shrink-0 select-none"
        style={{ width: 52 }}
      >
        {/* Expand */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-9 h-9 text-white/40 hover:text-white hover:bg-white/[0.07] rounded-xl"
              onClick={() => setCollapsed(false)}
            >
              <ChevronRightIcon className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Expand sidebar</TooltipContent>
        </Tooltip>

        <div className="w-5 h-px bg-white/[0.06] my-1" />

        {/* Menu */}
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-9 h-9 text-white/40 hover:text-white hover:bg-white/[0.07] rounded-xl"
                >
                  <Bars3Icon className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Menu</TooltipContent>
            </Tooltip>
          </PopoverTrigger>
          <MenuPopoverContent
            canEdit={canEdit}
            canDelete={canDelete}
            isRenaming={isRenaming}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            onStartRename={onStartRename}
            onRename={onRename}
            setIsRenaming={setIsRenaming}
            onOpenSettings={onOpenSettings}
            onDuplicate={onDuplicate}
            onCopyInvite={onCopyInvite}
            onExportPng={onExportPng}
            onExportSvg={onExportSvg}
            onExportJson={onExportJson}
            onImportJson={onImportJson}
            isFullscreen={isFullscreen}
            onToggleFullscreen={onToggleFullscreen}
            onDelete={onDelete}
            setMenuOpen={setMenuOpen}
            importFileRef={importFileRef}
          />
        </Popover>

        {canEdit && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-9 h-9 text-white/35 hover:text-white/80 hover:bg-white/[0.07] rounded-xl"
                  onClick={onUndo}
                >
                  <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-9 h-9 text-white/35 hover:text-white/80 hover:bg-white/[0.07] rounded-xl"
                  onClick={onRedo}
                >
                  <ArrowUturnRightIcon className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Redo (Ctrl+Y)</TooltipContent>
            </Tooltip>

            <div className="w-5 h-px bg-white/[0.06] my-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSimulating(!isSimulating)}
                  className={`w-9 h-9 rounded-xl transition-all ${isSimulating ? "bg-green-500/20 text-green-400 hover:bg-green-500/25" : "text-white/35 hover:text-white/80 hover:bg-white/[0.07]"}`}
                >
                  <PlayIcon
                    className={`w-3 h-3 ${isSimulating ? "fill-green-400" : ""}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {isSimulating ? "Stop simulation" : "Simulate"}
              </TooltipContent>
            </Tooltip>
          </>
        )}

        {/* Save indicator at bottom */}
        <div className="flex-1" />
        <div className="mb-2">
          <SaveDot saveStatus={saveStatus} onSave={onSave} />
        </div>
      </motion.aside>
    );
  }

  // ── Expanded Sidebar ────────────────────────────────────────────────
  return (
    <motion.aside
      initial={{ width: 52, opacity: 0.5 }}
      animate={{ width: 280, opacity: 1 }}
      exit={{ width: 52 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="h-full flex flex-col bg-[#0E0E10] border-r border-white/[0.06] z-30 shrink-0 overflow-hidden"
      style={{ width: 280 }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.05]">
        {/* Collapse */}
        <Button
          variant="ghost"
          size="icon"
          className="w-7 h-7 text-white/30 hover:text-white/80 hover:bg-white/[0.07] rounded-lg shrink-0"
          onClick={() => setCollapsed(true)}
        >
          <ChevronLeftIcon className="w-3.5 h-3.5" />
        </Button>

        {/* Logo mark */}
        <div
          className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #E8391A 0%, #ff6b35 100%)",
            boxShadow: "0 2px 8px rgba(232,57,26,0.4)",
          }}
        >
          <div className="w-2.5 h-2.5 border border-white/80 rounded-sm" />
        </div>

        {/* Title */}
        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRename();
              if (e.key === "Escape") setIsRenaming(false);
            }}
            onBlur={onRename}
            maxLength={24}
            className="flex-1 bg-white/[0.06] border border-white/[0.12] rounded-md px-2 py-0.5 text-[13px] text-white/90 outline-none focus:border-white/25 transition-all min-w-0"
          />
        ) : (
          <button
            className={`flex-1 text-left text-[13px] font-semibold text-white/80 truncate hover:text-white transition-colors ${canEdit ? "cursor-pointer" : "cursor-default"}`}
            onClick={canEdit ? onStartRename : undefined}
            title={workspaceTitle}
          >
            {workspaceTitle || "Untitled"}
          </button>
        )}

        <SaveDot saveStatus={saveStatus} onSave={onSave} />
      </div>

      {/* ── Quick actions ── */}
      <div className="flex items-center gap-0.5 px-2.5 py-2 border-b border-white/[0.04]">
        {/* Menu popover */}
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 text-white/40 hover:text-white hover:bg-white/[0.07] rounded-lg"
                >
                  <Bars3Icon className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Menu</TooltipContent>
            </Tooltip>
          </PopoverTrigger>
          <MenuPopoverContent
            canEdit={canEdit}
            canDelete={canDelete}
            isRenaming={isRenaming}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            onStartRename={onStartRename}
            onRename={onRename}
            setIsRenaming={setIsRenaming}
            onOpenSettings={onOpenSettings}
            onDuplicate={onDuplicate}
            onCopyInvite={onCopyInvite}
            onExportPng={onExportPng}
            onExportSvg={onExportSvg}
            onExportJson={onExportJson}
            onImportJson={onImportJson}
            isFullscreen={isFullscreen}
            onToggleFullscreen={onToggleFullscreen}
            onDelete={onDelete}
            setMenuOpen={setMenuOpen}
            importFileRef={importFileRef}
          />
        </Popover>

        {canEdit && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 text-white/35 hover:text-white/80 hover:bg-white/[0.07] rounded-lg"
                  onClick={onUndo}
                >
                  <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 text-white/35 hover:text-white/80 hover:bg-white/[0.07] rounded-lg"
                  onClick={onRedo}
                >
                  <ArrowUturnRightIcon className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Redo (Ctrl+Y)</TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-white/[0.06] mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSimulating(!isSimulating)}
                  className={`w-7 h-7 rounded-lg transition-all ${isSimulating ? "bg-green-500/20 text-green-400 hover:bg-green-500/25" : "text-white/35 hover:text-white/80 hover:bg-white/[0.07]"}`}
                >
                  <PlayIcon
                    className={`w-3 h-3 ${isSimulating ? "fill-green-400" : ""}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isSimulating ? "Stop simulation" : "Simulate"}
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* ── Project info ── */}
      {(wsDescription || wsTags.length > 0) && (
        <div className="px-3.5 py-2.5 border-b border-white/[0.04] space-y-2">
          {wsDescription && (
            <p className="text-[11px] text-white/35 leading-relaxed line-clamp-2">
              {wsDescription}
            </p>
          )}
          {wsTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {wsTags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.07] text-[10px] text-white/40"
                >
                  <TagIcon className="w-2.5 h-2.5" />
                  {tag}
                </span>
              ))}
              {wsTags.length > 4 && (
                <span className="text-[10px] text-white/25">
                  +{wsTags.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── AI Chat thread (scrollable middle) ── */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center text-center pt-4 pb-2 space-y-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.05]">
                <CpuChipIcon className="w-4 h-4 text-[#00E5A0]" />
              </div>
              <div className="space-y-0.5">
                <p className="text-[12px] font-medium text-white/70">
                  Meshwork AI
                </p>
                <p className="text-[11px] text-white/30 leading-relaxed">
                  Describe your cloud architecture or ask me to modify the
                  canvas.
                </p>
              </div>
              <div className="w-full space-y-1 mt-1">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setInput(s);
                      textareaRef.current?.focus();
                    }}
                    className="flex items-start gap-2 w-full px-2.5 py-2 rounded-lg text-[11px] text-white/45 border border-white/[0.05] hover:border-[rgba(0,229,160,0.2)] hover:text-white/80 hover:bg-[rgba(0,229,160,0.05)] transition-all text-left"
                  >
                    <SparklesIcon className="w-3 h-3 text-[#00E5A0]/60 shrink-0 mt-0.5" />
                    <span className="leading-tight">{s}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div
                  className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center border border-white/[0.06] mt-0.5"
                  style={{
                    background: "linear-gradient(145deg, #1E1E1E, #141414)",
                  }}
                >
                  <CpuChipIcon className="w-3 h-3 text-[#00E5A0]" />
                </div>
              )}
              <div
                className={`max-w-[88%] rounded-xl px-3 py-2 text-[12px] leading-relaxed ${msg.role === "user" ? "rounded-tr-sm text-white/90" : "rounded-tl-sm text-white/75"}`}
                style={
                  msg.role === "user"
                    ? {
                        background:
                          "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.06))",
                        border: "1px solid rgba(16,185,129,0.18)",
                      }
                    : {
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }
                }
              >
                {msg.role === "assistant" ? (
                  <>
                    <div className="prose prose-invert prose-xs max-w-none prose-p:my-1 prose-headings:text-white/80 prose-headings:font-semibold prose-code:text-[#00E5A0] prose-code:bg-white/[0.06] prose-code:px-1 prose-code:rounded prose-code:text-[11px]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                    {msg.appliedToCanvas && (
                      <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-white/[0.06]">
                        <div className="w-1 h-1 rounded-full bg-emerald-400/80" />
                        <span className="text-[10px] text-emerald-400/60 font-medium">
                          Applied to canvas
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
              </div>
            </div>
          ))}

          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex gap-2"
              >
                <div
                  className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center border border-white/[0.06] mt-0.5"
                  style={{
                    background: "linear-gradient(145deg, #1E1E1E, #141414)",
                  }}
                >
                  <ArrowPathIcon className="w-3 h-3 text-[#10B981] animate-spin" />
                </div>
                <div
                  className="px-3 py-2 rounded-xl rounded-tl-sm text-[11px] text-white/40"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  {isDesigning ? (
                    <span className="font-mono text-[#10B981] animate-pulse">
                      Designing…
                    </span>
                  ) : (
                    <span className="flex gap-1">
                      {[0, 0.15, 0.3].map((d, i) => (
                        <motion.span
                          key={i}
                          className="w-1 h-1 rounded-full bg-[#10B981]/60 inline-block"
                          animate={{ y: [0, -3, 0] }}
                          transition={{
                            repeat: Infinity,
                            duration: 0.9,
                            delay: d,
                          }}
                        />
                      ))}
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* ── AI Chat input (pinned bottom) ── */}
      <div className="px-3 pb-3 pt-2 border-t border-white/[0.04]">
        <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-[#00E5A0]"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
          <span className="text-[10px] font-semibold text-white/30 tracking-widest uppercase">
            Meshwork AI
          </span>
          <span className="text-[8px] text-[#00E5A0]/60 border border-[rgba(0,229,160,0.2)] bg-[rgba(0,229,160,0.08)] px-1 py-0.5 rounded font-mono">
            BETA
          </span>
        </div>
        <form
          onSubmit={handleSubmit}
          className="relative flex items-end gap-1.5 rounded-xl p-1.5"
          style={{
            background: "rgba(20,20,20,0.9)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Describe your architecture…"
            className="flex-1 max-h-28 min-h-[36px] bg-transparent border-0 resize-none outline-none text-white/90 text-[12px] placeholder:text-white/20 px-2 py-2 leading-relaxed"
            rows={1}
          />
          <motion.button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-white transition-all disabled:cursor-default mb-0.5"
            style={{
              background:
                input.trim() && !isLoading
                  ? "linear-gradient(135deg, #00E5A0, #059669)"
                  : "rgba(255,255,255,0.04)",
              boxShadow:
                input.trim() && !isLoading
                  ? "0 2px 12px rgba(0,229,160,0.3)"
                  : "none",
            }}
            whileHover={input.trim() && !isLoading ? { scale: 1.05 } : {}}
            whileTap={input.trim() && !isLoading ? { scale: 0.95 } : {}}
          >
            <PaperAirplaneIcon
              className="w-3.5 h-3.5"
              style={{ opacity: input.trim() && !isLoading ? 1 : 0.2 }}
            />
          </motion.button>
        </form>
        <p className="text-[9px] text-white/15 text-center mt-1.5">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </motion.aside>
  );
}

// ── Shared save indicator ────────────────────────────────────────────
function SaveDot({
  saveStatus,
  onSave,
}: {
  saveStatus: "saved" | "saving" | "unsaved";
  onSave: () => void;
}) {
  if (saveStatus === "saving")
    return (
      <span className="text-[10px] text-blue-400/70 animate-pulse shrink-0">
        Saving…
      </span>
    );
  if (saveStatus === "unsaved")
    return (
      <span
        className="w-2 h-2 rounded-full bg-amber-400/70 cursor-pointer shrink-0 block"
        onClick={onSave}
        title="Unsaved changes — click to save"
      />
    );
  return <span className="text-[10px] text-white/20 shrink-0">Saved</span>;
}

// ── Menu popover content (shared between collapsed/expanded) ─────────
function MenuPopoverContent({
  canEdit,
  canDelete,
  isRenaming,
  renameValue,
  setRenameValue,
  onStartRename,
  onRename,
  setIsRenaming,
  onOpenSettings,
  onDuplicate,
  onCopyInvite,
  onExportPng,
  onExportSvg,
  onExportJson,
  onImportJson,
  isFullscreen,
  onToggleFullscreen,
  onDelete,
  setMenuOpen,
  importFileRef,
}: {
  canEdit: boolean;
  canDelete: boolean;
  isRenaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onStartRename: () => void;
  onRename: () => void;
  setIsRenaming: (v: boolean) => void;
  onOpenSettings: () => void;
  onDuplicate: () => void;
  onCopyInvite: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportJson: () => void;
  onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onDelete: () => void;
  setMenuOpen: (v: boolean) => void;
  importFileRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <PopoverContent
      className="w-52 p-1.5 bg-[#121214]/95 backdrop-blur-2xl border border-white/[0.08] rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_16px_48px_rgba(0,0,0,0.8)] z-[200]"
      side="right"
      align="start"
      sideOffset={8}
    >
      <Link href="/">
        <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/[0.07] transition-all">
          <ChevronLeftIcon className="w-3.5 h-3.5" />
          Back to Library
        </button>
      </Link>
      <Separator className="bg-white/[0.06] my-1" />

      {canEdit &&
        (isRenaming ? (
          <div className="px-2 py-1">
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRename();
                if (e.key === "Escape") setIsRenaming(false);
              }}
              onBlur={onRename}
              maxLength={24}
              className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.12] text-[12px] text-white/90 outline-none focus:border-white/25 transition-all"
              placeholder="Project name..."
            />
          </div>
        ) : (
          <button
            onClick={onStartRename}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/[0.07] transition-all"
          >
            <PencilIcon className="w-3.5 h-3.5" />
            Rename Project
          </button>
        ))}

      {canEdit && (
        <button
          onClick={() => {
            onOpenSettings();
            setMenuOpen(false);
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/[0.07] transition-all"
        >
          <Cog6ToothIcon className="w-3.5 h-3.5" />
          Workspace Settings
        </button>
      )}
      {canEdit && (
        <button
          onClick={onDuplicate}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/[0.07] transition-all"
        >
          <DocumentDuplicateIcon className="w-3.5 h-3.5" />
          Duplicate Project
        </button>
      )}

      <button
        onClick={onCopyInvite}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/[0.07] transition-all"
      >
        <LinkIcon className="w-3.5 h-3.5" />
        Share (Invite Code)
      </button>

      <Separator className="bg-white/[0.06] my-1" />

      <button
        onClick={onExportPng}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/[0.07] transition-all"
      >
        <ArrowDownTrayIcon className="w-3.5 h-3.5" />
        Export as PNG
      </button>
      <button
        onClick={onExportSvg}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/[0.07] transition-all"
      >
        <ArrowDownTrayIcon className="w-3.5 h-3.5" />
        Export as SVG
      </button>
      <button
        onClick={onExportJson}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/[0.07] transition-all"
      >
        <DocumentTextIcon className="w-3.5 h-3.5" />
        Export as JSON
      </button>
      {canEdit && (
        <>
          <button
            onClick={() => importFileRef.current?.click()}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/[0.07] transition-all"
          >
            <ArrowUpTrayIcon className="w-3.5 h-3.5" />
            Import JSON
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept=".json"
            onChange={onImportJson}
            className="hidden"
          />
        </>
      )}

      <Separator className="bg-white/[0.06] my-1" />

      <button
        onClick={() => {
          setMenuOpen(false);
          onToggleFullscreen();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/[0.07] transition-all"
      >
        {isFullscreen ? (
          <ArrowsPointingInIcon className="w-3.5 h-3.5" />
        ) : (
          <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
        )}
        {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
      </button>

      {canDelete && (
        <>
          <Separator className="bg-white/[0.06] my-1" />
          <button
            onClick={onDelete}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            Delete Project
          </button>
        </>
      )}
    </PopoverContent>
  );
}
