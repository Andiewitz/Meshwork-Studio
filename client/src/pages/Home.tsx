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
  PlusIcon as Plus,
  SparklesIcon as Sparkles,
} from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";

const TABS = ["My projects", "Recently viewed"] as const;
type Tab = (typeof TABS)[number];

export default function Home() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
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
  const [activeTab, setActiveTab] = useState<Tab>("My projects");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const isWorkspacesPage = location === "/workspaces";

  const handleDelete = (id: number) => {
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
        <title>
          {isWorkspacesPage
            ? "Workspaces — Meshwork Studio"
            : "Home — Meshwork Studio"}
        </title>
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
      <div className="relative flex-1 flex flex-col justify-between overflow-hidden bg-[#0a0c16] min-h-full">
        {/* ── Rich Gradient Blobs Background ── */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden -z-0">
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
        <div className="shrink-0 flex flex-col items-center justify-center pt-6 pb-5 relative z-10 px-6">
          {/* Heading */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="flex flex-col items-center text-center"
          >
            <h1 className="text-[clamp(2.2rem,4vw,3.2rem)] font-bold text-white leading-tight tracking-tight mb-3 font-headline">
              What should we build, {firstName}?
            </h1>
            <p className="text-[14.5px] text-white/45 mb-8 max-w-md leading-relaxed">
              Design, auto-sync, and manage cloud infrastructure diagrams.
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-white/90 active:scale-95 transition-all shadow-[0_0_25px_rgba(255,255,255,0.15)] cursor-figma-pointer"
            >
              <Plus className="w-4 h-4" />
              New workspace
            </button>
          </motion.div>
        </div>

        {/* ── Bottom Floating Card Container (Nested inside the curved canvas) ── */}
        <div className="flex-1 p-4 sm:p-5 relative z-20 flex flex-col min-h-0">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="w-full bg-[#111218]/90 backdrop-blur-2xl border border-white/[0.09] rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col flex-1 min-h-0 overflow-hidden"
          >
            {/* Header / Tabs */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-3">
              <div className="flex items-center gap-2">
                {/* Search icon button */}
                <div className="relative flex items-center">
                  <Search className="absolute left-2.5 w-3.5 h-3.5 text-white/30" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    type="text"
                    placeholder="Search..."
                    className="bg-white/[0.04] border border-white/[0.08] rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 outline-none focus:border-white/20 transition-colors w-36 sm:w-44"
                  />
                </div>

                {/* Tabs */}
                {TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-all cursor-figma-pointer ${
                      activeTab === tab
                        ? "bg-white/[0.08] text-white"
                        : "text-white/40 hover:text-white/70 hover:bg-white/[0.03]"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {/* View toggle */}
                <div className="flex items-center rounded-xl border border-white/[0.08] overflow-hidden p-0.5 bg-white/[0.02]">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors cursor-figma-pointer ${
                      viewMode === "grid"
                        ? "bg-white/[0.1] text-white"
                        : "text-white/30 hover:text-white/60"
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors cursor-figma-pointer ${
                      viewMode === "list"
                        ? "bg-white/[0.1] text-white"
                        : "text-white/30 hover:text-white/60"
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                </div>

                {!isWorkspacesPage && filteredWorkspaces.length > 20 && (
                  <Link href="/workspaces">
                    <span className="text-xs text-white/40 hover:text-white/70 transition-colors cursor-figma-pointer font-medium ml-2">
                      Browse all →
                    </span>
                  </Link>
                )}
              </div>
            </div>

            {/* Grid / Content Container */}
            <div className="overflow-y-auto flex-1 pr-1">
              {isWorkspacesLoading ? (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="h-28 rounded-xl border border-white/[0.06] bg-white/[0.02] animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredWorkspaces.length === 0 && !searchTerm ? (
                <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                  <Package className="h-6 w-6 text-white/20" />
                  <p className="text-xs font-medium text-white/60">
                    No workspaces yet
                  </p>
                  <button
                    onClick={() => setIsCreateOpen(true)}
                    className="px-3 py-1 rounded-lg bg-white/10 text-xs text-white hover:bg-white/15 transition-all cursor-figma-pointer"
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
                      className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
                    >
                      {displayWorkspaces.map((workspace) => (
                        <WorkspaceCard
                          key={workspace.id}
                          workspace={workspace}
                          onDelete={handleDelete}
                          viewMode="grid"
                        />
                      ))}
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
