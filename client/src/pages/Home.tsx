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
import { WorkspaceCard } from "@/features/workspace/components/WorkspaceCard";
import { CreateWorkspaceDialog } from "@/features/workspace/components/CreateWorkspaceDialog";
import {
  MagnifyingGlassIcon as Search,
  Squares2X2Icon as LayoutGrid,
  Bars3Icon as List,
  CubeIcon as Package,
  ChevronDownIcon as ChevronDown,
  PlusIcon as Plus,
} from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";

const TABS = ["Recently viewed", "Shared with me", "Favorites"] as const;
type Tab = (typeof TABS)[number];

const TYPE_FILTERS = [
  "All types",
  "Architecture",
  "Network",
  "Database",
] as const;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
  exit: {
    opacity: 0,
    transition: { staggerChildren: 0.03, staggerDirection: -1 },
  },
};

const fadeUpVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15, ease: "easeIn" } },
};

export default function Home() {
  const [location, setLocation] = useLocation();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { data: workspaces, isLoading: isWorkspacesLoading } = useWorkspaces();
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
  const [activeTab, setActiveTab] = useState<Tab>("Recently viewed");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [typeFilter, setTypeFilter] = useState<string>("All types");
  const [filterOpen, setFilterOpen] = useState(false);

  const isWorkspacesPage = location === "/workspaces";

  const handleDelete = (id: number) => {
    deleteWorkspace.mutate(id);
  };

  const filteredWorkspaces = useMemo(() => {
    if (!workspaces) return [];
    let result = workspaces.filter(
      (ws) =>
        ws.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ws.type.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    // Tab filtering
    if (activeTab === "Favorites") {
      result = result.filter((ws) => ws.isFavorite);
    }
    // "Shared with me" would filter for shared — keeping all for now since share data may vary

    // Type filtering
    if (typeFilter !== "All types") {
      result = result.filter((ws) =>
        ws.type.toLowerCase().includes(typeFilter.toLowerCase()),
      );
    }

    result = [...result].sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
    return result;
  }, [workspaces, searchTerm, activeTab, typeFilter]);

  const displayWorkspaces = isWorkspacesPage
    ? filteredWorkspaces
    : filteredWorkspaces.slice(0, 20);

  const isLoading = isAuthLoading || isWorkspacesLoading;

  return (
    <>
      <Helmet>
        <title>
          {isWorkspacesPage
            ? "Workspaces — Meshwork Studio"
            : "Home — Meshwork Studio"}
        </title>
      </Helmet>

      {/* Full-height flex column */}
      <div className="flex flex-col h-[calc(100vh-48px)]">
        {/* Blueprint Generation Banner */}
        {isGeneratingBlueprint && (
          <div className="bg-primary/10 border-b border-primary/20 px-6 py-2 flex items-center justify-between animate-pulse">
            <span className="text-xs text-primary font-medium">
              Generating Architecture Blueprint... Please wait.
            </span>
          </div>
        )}
        {/* ── Tab bar ── */}
        <div className="flex items-center justify-between border-b border-white/[0.05] px-6 py-0 shrink-0">
          {/* Left: tabs */}
          <div className="flex items-center gap-0">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-4 py-3 text-xs font-medium transition-colors cursor-figma-pointer ${
                  activeTab === tab
                    ? "text-white"
                    : "text-white/30 hover:text-white/60"
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-t-full"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Right: filter + search + view toggle */}
          <div className="flex items-center gap-2 py-1.5">
            {/* Search */}
            <div className="relative group">
              <Search className="absolute inset-y-0 left-2 my-auto w-3.5 h-3.5 text-white/20 group-focus-within:text-primary transition-colors" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                type="text"
                placeholder="Filter..."
                className="bg-white/[0.02] border border-white/[0.06] rounded-md pl-7 pr-3 py-1 text-xs outline-none focus:border-primary/50 text-white placeholder:text-white/20 transition-colors w-32 cursor-figma"
              />
            </div>

            {/* Type filter */}
            <div className="relative">
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className="flex items-center gap-1 rounded-md border border-white/[0.06] px-2.5 py-1 text-xs text-white/30 hover:text-white/60 hover:border-white/[0.1] transition-colors cursor-figma-pointer"
              >
                {typeFilter}
                <ChevronDown className="h-3 w-3" />
              </button>
              <AnimatePresence>
                {filterOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full mt-1 z-30 bg-surface-container-highest border border-white/[0.06] rounded-lg shadow-2xl overflow-hidden min-w-[120px]"
                  >
                    {TYPE_FILTERS.map((f) => (
                      <button
                        key={f}
                        onClick={() => {
                          setTypeFilter(f);
                          setFilterOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-figma-pointer ${
                          typeFilter === f
                            ? "bg-white/[0.06] text-white"
                            : "text-white/40 hover:bg-white/[0.04] hover:text-white/70"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* View mode toggle */}
            <div className="flex items-center rounded-md border border-white/[0.06] overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={`flex h-7 w-7 items-center justify-center transition-colors cursor-figma-pointer ${
                  viewMode === "grid"
                    ? "bg-white/[0.06] text-white"
                    : "text-white/20 hover:text-white/50"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`flex h-7 w-7 items-center justify-center transition-colors cursor-figma-pointer ${
                  viewMode === "list"
                    ? "bg-white/[0.06] text-white"
                    : "text-white/20 hover:text-white/50"
                }`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* New workspace button */}
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 transition-all active:scale-95 cursor-figma-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Loading Skeleton */}
            {isLoading ? (
              <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="h-44 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col justify-between animate-pulse"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-white/10" />
                      <div className="space-y-2 flex-1">
                        <div className="h-3 w-3/4 bg-white/10 rounded" />
                        <div className="h-2 w-1/2 bg-white/5 rounded" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-2 w-full bg-white/5 rounded" />
                      <div className="h-2 w-2/3 bg-white/5 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredWorkspaces.length === 0 && !searchTerm ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  <Package className="h-8 w-8 text-white/20" />
                </div>
                <p className="mb-1 text-sm font-medium text-white">
                  No workspaces yet
                </p>
                <p className="mb-4 text-xs text-white/30">
                  Create your first workspace to start designing architectures.
                </p>
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary/90 transition-all duration-150 active:scale-95 cursor-figma-pointer"
                >
                  New workspace
                </button>
              </motion.div>
            ) : filteredWorkspaces.length === 0 && searchTerm ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <Search className="h-10 w-10 text-white/15 mb-3" />
                <p className="text-sm font-medium text-white">
                  No results for "{searchTerm}"
                </p>
                <p className="text-xs text-white/30 mt-1">
                  Try a different search term.
                </p>
              </motion.div>
            ) : (
              <>
                {/* Section header */}
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-white/20">
                    {displayWorkspaces.length} workspace
                    {displayWorkspaces.length !== 1 ? "s" : ""}
                  </h3>
                  {!isWorkspacesPage && filteredWorkspaces.length > 20 && (
                    <Link href="/workspaces">
                      <span className="text-[10px] text-primary hover:underline underline-offset-4 uppercase tracking-widest cursor-figma-pointer">
                        View all
                      </span>
                    </Link>
                  )}
                </div>

                <AnimatePresence mode="popLayout">
                  {viewMode === "grid" ? (
                    <motion.div
                      key="grid"
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={containerVariants}
                      className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                    >
                      {displayWorkspaces.map((workspace) => (
                        <motion.div
                          key={workspace.id}
                          variants={fadeUpVariants}
                        >
                          <WorkspaceCard
                            workspace={workspace}
                            onDelete={handleDelete}
                            viewMode="grid"
                          />
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="list"
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={containerVariants}
                      className="flex flex-col gap-3"
                    >
                      {displayWorkspaces.map((workspace) => (
                        <motion.div
                          key={workspace.id}
                          variants={fadeUpVariants}
                        >
                          <WorkspaceCard
                            workspace={workspace}
                            onDelete={handleDelete}
                            viewMode="list"
                          />
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        </div>
      </div>

      <CreateWorkspaceDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
    </>
  );
}
