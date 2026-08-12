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
        <div className="fixed top-0 left-40 right-0 z-50 bg-primary/10 border-b border-primary/20 px-6 py-2 flex items-center justify-center animate-pulse">
          <span className="text-xs text-primary font-medium">
            Generating Architecture Blueprint... Please wait.
          </span>
        </div>
      )}

      {/* Full-screen layout */}
      <div className="relative min-h-screen flex flex-col overflow-hidden bg-[#0d0f1a]">
        {/* ── Animated gradient background ── */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Top-left navy blob */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 2.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute -top-[20%] -left-[10%] w-[70%] h-[75%] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(30,64,175,0.7) 0%, rgba(49,46,129,0.5) 45%, transparent 75%)",
              filter: "blur(70px)",
            }}
          />
          {/* Center purple haze */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 2.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="absolute top-[5%] left-[15%] w-[75%] h-[65%] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(109,40,217,0.45) 0%, rgba(139,92,246,0.25) 40%, transparent 70%)",
              filter: "blur(80px)",
            }}
          />
          {/* Bottom-right magenta bloom */}
          <motion.div
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 3.0, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="absolute top-[20%] right-[-10%] w-[65%] h-[70%] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(236,72,153,0.6) 0%, rgba(192,38,211,0.4) 35%, rgba(124,58,237,0.2) 65%, transparent 80%)",
              filter: "blur(65px)",
            }}
          />
          {/* Bottom blue accent */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 3.2, ease: "easeOut", delay: 0.4 }}
            className="absolute bottom-[20%] left-[5%] w-[40%] h-[35%] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(59,130,246,0.35) 0%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />
        </div>

        {/* ── Hero area ── */}
        <div className="flex-1 flex flex-col items-center justify-center pb-[310px] relative z-10 px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center text-center"
          >
            <h1 className="text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold text-white leading-tight tracking-tight mb-3">
              What should we build, {firstName}?
            </h1>
            <p className="text-[14px] text-white/40 mb-8 max-w-sm leading-relaxed">
              Design, visualize, and manage your cloud infrastructure from one
              canvas.
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 hover:border-white/25 text-white text-sm font-medium transition-all duration-200 backdrop-blur-sm cursor-figma-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              New workspace
            </button>
          </motion.div>
        </div>

        {/* ── Bottom floating project panel ── */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          className="fixed bottom-0 left-40 right-0 z-20 bg-[#0e0e0f]/85 backdrop-blur-2xl border-t border-white/[0.07]"
          style={{ height: "310px" }}
        >
          {/* Tab bar */}
          <div className="flex items-center justify-between px-6 py-2.5 border-b border-white/[0.05]">
            <div className="flex items-center gap-1">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-3 py-1.5 text-[12px] font-medium rounded-md transition-all duration-150 cursor-figma-pointer ${
                    activeTab === tab
                      ? "bg-white/[0.07] text-white"
                      : "text-white/35 hover:text-white/60 hover:bg-white/[0.04]"
                  }`}
                >
                  {tab}
                </button>
              ))}

              {/* View mode */}
              <div className="flex items-center ml-2 rounded-md border border-white/[0.07] overflow-hidden">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`flex h-6 w-6 items-center justify-center transition-colors cursor-figma-pointer ${
                    viewMode === "grid"
                      ? "bg-white/[0.08] text-white"
                      : "text-white/25 hover:text-white/50"
                  }`}
                >
                  <LayoutGrid className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`flex h-6 w-6 items-center justify-center transition-colors cursor-figma-pointer ${
                    viewMode === "list"
                      ? "bg-white/[0.08] text-white"
                      : "text-white/25 hover:text-white/50"
                  }`}
                >
                  <List className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute inset-y-0 left-2 my-auto w-3 h-3 text-white/25" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  type="text"
                  placeholder="Search..."
                  className="bg-white/[0.04] border border-white/[0.07] rounded-md pl-6 pr-3 py-1 text-[11px] outline-none focus:border-white/20 text-white placeholder:text-white/25 transition-colors w-28 cursor-figma"
                />
              </div>

              {!isWorkspacesPage && filteredWorkspaces.length > 20 && (
                <Link href="/workspaces">
                  <span className="text-[11px] text-white/35 hover:text-white/60 transition-colors cursor-figma-pointer">
                    Browse all →
                  </span>
                </Link>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto h-[calc(310px-48px)] px-6 py-4">
            {isWorkspacesLoading ? (
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-28 rounded-xl border border-white/[0.05] bg-white/[0.02] animate-pulse"
                  />
                ))}
              </div>
            ) : filteredWorkspaces.length === 0 && !searchTerm ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-full text-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                  <Package className="h-5 w-5 text-white/20" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white/70 mb-1">
                    No workspaces yet
                  </p>
                  <p className="text-xs text-white/30">
                    Create your first workspace to get started.
                  </p>
                </div>
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="px-4 py-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-white/70 hover:text-white transition-all cursor-figma-pointer"
                >
                  New workspace
                </button>
              </motion.div>
            ) : filteredWorkspaces.length === 0 && searchTerm ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Search className="h-7 w-7 text-white/15 mb-2" />
                <p className="text-sm text-white/40">
                  No results for "{searchTerm}"
                </p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {viewMode === "grid" ? (
                  <motion.div
                    key="grid"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
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
                    transition={{ duration: 0.2 }}
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

      <CreateWorkspaceDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
    </>
  );
}
