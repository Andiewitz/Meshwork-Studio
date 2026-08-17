import React, { useState, useRef } from "react";
import { Link } from "wouter";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import {
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SparklesIcon,
  ShareIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  DocumentDuplicateIcon,
  PencilSquareIcon,
  TrashIcon,
  Cog6ToothIcon,
  InformationCircleIcon,
  StarIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  PlayIcon,
  StopIcon,
  CommandLineIcon,
  PhotoIcon,
  DocumentTextIcon,
  Squares2X2Icon,
  ViewColumnsIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import {
  BG_VARIANTS,
  BG_VARIANT_LABELS,
  GRID_SIZE_MIN,
  GRID_SIZE_MAX,
  type EdgeType,
  type EdgeStyle,
  type BgVariant,
} from "@/features/workspace/utils/canvasSettings";

export interface WorkspaceHeaderProps {
  workspace: any;
  workspaceId: number;
  user: any;
  userRole: string;
  canEdit: boolean;
  canManage: boolean;
  canDelete: boolean;
  saveStatus: string;
  isSimulating: boolean;
  setIsSimulating: (sim: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  sidebarTab: "ai" | "nodes";
  setSidebarTab: (tab: "ai" | "nodes") => void;
  collaborators: { userId: string; name: string; color: string }[];
  teamMembers: any[];
  teamId?: string | number | null;
  updateRole: any;
  handleExportPng: () => void;
  handleExportSvg: () => void;
  handleExportJson: () => void;
  handleImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDuplicate: () => void;
  handleCopyInvite: () => void;
  handleDeleteWorkspace: () => void;
  handleRename: (newName: string) => void;
  openSettings: () => void;
  snapToGrid: boolean;
  setSnapToGrid: (v: boolean) => void;
  gridSize: number;
  setGridSize: (v: number) => void;
  hasArrow: boolean;
  setHasArrow: (v: boolean) => void;
  edgeType: EdgeType;
  setEdgeType: (v: EdgeType) => void;
  edgeStyle: EdgeStyle;
  setEdgeStyle: (v: EdgeStyle) => void;
  bgVariant: BgVariant;
  setBgVariant: (v: BgVariant) => void;
  canvasStack?: { nodeId: string; label: string }[];
  exitToLevel?: (level: number) => void;
  nodesCount?: number;
  edgesCount?: number;
  activeView?: "ai" | "canvas" | "properties";
  setActiveView?: (view: "ai" | "canvas" | "properties") => void;
}

export function WorkspaceHeader({
  workspace,
  workspaceId,
  user,
  userRole,
  canEdit,
  canManage,
  canDelete,
  saveStatus,
  isSimulating,
  setIsSimulating,
  undo,
  redo,
  isSidebarOpen,
  setIsSidebarOpen,
  sidebarTab,
  setSidebarTab,
  collaborators,
  teamMembers,
  teamId,
  updateRole,
  handleExportPng,
  handleExportSvg,
  handleExportJson,
  handleImportJson,
  handleDuplicate,
  handleCopyInvite,
  handleDeleteWorkspace,
  handleRename,
  openSettings,
  snapToGrid,
  setSnapToGrid,
  gridSize,
  setGridSize,
  hasArrow,
  setHasArrow,
  edgeType,
  setEdgeType,
  edgeStyle,
  setEdgeStyle,
  bgVariant,
  setBgVariant,
  canvasStack = [],
  exitToLevel,
  nodesCount = 0,
  edgesCount = 0,
  activeView = "canvas",
  setActiveView,
}: WorkspaceHeaderProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(workspace?.title || "");
  const [isStarred, setIsStarred] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        // fullscreen not supported or denied
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {
        // exit fullscreen failed
      });
      setIsFullscreen(false);
    }
  };

  const handleStartRename = () => {
    setRenameValue(workspace?.title || "");
    setIsRenaming(true);
  };

  const handleFinishRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== workspace?.title) {
      handleRename(trimmed);
    }
    setIsRenaming(false);
  };

  const isNested = canvasStack.length > 0;
  const userName = user?.firstName || user?.email?.split("@")[0] || "User";
  const userInitial = (userName[0] || "U").toUpperCase();

  const handleModeTabClick = (view: "ai" | "canvas" | "properties") => {
    if (view === "ai") {
      setIsSidebarOpen(true);
      setSidebarTab("ai");
    } else if (view === "canvas") {
      setIsSidebarOpen(false);
    } else if (view === "properties") {
      setIsSidebarOpen(false);
    }
    setActiveView?.(view);
  };

  const currentModeTab = isSidebarOpen ? (sidebarTab === "ai" ? "ai" : "canvas") : activeView;

  return (
    <>
      <header className="h-12 w-full bg-[#09090b]/90 backdrop-blur-xl border-b border-white/[0.08] px-3 flex items-center gap-2 z-30 select-none shrink-0 relative shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        {/* ── Left: Logo + Project Name ── */}
        <div className="flex items-center gap-1.5 min-w-0">
          <Link href="/home">
            <button
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/[0.06] transition-all group"
              title="Dashboard"
            >
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                <MeshworkLogo />
              </div>
            </button>
          </Link>

          {/* Project Context Menu */}
          <Popover open={projectMenuOpen} onOpenChange={setProjectMenuOpen}>
            <PopoverTrigger asChild>
              <button
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/[0.06] transition-all group min-w-0"
                title="Project Menu"
              >
                <span className="text-[13px] font-semibold text-white/90 group-hover:text-white truncate max-w-[180px]">
                  {workspace?.title || "Untitled"}
                </span>
                <ChevronDownIcon className="w-3.5 h-3.5 text-white/30 group-hover:text-white/60 transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </PopoverTrigger>

            <PopoverContent
              className="w-72 p-2 bg-[#121214]/95 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_24px_54px_rgba(0,0,0,0.85)] z-[200] space-y-1 text-white"
              side="bottom"
              align="start"
              sideOffset={8}
            >
              <Link href="/home">
                <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium text-white/70 hover:text-white hover:bg-white/[0.06] transition-all">
                  <ChevronLeftIcon className="w-4 h-4 text-white/40" />
                  Dashboard
                </button>
              </Link>

              <div className="p-2.5 my-1 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-[11px] font-bold text-white shrink-0 shadow-md">
                    {userInitial}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-white/90 truncate">
                      {userName}&apos;s Studio
                    </div>
                    <div className="text-[10px] text-white/40 capitalize">
                      {userRole} Role
                    </div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase bg-white/[0.08] text-white/70 border border-white/[0.08]">
                  Free
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-white/70 flex items-center gap-1.5">
                    <SparklesIcon className="w-3.5 h-3.5 text-[#00E5A0]" />
                    AI Credits
                  </span>
                  <span className="text-white/40 text-[10px] font-mono">
                    84 left
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#00E5A0] to-[#3B82F6]"
                    style={{ width: "84%" }}
                  />
                </div>
              </div>

              <div className="h-px bg-white/[0.06] my-1" />

              {canEdit && (
                <button
                  onClick={() => {
                    setProjectMenuOpen(false);
                    handleStartRename();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  <span className="flex items-center gap-2.5">
                    <PencilSquareIcon className="w-3.5 h-3.5 text-white/40" />
                    Rename
                  </span>
                  <span className="text-[10px] font-mono text-white/30">F2</span>
                </button>
              )}

              {canEdit && (
                <button
                  onClick={() => {
                    setProjectMenuOpen(false);
                    openSettings();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  <span className="flex items-center gap-2.5">
                    <Cog6ToothIcon className="w-3.5 h-3.5 text-white/40" />
                    Settings
                  </span>
                  <span className="text-[10px] font-mono text-white/30">Ctrl+,</span>
                </button>
              )}

              <button
                onClick={() => {
                  setProjectMenuOpen(false);
                  setDetailsOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
              >
                <InformationCircleIcon className="w-3.5 h-3.5 text-white/40" />
                Details
              </button>

              <button
                onClick={() => setIsStarred(!isStarred)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
              >
                <span className="flex items-center gap-2.5">
                  {isStarred ? (
                    <StarIconSolid className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <StarIcon className="w-3.5 h-3.5 text-white/40" />
                  )}
                  {isStarred ? "Starred" : "Star"}
                </span>
              </button>

              {canEdit && (
                <button
                  onClick={() => {
                    setProjectMenuOpen(false);
                    handleDuplicate();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  <span className="flex items-center gap-2.5">
                    <DocumentDuplicateIcon className="w-3.5 h-3.5 text-white/40" />
                    Duplicate Project
                  </span>
                  <span className="text-[10px] font-mono text-white/30">⌘D</span>
                </button>
              )}

              <Popover>
                <PopoverTrigger asChild>
                  <button className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all">
                    <span className="flex items-center gap-2.5">
                      <Squares2X2Icon className="w-3.5 h-3.5 text-white/40" />
                      Appearance & Grid
                    </span>
                    <ChevronRightIcon className="w-3 h-3 text-white/30" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-60 p-3 bg-[#121214]/95 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_20px_48px_rgba(0,0,0,0.8)] z-[300] space-y-3"
                  side="right"
                  align="start"
                  sideOffset={8}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                    Grid & Snapping
                  </div>
                  <button
                    onClick={() => setSnapToGrid(!snapToGrid)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${snapToGrid ? "text-emerald-400 bg-emerald-500/10" : "text-white/50 hover:bg-white/[0.06]"}`}
                  >
                    Snap to Grid
                    <div className={`w-6 h-3.5 rounded-full transition-all ${snapToGrid ? "bg-emerald-500" : "bg-white/10"}`}>
                      <div className={`w-2.5 h-2.5 rounded-full bg-white mt-0.5 transition-all ${snapToGrid ? "ml-3" : "ml-0.5"}`} />
                    </div>
                  </button>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-white/60">
                      <span>Grid Size</span>
                      <span className="font-mono text-[10px] text-white/40">{gridSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={GRID_SIZE_MIN}
                      max={GRID_SIZE_MAX}
                      step={5}
                      value={gridSize}
                      onChange={(e) => setGridSize(Number(e.target.value))}
                      className="w-full h-1 rounded-full appearance-none bg-white/10 accent-[#00E5A0]"
                    />
                  </div>

                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] uppercase font-bold text-white/40">Pattern</span>
                    <div className="grid grid-cols-4 gap-1">
                      {BG_VARIANTS.map((v) => (
                        <button
                          key={v}
                          onClick={() => setBgVariant(v)}
                          className={`py-1 px-1.5 rounded-md text-[10px] font-medium transition-all ${bgVariant === v ? "bg-white/15 text-white font-semibold" : "text-white/40 hover:text-white/70 hover:bg-white/5"}`}
                        >
                          {BG_VARIANT_LABELS[v]}
                        </button>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <button
                onClick={() => {
                  setProjectMenuOpen(false);
                  setShortcutsOpen(true);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
              >
                <span className="flex items-center gap-2.5">
                  <CommandLineIcon className="w-3.5 h-3.5 text-white/40" />
                  Shortcuts
                </span>
                <span className="text-[10px] font-mono text-white/30">?</span>
              </button>

              <div className="h-px bg-white/[0.06] my-1" />

              <button
                onClick={() => {
                  setProjectMenuOpen(false);
                  handleExportPng();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
              >
                <PhotoIcon className="w-3.5 h-3.5 text-white/40" />
                Export as PNG
              </button>

              <button
                onClick={() => {
                  setProjectMenuOpen(false);
                  handleExportJson();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
              >
                <DocumentTextIcon className="w-3.5 h-3.5 text-white/40" />
                Export as JSON
              </button>

              {canEdit && (
                <>
                  <button
                    onClick={() => {
                      setProjectMenuOpen(false);
                      importFileRef.current?.click();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
                  >
                    <ArrowUpTrayIcon className="w-3.5 h-3.5 text-white/40" />
                    Import JSON
                  </button>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".json"
                    onChange={handleImportJson}
                    className="hidden"
                  />
                </>
              )}

              {canDelete && (
                <>
                  <div className="h-px bg-white/[0.06] my-1" />
                  <button
                    onClick={() => {
                      setProjectMenuOpen(false);
                      handleDeleteWorkspace();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] text-red-400/80 hover:text-red-300 hover:bg-red-500/10 transition-all"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                    Delete Project
                  </button>
                </>
              )}

              <div className="p-2.5 mt-1 rounded-xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/20 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-white/80">Invite team members</span>
                <button
                  onClick={() => {
                    setProjectMenuOpen(false);
                    handleCopyInvite();
                  }}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/10 hover:bg-white/20 text-white transition-all"
                >
                  Invite
                </button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Breadcrumb if nested */}
          {isNested && (
            <div className="flex items-center gap-1 pl-1">
              <ChevronRightIcon className="w-3 h-3 text-white/20" />
              <button
                onClick={() => exitToLevel?.(0)}
                className="text-[11px] text-white/40 hover:text-white transition-colors"
              >
                Root
              </button>
              {canvasStack.map((lvl) => (
                <React.Fragment key={lvl.nodeId}>
                  <ChevronRightIcon className="w-3 h-3 text-white/20" />
                  <span className="text-[11px] font-semibold text-[#00E5A0]">
                    {lvl.label}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* ── Center: Undo/Redo + Mode Tabs + Simulate ── */}
        <div className="flex-1 flex items-center justify-center gap-3">
          {/* Undo / Redo */}
          {canEdit && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={undo}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-all"
                title="Undo (Ctrl+Z)"
              >
                <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={redo}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-all"
                title="Redo (Ctrl+Y)"
              >
                <ArrowUturnRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Mode Tabs - Pill shaped segmented control */}
          <nav className="flex items-center gap-0.5 bg-white/[0.04] p-0.5 rounded-2xl border border-white/[0.08]">
            <button
              onClick={() => handleModeTabClick("ai")}
              className={`flex items-center gap-1.5 h-7 px-3 rounded-xl text-[11px] font-semibold transition-all ${
                currentModeTab === "ai"
                  ? "bg-[#00E5A0]/15 text-[#00E5A0] shadow-[0_0_12px_rgba(0,229,160,0.15)]"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              <SparklesIcon className="w-3 h-3" />
              <span>Mosh AI</span>
            </button>
            <button
              onClick={() => handleModeTabClick("canvas")}
              className={`flex items-center gap-1.5 h-7 px-3 rounded-xl text-[11px] font-semibold transition-all ${
                currentModeTab === "canvas"
                  ? "bg-white/[0.12] text-white shadow-sm"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              <CubeIcon className="w-3 h-3" />
              <span>Canvas</span>
            </button>
          </nav>

          {/* Simulate Mode */}
          <button
            onClick={() => setIsSimulating(!isSimulating)}
            className={`flex items-center gap-1.5 h-7 px-2.5 rounded-xl text-[11px] font-bold tracking-wide transition-all ${
              isSimulating
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_16px_rgba(16,185,129,0.3)] animate-pulse"
                : "text-white/40 hover:text-white/70 hover:bg-white/[0.06]"
            }`}
          >
            {isSimulating ? (
              <>
                <StopIcon className="w-3 h-3 fill-emerald-400" />
                LIVE
              </>
            ) : (
              <>
                <PlayIcon className="w-3 h-3" />
                Simulate
              </>
            )}
          </button>
        </div>

        {/* ── Right: Sidebar Toggle + Collaborators + Share + Export ── */}
        <div className="flex items-center gap-1.5">
          {/* Sidebar Toggle */}
          {canEdit && (
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${
                isSidebarOpen
                  ? "text-[#00E5A0] bg-[#00E5A0]/10"
                  : "text-white/40 hover:text-white hover:bg-white/[0.06]"
              }`}
              title={isSidebarOpen ? "Collapse sidebar" : "Open sidebar"}
            >
              <ViewColumnsIcon className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Collaborator Avatars */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center focus:outline-none cursor-pointer hover:opacity-90 transition-opacity">
                <div className="flex -space-x-1.5 overflow-hidden">
                  <Avatar
                    className="size-6 border-2 border-[#09090b] shadow-sm"
                    title={`${userName} (you)`}
                  >
                    <AvatarImage src={user?.profileImageUrl || ""} />
                    <AvatarFallback className="text-[9px] font-bold bg-indigo-500/40 text-indigo-100">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                  {collaborators
                    .filter((c) => c.userId !== user?.id)
                    .slice(0, 3)
                    .map((u) => (
                      <Avatar
                        key={u.userId}
                        className="size-6 border-2 border-[#09090b] shadow-sm"
                        title={u.name}
                      >
                        <AvatarFallback
                          className="text-[9px] font-bold"
                          style={{
                            backgroundColor: `${u.color}33`,
                            color: u.color,
                          }}
                        >
                          {u.name[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-72 p-2 bg-[#121214]/95 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_16px_48px_rgba(0,0,0,0.8)] z-[200]"
              side="bottom"
              align="end"
              sideOffset={8}
            >
              <div className="px-2.5 py-1.5 border-b border-white/[0.06] flex items-center justify-between text-[11px] font-bold text-white/50 uppercase tracking-wider">
                <span>Team & Collaborators</span>
                <span className="text-[10px] text-white/30 font-normal">
                  {teamMembers.length} member{teamMembers.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto py-1 space-y-0.5">
                {teamMembers.map((m) => (
                  <div
                    key={m.userId}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border"
                        style={{
                          borderColor: m.color,
                          backgroundColor: `${m.color}22`,
                          color: m.color,
                        }}
                      >
                        {(m.firstName || m.email)?.[0]?.toUpperCase()}
                      </div>
                      <span className="text-[11px] text-white/80 truncate">
                        {m.firstName || m.email?.split("@")[0]}
                        {m.userId === user?.id ? " (you)" : ""}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold uppercase text-white/40 tracking-wider">
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <div className="h-4 w-px bg-white/[0.08]" />

          {/* Share */}
          <button
            onClick={handleCopyInvite}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-all"
            title="Share & Invite"
          >
            <ShareIcon className="w-3.5 h-3.5" />
          </button>

          {/* Export */}
          <button
            onClick={handleExportPng}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-semibold text-white/80 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] transition-all"
            title="Export as PNG"
          >
            <ArrowDownTrayIcon className="w-3 h-3" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </header>

      {/* Rename Dialog */}
      <Dialog open={isRenaming} onOpenChange={setIsRenaming}>
        <DialogContent className="max-w-sm bg-[#121214]/95 backdrop-blur-2xl border border-white/[0.08] text-white rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              Rename Architecture Project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <input
              autoFocus
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFinishRename();
                if (e.key === "Escape") setIsRenaming(false);
              }}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.12] text-white text-sm outline-none focus:border-[#00E5A0]"
              placeholder="Project name..."
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsRenaming(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleFinishRename}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#00E5A0] text-black hover:brightness-110"
              >
                Save
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md bg-[#121214]/95 backdrop-blur-2xl border border-white/[0.08] text-white rounded-2xl p-5 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Project Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-xs text-white/70">
            <div className="flex justify-between py-1.5 border-b border-white/[0.06]">
              <span className="text-white/40">Title</span>
              <span className="font-semibold text-white">{workspace?.title}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-white/[0.06]">
              <span className="text-white/40">Total Nodes</span>
              <span className="font-mono">{nodesCount}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-white/[0.06]">
              <span className="text-white/40">Total Connections</span>
              <span className="font-mono">{edgesCount}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-white/[0.06]">
              <span className="text-white/40">Created At</span>
              <span>
                {workspace?.createdAt
                  ? new Date(workspace.createdAt).toLocaleDateString()
                  : "Recently"}
              </span>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setDetailsOpen(false)}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shortcuts Dialog */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-lg bg-[#121214]/95 backdrop-blur-2xl border border-white/[0.08] text-white rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <CommandLineIcon className="w-4 h-4 text-[#00E5A0]" />
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 pt-3 text-xs">
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#00E5A0]">
                Navigation & Modes
              </div>
              <div className="flex justify-between text-white/70">
                <span>Select Tool</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">V</kbd>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Pan Tool</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">H</kbd>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Search Nodes</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">⌘K</kbd>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Fit Canvas View</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">Ctrl+0</kbd>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#3B82F6]">
                Canvas Actions
              </div>
              <div className="flex justify-between text-white/70">
                <span>Undo</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">Ctrl+Z</kbd>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Redo</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">Ctrl+Y</kbd>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Duplicate Node</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">Ctrl+D</kbd>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Delete Selected</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">Del / ⌫</kbd>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
