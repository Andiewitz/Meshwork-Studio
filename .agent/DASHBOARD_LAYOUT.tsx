"use client";

import { useState, useEffect, useCallback } from "react";
import type { Workspace, Project, Design } from "@/types/database";
import {
  Plus,
  Trash2,
  FolderKanban,
  Clock,
  Users,
  FileText,
  Search,
  Bell,
  Crown,
  ChevronRight,
  Star,
  Grid3X3,
  List,
  ChevronDown,
  LayoutGrid,
} from "lucide-react";

// ============================================================
// COLOR PALETTE
// ============================================================
// --bg-body:       #1e1e1e
// --bg-sidebar:    #252525
// --bg-card:       #2c2c2c
// --border:        #3a3a3a
// --accent:        #6c63ff  (purple — buttons, badges, active states)
// --accent-hover:  #5a54e6
// --text:          #e0e0e0  (foreground)
// --text-muted:    #888     (muted-foreground)
// --active-bg:     #3a3a3a  (sidebar selected, active tabs)

// ============================================================
// OVERALL STRUCTURE
// ============================================================
// <div flex h-screen overflow-hidden>
//   ├── <aside>  Sidebar (240px fixed, bg-[#252525], border-r)
//   └── <div>    Main area (flex-1, flex-col)
//       ├── <header>   Top bar (h-12, border-b, bg-background)
//       └── <div>      Scrollable content
//           ├── Tab bar (border-b, bg-background)
//           └── Projects grid (p-6)

interface WorkspaceViewProps {
  onOpenDesign: (designId: string) => void;
  // Replace these with your own service calls / types
  workspaces: Workspace[];
  projects: Project[];
  designs: Record<string, Design[]>;
  selectedWs: Workspace | null;
  onSelectWorkspace: (ws: Workspace) => void;
  onCreateProject: (name: string) => void;
  onDeleteProject: (id: string) => void;
  onCreateDesign: (projectId: string) => void;
  onCreateWorkspace: (name: string) => void;
}

export function Dashboard({
  onOpenDesign,
  workspaces,
  projects,
  designs,
  selectedWs,
  onSelectWorkspace,
  onCreateProject,
  onDeleteProject,
  onCreateDesign,
  onCreateWorkspace,
}: WorkspaceViewProps) {
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [createWsOpen, setCreateWsOpen] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [teamOpen, setTeamOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ===== SIDEBAR ===== */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-border bg-[#252525]">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-[#6c63ff] text-[10px] font-bold text-white">
            S
          </div>
          <span className="text-sm font-semibold text-foreground truncate">
            YourApp
          </span>
          <button className="ml-auto text-muted-foreground hover:text-foreground">
            <Bell className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search"
              className="bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground w-full"
            />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-1">
          <div className="space-y-0.5">
            <button className="flex w-full items-center gap-2.5 rounded-md bg-[#3a3a3a] px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors">
              <Clock className="h-4 w-4 shrink-0" />
              <span>Recents</span>
            </button>
            <button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-[#2c2c2c] hover:text-foreground">
              <Users className="h-4 w-4 shrink-0" />
              <span>Community</span>
            </button>
          </div>

          {/* Team section */}
          <div className="mt-4">
            <button
              onClick={() => setTeamOpen(!teamOpen)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronRight
                className={`h-3 w-3 shrink-0 transition-transform ${teamOpen ? "rotate-90" : ""}`}
              />
              <span className="truncate">
                {selectedWs?.name || "No workspace"}
              </span>
              <span className="ml-auto shrink-0 rounded bg-[#6c63ff]/20 px-1.5 py-0.5 text-[10px] font-medium text-[#6c63ff]">
                Free
              </span>
            </button>
            {teamOpen && (
              <div className="ml-3 space-y-0.5 border-l border-border pl-3">
                {[FileText, FolderKanban, FolderKanban, Trash2].map(
                  (Icon, i) => (
                    <button
                      key={i}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-[#2c2c2c] hover:text-foreground"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>
                        {["Drafts", "All projects", "Resources", "Trash"][i]}
                      </span>
                    </button>
                  ),
                )}
              </div>
            )}
          </div>

          {/* Workspaces */}
          <div className="mt-4">
            <p className="mb-1 px-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Workspaces
            </p>
            <div className="space-y-0.5">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => onSelectWorkspace(ws)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                    ws.id === selectedWs?.id
                      ? "bg-[#3a3a3a] font-medium text-foreground"
                      : "text-muted-foreground hover:bg-[#2c2c2c] hover:text-foreground"
                  }`}
                >
                  <FolderKanban className="h-4 w-4 shrink-0" />
                  <span className="truncate">{ws.name}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setCreateWsOpen(true)}
              className="mt-1 flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-[#2c2c2c] hover:text-foreground"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>New workspace</span>
            </button>
          </div>

          {/* Starred */}
          <div className="mt-4">
            <button className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ChevronRight className="h-3 w-3 shrink-0" />
              <Star className="h-3 w-3 shrink-0" />
              <span>Starred</span>
            </button>
          </div>
        </nav>

        {/* Upgrade banner */}
        <div className="mx-3 mb-3 rounded-lg border border-border bg-background p-3">
          <div className="mb-2 flex items-center gap-2">
            <Crown className="h-4 w-4 text-muted-foreground" />
            <span className="text-[11px] font-medium text-foreground">
              Upgrade for premium
            </span>
          </div>
          <button className="w-full rounded-md bg-[#6c63ff] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#5a54e6]">
            View plans
          </button>
        </div>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
          <h1 className="text-sm font-semibold text-foreground">Recents</h1>
          <div className="flex items-center gap-1.5">
            {["Design", "FigJam", "Slides", "Make", "Buzz", "Site"].map(
              (label) => (
                <button
                  key={label}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-[#2c2c2c] hover:text-foreground"
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </header>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Tab bar */}
          <div className="flex items-center justify-between border-b border-border bg-background px-6 py-2">
            <div className="flex items-center gap-1">
              {["Recently viewed", "Shared files", "Shared projects"].map(
                (tab, i) => (
                  <button
                    key={tab}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                      i === 0
                        ? "bg-[#3a3a3a] text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab}
                  </button>
                ),
              )}
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                All files <ChevronDown className="h-3 w-3" />
              </button>
              <div className="flex items-center rounded-md border border-border">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`flex h-7 w-7 items-center justify-center ${
                    viewMode === "grid"
                      ? "bg-[#3a3a3a] text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  <Grid3X3 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`flex h-7 w-7 items-center justify-center ${
                    viewMode === "list"
                      ? "bg-[#3a3a3a] text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Projects grid */}
          <div className="p-6">
            {!selectedWs ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2c2c2c]">
                  <FolderKanban className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="mb-1 text-sm font-medium text-foreground">
                  No workspace selected
                </p>
                <p className="text-xs text-muted-foreground">
                  Create a workspace from the sidebar.
                </p>
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2c2c2c]">
                  <Plus className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="mb-1 text-sm font-medium text-foreground">
                  No projects yet
                </p>
                <p className="mb-4 text-xs text-muted-foreground">
                  Create your first project to start designing.
                </p>
                <button
                  onClick={() => setCreateProjectOpen(true)}
                  className="rounded-lg bg-[#6c63ff] px-4 py-2 text-xs font-medium text-white hover:bg-[#5a54e6] transition-all duration-150 active:scale-95"
                >
                  New project
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {projects.length} project{projects.length !== 1 ? "s" : ""}
                  </h3>
                  <button
                    onClick={() => setCreateProjectOpen(true)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" /> New project
                  </button>
                </div>
                <div
                  className={`grid gap-4 ${
                    viewMode === "grid"
                      ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
                      : "grid-cols-1"
                  }`}
                >
                  {projects.map((project, i) => {
                    const colors = [
                      "#6c63ff",
                      "#f25c54",
                      "#4fc3f7",
                      "#ff9800",
                      "#66bb6a",
                      "#e91e63",
                      "#b0bec5",
                    ];
                    const color = colors[i % colors.length];
                    const projectDesigns = designs[project.id] || [];

                    return (
                      <div
                        key={project.id}
                        className="group rounded-lg border border-border bg-card transition-all duration-200 hover:bg-[#333] hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20"
                      >
                        {/* Thumbnail */}
                        <div
                          className="relative h-[140px] w-full rounded-t-lg cursor-pointer overflow-hidden"
                          style={{ backgroundColor: color + "18" }}
                          onClick={() => {
                            if (projectDesigns.length > 0) {
                              onOpenDesign(projectDesigns[0].id);
                            } else {
                              onCreateDesign(project.id);
                            }
                          }}
                        >
                          <div
                            className="absolute inset-2 rounded-md"
                            style={{ backgroundColor: color + "12" }}
                          />
                          {projectDesigns.length > 0 && (
                            <div className="absolute bottom-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/80">
                              {projectDesigns.length} design
                              {projectDesigns.length !== 1 ? "s" : ""}
                            </div>
                          )}
                        </div>
                        {/* Footer */}
                        <div className="flex items-center justify-between border-t border-border px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-foreground">
                              {project.name}
                            </p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              Edited{" "}
                              {new Date(
                                project.updated_at,
                              ).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onCreateDesign(project.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                              title="New design"
                            >
                              <LayoutGrid className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => onDeleteProject(project.id)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===== CREATE PROJECT MODAL ===== */}
      {createProjectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-[380px] rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              New project
            </h3>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newProjectName.trim()) {
                  onCreateProject(newProjectName.trim());
                  setNewProjectName("");
                  setCreateProjectOpen(false);
                }
              }}
              placeholder="Project name"
              autoFocus
              className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[#6c63ff] transition-colors"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCreateProjectOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newProjectName.trim()) {
                    onCreateProject(newProjectName.trim());
                    setNewProjectName("");
                    setCreateProjectOpen(false);
                  }
                }}
                disabled={!newProjectName.trim()}
                className="rounded-lg bg-[#6c63ff] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#5a54e6] disabled:opacity-50 transition-all duration-150 active:scale-95"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CREATE WORKSPACE MODAL ===== */}
      {createWsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-[380px] rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              New workspace
            </h3>
            <input
              type="text"
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newWsName.trim()) {
                  onCreateWorkspace(newWsName.trim());
                  setNewWsName("");
                  setCreateWsOpen(false);
                }
              }}
              placeholder="Workspace name"
              autoFocus
              className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[#6c63ff] transition-colors"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCreateWsOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newWsName.trim()) {
                    onCreateWorkspace(newWsName.trim());
                    setNewWsName("");
                    setCreateWsOpen(false);
                  }
                }}
                disabled={!newWsName.trim()}
                className="rounded-lg bg-[#6c63ff] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#5a54e6] disabled:opacity-50 transition-all duration-150 active:scale-95"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
