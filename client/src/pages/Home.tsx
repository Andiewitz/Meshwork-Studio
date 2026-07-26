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
  Search,
  LayoutGrid,
  List,
  Package,
  ChevronDown,
  Plus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LineSyncLoader } from "@/components/ui/loading-screen";

const TABS = ["Recently viewed", "Shared files", "Shared projects"] as const;
type Tab = (typeof TABS)[number];

const FILE_TYPE_FILTERS = ["Design", "Canvas", "Template", "All"] as const;

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
  const [fileTypeFilter, setFileTypeFilter] = useState<string>("All");
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

    result = [...result].sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
    return result;
  }, [workspaces, searchTerm]);

  const displayWorkspaces = isWorkspacesPage
    ? filteredWorkspaces
    : filteredWorkspaces.slice(0, 20);

  if (isAuthLoading || isWorkspacesLoading || isGeneratingBlueprint) {
    return (
      <LineSyncLoader
        message={
          isGeneratingBlueprint
            ? "Generating Blueprint..."
            : "Loading blueprints"
        }
      />
    );
  }

  return (
    <>
      <Helmet>
        <title>
          {isWorkspacesPage
            ? "Workspaces — Meshwork Studio"
            : "Home — Meshwork Studio"}
        </title>
      </Helmet>

      {/* Full-height flex column to fill the space under the top bar */}
      <div className="flex flex-col h-[calc(100vh-48px)]">
        {/* ── Tab bar ── */}
        <div className="flex items-center justify-between border-b border-[#3a3a3a] bg-[#1e1e1e] px-6 py-0 shrink-0">
          {/* Left: tabs */}
          <div className="flex items-center gap-0">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-4 py-3 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? "text-[#e0e0e0]"
                    : "text-[#888] hover:text-[#e0e0e0]"
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
            <div className="relative">
              <Search className="absolute inset-y-0 left-2 my-auto w-3.5 h-3.5 text-[#888]" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                type="text"
                placeholder="Search..."
                className="bg-[#2c2c2c] border border-[#3a3a3a] rounded-md pl-7 pr-3 py-1 text-xs outline-none focus:border-primary/50 text-[#e0e0e0] placeholder:text-[#888] transition-colors w-36"
              />
            </div>

            {/* File type filter */}
            <div className="relative">
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className="flex items-center gap-1 rounded-md border border-[#3a3a3a] px-2.5 py-1 text-xs text-[#888] hover:text-[#e0e0e0] hover:border-[#555] transition-colors"
              >
                {fileTypeFilter === "All" ? "All files" : fileTypeFilter}
                <ChevronDown className="h-3 w-3" />
              </button>
              <AnimatePresence>
                {filterOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full mt-1 z-30 bg-[#252525] border border-[#3a3a3a] rounded-lg shadow-2xl overflow-hidden min-w-[120px]"
                  >
                    {FILE_TYPE_FILTERS.map((f) => (
                      <button
                        key={f}
                        onClick={() => {
                          setFileTypeFilter(f);
                          setFilterOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                          fileTypeFilter === f
                            ? "bg-[#3a3a3a] text-[#e0e0e0]"
                            : "text-[#888] hover:bg-[#2c2c2c] hover:text-[#e0e0e0]"
                        }`}
                      >
                        {f === "All" ? "All files" : f}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* View mode toggle */}
            <div className="flex items-center rounded-md border border-[#3a3a3a] overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={`flex h-7 w-7 items-center justify-center transition-colors ${
                  viewMode === "grid"
                    ? "bg-[#3a3a3a] text-[#e0e0e0]"
                    : "text-[#888] hover:text-[#e0e0e0]"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`flex h-7 w-7 items-center justify-center transition-colors ${
                  viewMode === "list"
                    ? "bg-[#3a3a3a] text-[#e0e0e0]"
                    : "text-[#888] hover:text-[#e0e0e0]"
                }`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* New workspace button */}
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 transition-all active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Empty state — no workspaces */}
            {filteredWorkspaces.length === 0 && !searchTerm ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2c2c2c]">
                  <Package className="h-8 w-8 text-[#888]" />
                </div>
                <p className="mb-1 text-sm font-medium text-[#e0e0e0]">
                  No workspaces yet
                </p>
                <p className="mb-4 text-xs text-[#888]">
                  Create your first workspace to start designing.
                </p>
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary/90 transition-all duration-150 active:scale-95"
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
                <Search className="h-10 w-10 text-[#888] mb-3" />
                <p className="text-sm font-medium text-[#e0e0e0]">
                  No results for "{searchTerm}"
                </p>
                <p className="text-xs text-[#888] mt-1">
                  Try a different search term.
                </p>
              </motion.div>
            ) : (
              <>
                {/* Section header */}
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xs font-medium text-[#888]">
                    {displayWorkspaces.length} workspace
                    {displayWorkspaces.length !== 1 ? "s" : ""}
                  </h3>
                  {!isWorkspacesPage && filteredWorkspaces.length > 20 && (
                    <Link href="/workspaces">
                      <span className="text-[10px] text-primary hover:underline underline-offset-4 uppercase tracking-wider cursor-pointer">
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
                      className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
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
                      className="flex flex-col gap-2"
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
