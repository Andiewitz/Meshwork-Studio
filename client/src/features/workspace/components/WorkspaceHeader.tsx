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
import { MeshworkLogo } from "@/components/MeshworkLogo";
import { CollaboratorsDialog } from "./CollaboratorsDialog";
import { WorkspaceMembers } from "./WorkspaceMembers";
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
  SunIcon,
  MoonIcon,
  MagnifyingGlassIcon,
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
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenSearch: () => void;
  workspace: any;
  workspaceId: string;
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
  handleExportPng: () => void;
  handleExportSvg: () => void;
  handleExportJson: () => void;
  handleImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDuplicate: () => void;
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
  theme,
  onToggleTheme,
  onOpenSearch,
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
  handleExportPng,
  handleExportSvg,
  handleExportJson,
  handleImportJson,
  handleDuplicate,
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
  const [sharingOpen, setSharingOpen] = useState(false);
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
      <header className="workspace-header h-11 w-full bg-[#111114] flex items-center justify-between gap-4 overflow-x-auto px-3 relative z-30 select-none shrink-0 ws-ink font-sans text-xs">
        {/* ── Left Section: Logo, Project Name, Status, Undo/Redo (always fixed on left) ── */}
        <div className="flex items-center gap-2 min-w-0 z-10">
          {/* Logo */}
          <Link href="/home">
            <button
              className="w-7 h-7 flex items-center justify-center rounded-lg ws-hover-surface transition-all shrink-0"
              title="Dashboard"
            >
              <MeshworkLogo />
            </button>
          </Link>

          {/* Project Title & Context Menu */}
          <Popover open={projectMenuOpen} onOpenChange={setProjectMenuOpen}>
            <PopoverTrigger asChild>
              <button
                className="flex items-center gap-1.5 px-2 py-1 rounded-md ws-hover-surface transition-all group min-w-0"
                title="Project Menu"
              >
                <span className="text-[13px] font-semibold ws-ink ws-group-hover-ink truncate max-w-[130px]">
                  {workspace?.title || "Bright Financial Companion"}
                </span>
                <ChevronDownIcon className="w-3 h-3 ws-muted ws-group-hover-ink transition-transform shrink-0" />
              </button>
            </PopoverTrigger>

            <PopoverContent
              className="workspace-popover w-72 p-2 ws-option backdrop-blur-2xl border ws-border rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_24px_54px_rgba(0,0,0,0.85)] z-[200] space-y-1 ws-ink"
              side="bottom"
              align="start"
              sideOffset={8}
            >
              <Link href="/home">
                <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium ws-ink ws-hover-ink ws-hover-surface transition-all">
                  <ChevronLeftIcon className="w-4 h-4 ws-muted" />
                  Dashboard
                </button>
              </Link>

              <div className="p-2.5 my-1 rounded-xl ws-surface-soft border ws-border flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-[11px] font-bold text-white shrink-0 shadow-md">
                    {userInitial}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold ws-ink truncate">
                      {userName}&apos;s Project
                    </div>
                    <div className="text-[10px] ws-muted capitalize">
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
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] ws-ink ws-hover-ink ws-hover-surface transition-all"
                >
                  <span className="flex items-center gap-2.5">
                    <PencilSquareIcon className="w-3.5 h-3.5 ws-muted" />
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
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] ws-ink ws-hover-ink ws-hover-surface transition-all"
                >
                  <Cog6ToothIcon className="w-3.5 h-3.5 ws-muted" />
                  Settings
                </button>
              )}

              {canEdit && (
                <button
                  onClick={() => {
                    setProjectMenuOpen(false);
                    handleDuplicate();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] ws-ink ws-hover-ink ws-hover-surface transition-all"
                >
                  <span className="flex items-center gap-2.5">
                    <DocumentDuplicateIcon className="w-3.5 h-3.5 ws-muted" />
                    Duplicate Project
                  </span>
                  <span className="text-[10px] font-mono ws-dim">⌘D</span>
                </button>
              )}

              <Popover>
                <PopoverTrigger asChild>
                  <button className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] ws-ink ws-hover-ink ws-hover-surface transition-all">
                    <span className="flex items-center gap-2.5">
                      <Squares2X2Icon className="w-3.5 h-3.5 ws-muted" />
                      Appearance & Grid
                    </span>
                    <ChevronRightIcon className="w-3 h-3 ws-dim" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="workspace-popover w-60 p-3 ws-option backdrop-blur-2xl border ws-border rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_20px_48px_rgba(0,0,0,0.8)] z-[300] space-y-3"
                  side="right"
                  align="start"
                  sideOffset={8}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider ws-muted">
                    Grid & Snapping
                  </div>
                  <button
                    onClick={() => setSnapToGrid(!snapToGrid)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${snapToGrid ? "text-emerald-400 bg-emerald-500/10" : "ws-muted ws-hover-surface"}`}
                  >
                    Snap to Grid
                    <div
                      className={`w-6 h-3.5 rounded-full transition-all ${snapToGrid ? "bg-emerald-500" : "ws-surface-soft"}`}
                    >
                      <div
                        className={`w-2.5 h-2.5 rounded-full ws-toggle-knob mt-0.5 transition-all ${snapToGrid ? "ml-3" : "ml-0.5"}`}
                      />
                    </div>
                  </button>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] ws-muted">
                      <span>Grid Size</span>
                      <span className="font-mono text-[10px] ws-muted">
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
                      className="w-full h-1 rounded-full appearance-none ws-surface-soft accent-[#00E5A0]"
                    />
                  </div>

                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] uppercase font-bold ws-muted">
                      Pattern
                    </span>
                    <div className="grid grid-cols-4 gap-1">
                      {BG_VARIANTS.map((v) => (
                        <button
                          key={v}
                          onClick={() => setBgVariant(v)}
                          className={`py-1 px-1.5 rounded-md text-[10px] font-medium transition-all ${bgVariant === v ? "ws-surface-soft ws-ink font-semibold" : "ws-muted ws-hover-ink ws-hover-surface"}`}
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
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] ws-ink ws-hover-ink ws-hover-surface transition-all"
              >
                <span className="flex items-center gap-2.5">
                  <CommandLineIcon className="w-3.5 h-3.5 ws-muted" />
                  Shortcuts
                </span>
                <span className="text-[10px] font-mono ws-dim">?</span>
              </button>

              <div className="h-px ws-surface-soft my-1" />

              <button
                onClick={() => {
                  setProjectMenuOpen(false);
                  handleExportPng();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] ws-ink ws-hover-ink ws-hover-surface transition-all"
              >
                <PhotoIcon className="w-3.5 h-3.5 ws-muted" />
                Export as PNG
              </button>
              <button
                onClick={() => {
                  setProjectMenuOpen(false);
                  handleExportSvg();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] ws-ink ws-hover-ink ws-hover-surface transition-all"
              >
                <PhotoIcon className="w-3.5 h-3.5 ws-muted" />
                Export as SVG
              </button>
              <button
                onClick={() => {
                  setProjectMenuOpen(false);
                  handleExportJson();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] ws-ink ws-hover-ink ws-hover-surface transition-all"
              >
                <DocumentTextIcon className="w-3.5 h-3.5 ws-muted" />
                Export as JSON
              </button>

              {canEdit && (
                <>
                  <button
                    onClick={() => importFileRef.current?.click()}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] ws-ink ws-hover-ink ws-hover-surface transition-all"
                  >
                    <ArrowUpTrayIcon className="w-3.5 h-3.5 ws-muted" />
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
                  <div className="h-px ws-surface-soft my-1" />
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
                  saveStatus === "saved" ? "text-emerald-400" : "ws-dim"
                }`}
              />
            )}
          </div>

          <div className="w-px h-3.5 ws-surface-soft mx-0.5" />

          {/* Undo (Always fixed on the left) */}
          <button
            onClick={undo}
            className="w-7 h-7 flex items-center justify-center rounded-md ws-muted ws-hover-ink ws-hover-surface transition-all"
            title="Undo (Ctrl+Z)"
          >
            <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
          </button>

          {/* Redo (Always fixed on the left) */}
          <button
            onClick={redo}
            className="w-7 h-7 flex items-center justify-center rounded-md ws-muted ws-hover-ink ws-hover-surface transition-all"
            title="Redo (Ctrl+Shift+Z)"
          >
            <ArrowUturnRightIcon className="w-3.5 h-3.5" />
          </button>

          {/* Sidebar Toggle when collapsed */}
          {!isSidebarOpen && (
            <>
              <div className="w-px h-3.5 ws-surface-soft mx-0.5" />
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="w-7 h-7 flex items-center justify-center rounded-md ws-muted ws-hover-ink ws-hover-surface transition-all"
                title="Open Sidebar"
              >
                <LuPanelLeft className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* ── Sidebar Toggle when open: positioned on top of the edge of the sidebar ── */}
        {isSidebarOpen && (
          <div className="absolute left-[324px] z-20 max-md:hidden transition-all duration-300">
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-md ws-muted ws-hover-ink ws-hover-surface transition-all"
              title="Collapse Sidebar"
            >
              <LuPanelLeft className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Center Section: Centralized Project Title ── */}
        <div className="absolute left-1/2 -translate-x-1/2 hidden lg:flex items-center justify-center pointer-events-none z-0">
          <span className="font-semibold ws-ink text-[13px] tracking-wide truncate max-w-[320px]">
            {workspace?.title ?? "Untitled Project"}
          </span>
        </div>

        {/* ── Right Section: Collaborators, Share, Upgrade, Publish ── */}
        <div className="flex items-center gap-2 z-10">
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search projects and canvas"
            title="Search (Ctrl/⌘ K)"
            className="flex h-8 w-8 items-center justify-center rounded-lg ws-muted ws-hover-surface ws-hover-ink transition-colors"
          >
            <MagnifyingGlassIcon className="h-4 w-4" />
          </button>
          <WorkspaceMembers
            workspaceId={workspaceId}
            isOwner={Boolean(user?.id && workspace?.userId === user.id)}
            user={user}
            online={collaborators}
            onShare={() => setSharingOpen(true)}
          />

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            title={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg ws-muted ws-hover-surface ws-hover-ink transition-colors"
          >
            {theme === "dark" ? (
              <SunIcon className="h-4 w-4" />
            ) : (
              <MoonIcon className="h-4 w-4" />
            )}
          </button>

          {/* Share Button */}
          <button
            onClick={() => setSharingOpen(true)}
            className="workspace-header-secondary flex items-center gap-1.5 px-3 py-1.5 rounded-lg ws-surface-soft ws-hover-surface border ws-border text-[11px] font-medium ws-ink ws-hover-ink transition-all shadow-sm"
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
            className="workspace-header-primary flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[11px] font-semibold transition-all shadow-[0_2px_12px_rgba(59,130,246,0.3)] active:scale-95"
          >
            <span>Publish</span>
          </button>
        </div>
      </header>

      <CollaboratorsDialog
        workspaceId={workspaceId}
        open={sharingOpen}
        onOpenChange={setSharingOpen}
        isOwner={Boolean(user?.id && workspace?.userId === user.id)}
        ownerName={userName}
      />

      {/* Rename Dialog */}
      <Dialog open={isRenaming} onOpenChange={setIsRenaming}>
        <DialogContent className="workspace-dialog max-w-sm ws-option border ws-border ws-ink rounded-2xl p-5 space-y-3">
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
            className="w-full h-9 rounded-xl ws-surface-soft border ws-border px-3 text-sm ws-ink outline-none focus:border-[#00E5A0]/50"
            placeholder="Project name..."
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setIsRenaming(false)}
              className="px-3 py-1.5 text-xs ws-muted ws-hover-ink rounded-lg"
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
