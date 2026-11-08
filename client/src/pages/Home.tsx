import { useState, useMemo, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation } from "wouter";
import {
  useWorkspaces,
  useDeleteWorkspace,
  useCreateWorkspace,
} from "@/hooks/use-workspaces";
import { useAuth } from "@/hooks/use-auth";
import { secureFetch } from "@/lib/secure-fetch";
import { formatUserErrorMessage } from "@/lib/error-utils";
import { WorkspaceCard } from "@/features/workspace/components/WorkspaceCard";
import { CreateWorkspaceDialog } from "@/features/workspace/components/CreateWorkspaceDialog";
import {
  MagnifyingGlassIcon as Search,
  Squares2X2Icon as LayoutGrid,
  Bars3Icon as List,
  CubeIcon as Package,
  PlusIcon as Plus,
} from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";

const TABS = ["My projects", "Recently viewed"] as const;
type Tab = (typeof TABS)[number];

export default function Home() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const {
    data: workspaces,
    isLoading: isWorkspacesLoading,
    isError: isWorkspacesError,
    error: workspacesError,
    isFetching: isWorkspacesFetching,
    refetch: refetchWorkspaces,
  } = useWorkspaces();
  const deleteWorkspace = useDeleteWorkspace();
  const createWorkspace = useCreateWorkspace();

  const [isGeneratingBlueprint, setIsGeneratingBlueprint] = useState(false);

  useEffect(() => {
    const pendingTemplateStr = localStorage.getItem(
      "meshwork_pending_template",
    );
    if (pendingTemplateStr && user && !isGeneratingBlueprint) {
      setIsGeneratingBlueprint(true);
      const executeTemplateCreation = async () => {
        try {
          const template = JSON.parse(pendingTemplateStr);
          const ws = await createWorkspace.mutateAsync({
            title: template.title,
            description: template.description,
            type: "architecture",
            groups: [],
            tags: [template.category],
          });
          const normalizedEdges = template.edges.map(
            (edge: { animated?: boolean; [key: string]: unknown }) => ({
              ...edge,
              animated: edge.animated ? 1 : 0,
            }),
          );
          await secureFetch(`/api/v1/workspaces/${ws.id}/canvas`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nodes: template.nodes,
              edges: normalizedEdges,
              baseRevision: 0,
            }),
          });
          localStorage.removeItem("meshwork_pending_template");
          setLocation(`/workspace/${ws.id}`);
        } catch (e) {
          console.error("Failed to generate blueprint:", e);
          setIsGeneratingBlueprint(false);
          localStorage.removeItem("meshwork_pending_template");
        }
      };
      executeTemplateCreation();
    }
  }, [user, createWorkspace, setLocation, isGeneratingBlueprint]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("My projects");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const isWorkspacesPage = location === "/workspaces";

  const handleDelete = (id: string) => {
    deleteWorkspace.mutate(id);
  };

  const firstName = user?.firstName || user?.email?.split("@")[0] || "there";

  const filteredWorkspaces = useMemo(() => {
    if (!workspaces) return [];
    let result = workspaces.filter(
      (ws) =>
        ws.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ws.type.toLowerCase().includes(searchTerm.toLowerCase()),
    );
    if (activeTab === "Recently viewed") {
      result = [...result].sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      });
    } else {
      result = [...result].sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      });
    }
    return result;
  }, [workspaces, searchTerm, activeTab]);

  const displayWorkspaces = isWorkspacesPage
    ? filteredWorkspaces
    : filteredWorkspaces.slice(0, 20);

  return (
    <>
      <Helmet>
        <title>{isWorkspacesPage ? "Workspaces" : "Home"}</title>
      </Helmet>

      {/* Blueprint Generation Banner */}
      {isGeneratingBlueprint && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-primary/10 border-b border-primary/20 px-6 py-2 flex items-center justify-center animate-pulse">
          <span className="text-xs text-primary font-medium">
            Generating Architecture Blueprint... Please wait.
          </span>
        </div>
      )}

      {/* Main Canvas view sitting inside DashboardLayout's rounded container */}
      <div className="home-canvas relative flex-1 flex flex-col justify-between overflow-hidden dashboard-home-surface min-h-full">
        {/* ── Rich Gradient Blobs Background ── */}
        <div className="dashboard-ambience absolute inset-0 pointer-events-none overflow-hidden -z-0">
          {/* Top blue veil */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute -top-[25%] -left-[10%] w-[75%] h-[75%] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(37,99,235,0.65) 0%, rgba(30,58,138,0.45) 50%, transparent 75%)",
              filter: "blur(80px)",
            }}
          />
          {/* Center purple glow */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 2.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="absolute top-[0%] left-[20%] w-[70%] h-[70%] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(124,58,237,0.5) 0%, rgba(139,92,246,0.3) 45%, transparent 70%)",
              filter: "blur(90px)",
            }}
          />
          {/* Magenta / Hot pink vibrant bloom */}
          <motion.div
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 2.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="absolute top-[15%] right-[-15%] w-[70%] h-[75%] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(236,72,153,0.65) 0%, rgba(219,39,119,0.45) 40%, rgba(147,51,234,0.25) 65%, transparent 80%)",
              filter: "blur(75px)",
            }}
          />
          {/* Bottom cyan/blue accent */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 3.0, ease: "easeOut", delay: 0.3 }}
            className="absolute bottom-[25%] left-[10%] w-[45%] h-[40%] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(59,130,246,0.35) 0%, transparent 70%)",
              filter: "blur(70px)",
            }}
          />
        </div>

        {/* ── Center Hero ── */}
        <div className="flex-1 flex flex-col items-center justify-center pt-10 pb-6 relative z-10 px-6">
          {/* Heading */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="flex flex-col items-center text-center"
          >
            <h1 className="text-[clamp(2.2rem,4vw,3.2rem)] font-bold dashboard-ink leading-tight tracking-tight mb-3 font-headline">
              What should we build, {firstName}?
            </h1>
            <p className="text-[14.5px] dashboard-secondary mb-8 max-w-md leading-relaxed">
              Design, auto-sync, and manage cloud infrastructure diagrams.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => setIsCreateOpen(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl dashboard-primary font-semibold text-sm dashboard-primary-hover active:scale-95 transition-all shadow-[0_0_25px_rgba(255,255,255,0.15)] cursor-figma-pointer"
              >
                <Plus className="w-4 h-4" />
                New workspace
              </button>
              <Link
                href="/templates"
                className="dashboard-templates-button flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-colors"
              >
                <Package className="h-4 w-4" /> Browse templates
              </Link>
            </div>
          </motion.div>
        </div>

        {/* ── Bottom Floating Card Container (Nested inside the curved canvas) ── */}
        <div className="p-4 sm:p-6 relative z-20 shrink-0">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="home-projects w-full dashboard-projects-surface backdrop-blur-2xl border dashboard-border rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col min-h-[480px] max-h-[600px]"
          >
            {/* Header / Tabs */}
            <div className="flex items-center justify-between pb-3 border-b dashboard-border mb-3">
              <div className="flex items-center gap-2">
                {/* Search icon button */}
                <div className="relative flex items-center">
                  <Search className="absolute left-2.5 w-3.5 h-3.5 dashboard-muted" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    type="text"
                    placeholder="Search..."
                    className="dashboard-tint border dashboard-border rounded-xl pl-8 pr-3 py-1.5 text-xs dashboard-ink dashboard-placeholder outline-none dashboard-focus-border transition-colors w-36 sm:w-44"
                  />
                </div>

                {/* Tabs */}
                {TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-all cursor-figma-pointer ${
                      activeTab === tab
                        ? "dashboard-tint dashboard-ink"
                        : "dashboard-muted dashboard-hover-ink dashboard-hover-tint"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {/* View toggle */}
                <div className="flex items-center rounded-xl border dashboard-border overflow-hidden p-0.5 dashboard-tint">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors cursor-figma-pointer ${
                      viewMode === "grid"
                        ? "dashboard-tint dashboard-ink"
                        : "dashboard-muted dashboard-hover-ink"
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors cursor-figma-pointer ${
                      viewMode === "list"
                        ? "dashboard-tint dashboard-ink"
                        : "dashboard-muted dashboard-hover-ink"
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                </div>

                {!isWorkspacesPage && filteredWorkspaces.length > 20 && (
                  <Link href="/workspaces">
                    <span className="text-xs dashboard-muted dashboard-hover-ink transition-colors cursor-figma-pointer font-medium ml-2">
                      Browse all →
                    </span>
                  </Link>
                )}
              </div>
            </div>

            {/* Grid / Content Container */}
            <div className="overflow-y-auto flex-1 pr-1">
              {isWorkspacesError && (
                <div
                  role="alert"
                  className="mb-3 rounded-lg border dashboard-border p-3 text-xs dashboard-secondary"
                >
                  <p>
                    {formatUserErrorMessage(
                      workspacesError,
                      "Workspace listing is temporarily unavailable.",
                    )}
                  </p>
                  {workspaces && (
                    <p className="mt-1">
                      Previously loaded workspaces may be out of date.
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={isWorkspacesFetching}
                    onClick={() => {
                      void refetchWorkspaces();
                    }}
                    className="mt-2 rounded-lg dashboard-tint px-3 py-1 dashboard-ink dashboard-hover-tint disabled:opacity-50"
                  >
                    Retry
                  </button>
                </div>
              )}
              {isWorkspacesLoading ? (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="h-28 rounded-xl border dashboard-border dashboard-tint animate-pulse"
                    />
                  ))}
                </div>
              ) : isWorkspacesError &&
                !workspaces ? null : filteredWorkspaces.length === 0 &&
                !searchTerm ? (
                <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                  <Package className="h-6 w-6 dashboard-muted" />
                  <p className="text-xs font-medium dashboard-secondary">
                    No workspaces yet
                  </p>
                  <button
                    onClick={() => setIsCreateOpen(true)}
                    className="px-3 py-1 rounded-lg dashboard-tint text-xs dashboard-ink dashboard-hover-tint transition-all cursor-figma-pointer"
                  >
                    Create one
                  </button>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {viewMode === "grid" ? (
                    <motion.div
                      key="grid"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
                    >
                      {displayWorkspaces.map((workspace) => (
                        <WorkspaceCard
                          key={workspace.id}
                          workspace={workspace}
                          onDelete={handleDelete}
                          viewMode="grid"
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => setIsCreateOpen(true)}
                        className="dashboard-create-tile flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        <Plus className="h-7 w-7" /> New workspace
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="list"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col gap-2"
                    >
                      {displayWorkspaces.map((workspace) => (
                        <WorkspaceCard
                          key={workspace.id}
                          workspace={workspace}
                          onDelete={handleDelete}
                          viewMode="list"
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <CreateWorkspaceDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
    </>
  );
}
