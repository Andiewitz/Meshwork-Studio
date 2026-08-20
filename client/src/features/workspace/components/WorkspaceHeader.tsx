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
  ShareIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  DocumentDuplicateIcon,
  PencilSquareIcon,
  TrashIcon,
  Cog6ToothIcon,
  PhotoIcon,
  DocumentTextIcon,
  Squares2X2Icon,
  BoltIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  Bars3BottomLeftIcon,
  CommandLineIcon,
} from "@heroicons/react/24/outline";
import { LuPanelLeft } from "react-icons/lu";
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [currentRoute, setCurrentRoute] = useState("Homepage");
  const importFileRef = useRef<HTMLInputElement>(null);

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

  return (
    <>
      <header className="h-11 w-full bg-[#111114] flex items-center z-30 select-none shrink-0 text-white font-sans text-xs">
        {/* ── Left Section: Logo, Project Name, Status, Undo/Redo, Sidebar Toggle ── */}
        <div
          className={`h-full flex items-center justify-between px-3 transition-all duration-300 ease-in-out shrink-0 ${
            isSidebarOpen
              ? "w-[360px] border-r border-white/[0.08]"
              : "w-auto border-b border-white/[0.08] gap-2"
          }`}
        >
          {/* Project Title & Context Menu */}
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/home">
              <button
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-all shrink-0"
                title="Dashboard"
              >
                <MeshworkLogo />
              </button>
            </Link>

            <Popover open={projectMenuOpen} onOpenChange={setProjectMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white/[0.06] transition-all group min-w-0"
                  title="Project Menu"
                >
                  <span className="text-[13px] font-semibold text-white/90 group-hover:text-white truncate max-w-[130px]">
                    {workspace?.title || "Bright Financial Companion"}
                  </span>
                  <ChevronDownIcon className="w-3 h-3 text-white/40 group-hover:text-white/70 transition-transform shrink-0" />
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
                        {userName}&apos;s Workspace
                      </div>
                      <div className="text-[10px] text-white/40 capitalize">
                        {userRole} Role
                      </div>
                    </div>
                  </div>
                </div>

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
                  </button>
                )}

                {canEdit && (
                  <button
                    onClick={() => {
                      setProjectMenuOpen(false);
                      openSettings();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
                  >
                    <Cog6ToothIcon className="w-3.5 h-3.5 text-white/40" />
                    Settings
                  </button>
                )}

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
                    <span className="text-[10px] font-mono text-white/30">
                      ⌘D
                    </span>
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
                      <div
                        className={`w-6 h-3.5 rounded-full transition-all ${snapToGrid ? "bg-emerald-500" : "bg-white/10"}`}
                      >
                        <div
                          className={`w-2.5 h-2.5 rounded-full bg-white mt-0.5 transition-all ${snapToGrid ? "ml-3" : "ml-0.5"}`}
                        />
                      </div>
                    </button>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-white/60">
                        <span>Grid Size</span>
                        <span className="font-mono text-[10px] text-white/40">
                          {gridSize}px
                        </span>
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
                      <span className="text-[10px] uppercase font-bold text-white/40">
                        Pattern
                      </span>
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
                    handleExportSvg();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  <PhotoIcon className="w-3.5 h-3.5 text-white/40" />
                  Export as SVG
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
                      onClick={() => importFileRef.current?.click()}
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
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                      Delete Project
                    </button>
                  </>
                )}
              </PopoverContent>
            </Popover>

            {/* Save Status dot */}
            <div
              className="flex items-center gap-1 text-[10px]"
              title={
                saveStatus === "saving"
                  ? "Saving..."
                  : saveStatus === "saved"
                    ? "All changes saved"
                    : "Unsaved changes"
              }
            >
              {saveStatus === "saving" ? (
                <ArrowPathIcon className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              ) : (
                <CheckCircleIcon
                  className={`w-3.5 h-3.5 ${
                    saveStatus === "saved"
                      ? "text-emerald-400"
                      : "text-white/20"
                  }`}
                />
              )}
            </div>
          </div>

          {/* Undo, Redo, and Sliding Sidebar Toggle at the edge of the sidebar column */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={undo}
              className="w-7 h-7 flex items-center justify-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-all"
              title="Undo (Ctrl+Z)"
            >
              <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={redo}
              className="w-7 h-7 flex items-center justify-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-all"
              title="Redo (Ctrl+Shift+Z)"
            >
              <ArrowUturnRightIcon className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-3.5 bg-white/[0.08] mx-0.5" />

            {/* Sliding Sidebar Toggle (Standard shadcn/ui PanelLeft icon) positioned on top of the edge of the sidebar */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-white/50 hover:text-white hover:bg-white/[0.06] transition-all"
              title={isSidebarOpen ? "Collapse Sidebar" : "Open Sidebar"}
            >
              <LuPanelLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Right Section (above canvas): breadcrumb + collaborators + share (HAS border-b to divide header from canvas) ── */}
        <div className="flex-1 h-full border-b border-white/[0.08] px-3 flex items-center justify-between min-w-0">
          {/* Center Section: project status breadcrumb */}
          <div className="hidden lg:flex items-center gap-1.5 text-white/40 text-[11px]">
            <span className="font-medium text-white/60 truncate max-w-[160px]">
              {workspace?.title ?? "Untitled"}
            </span>
          </div>

          {/* Right Section: Collaborators, Share, Upgrade, Publish */}
          <div className="flex items-center gap-2">
            {/* Live Collaborators */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center focus:outline-none cursor-pointer hover:opacity-90 transition-opacity">
                  <div className="flex -space-x-1.5 overflow-hidden">
                    <Avatar className="size-6 border border-[#111114] shadow-sm">
                      <AvatarImage src={user?.profileImageUrl || ""} />
                      <AvatarFallback className="text-[9px] font-bold bg-indigo-500/40 text-indigo-100">
                        {userInitial}
                      </AvatarFallback>
                    </Avatar>
                    {collaborators
                      .filter((c) => c.userId !== user?.id)
                      .slice(0, 2)
                      .map((u) => (
                        <Avatar
                          key={u.userId}
                          className="size-6 border border-[#111114]"
                        >
                          <AvatarFallback
                            className="text-[9px] font-bold"
                            style={{
                              backgroundColor: `${u.color}30`,
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
              <PopoverContent className="w-64 p-2 bg-[#121214]/95 backdrop-blur-2xl border border-white/[0.08] rounded-xl text-white z-[200]">
                <div className="text-[11px] font-bold text-white/60 mb-1">
                  Team Members ({teamMembers.length})
                </div>
                {teamMembers.map((m) => (
                  <div
                    key={m.userId}
                    className="flex items-center justify-between py-1 text-[11px] text-white/80"
                  >
                    <span>{m.firstName || m.email}</span>
                    <span className="text-white/40 capitalize">{m.role}</span>
                  </div>
                ))}
              </PopoverContent>
            </Popover>

            {/* Share Button */}
            <button
              onClick={handleCopyInvite}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-medium text-white/80 hover:text-white transition-all shadow-sm"
            >
              <ShareIcon className="w-3 h-3" />
              <span>Share</span>
            </button>

            {/* Upgrade Button */}
            <button
              onClick={openSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600/80 to-indigo-600/80 hover:from-purple-500 hover:to-indigo-500 border border-purple-500/30 text-[11px] font-semibold text-white transition-all shadow-[0_2px_12px_rgba(168,85,247,0.25)]"
            >
              <BoltIcon className="w-3 h-3 text-purple-200 fill-purple-200" />
              <span>Upgrade</span>
            </button>

            {/* Publish / Export Button */}
            <button
              onClick={handleExportPng}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[11px] font-semibold transition-all shadow-[0_2px_12px_rgba(59,130,246,0.3)] active:scale-95"
            >
              <span>Publish</span>
            </button>
          </div>
        </div>
      </header>

      {/* Rename Dialog */}
      <Dialog open={isRenaming} onOpenChange={setIsRenaming}>
        <DialogContent className="max-w-sm bg-[#121214] border border-white/[0.08] text-white rounded-2xl p-5 space-y-3">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Rename Project
            </DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleFinishRename();
              if (e.key === "Escape") setIsRenaming(false);
            }}
            className="w-full h-9 rounded-xl bg-white/[0.04] border border-white/[0.1] px-3 text-sm text-white outline-none focus:border-[#00E5A0]/50"
            placeholder="Project name..."
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setIsRenaming(false)}
              className="px-3 py-1.5 text-xs text-white/50 hover:text-white rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleFinishRename}
              className="px-4 py-1.5 bg-[#00E5A0] text-black font-semibold text-xs rounded-lg hover:brightness-110"
            >
              Save
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
