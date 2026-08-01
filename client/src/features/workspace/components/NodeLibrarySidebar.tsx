import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlassIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  nodeTypesList,
  getDynamicFavorites,
  DEFAULT_FAVORITES,
  NODE_DESCRIPTIONS,
} from "@/features/workspace/utils/nodeTypes";

interface NodeLibrarySidebarProps {
  onDragStart: (
    event: React.DragEvent,
    nodeType: string,
    label: string,
  ) => void;
  collapsed: boolean;
  setCollapsed: (c: boolean) => void;
}

const CATEGORY_ORDER = ["Core", "More", "Kubernetes", "Templates"];

const CATEGORY_DISPLAY: Record<string, string> = {
  Core: "COMPUTE",
  More: "VENDOR",
  Kubernetes: "KUBERNETES",
  Templates: "TEMPLATES",
};

const CATEGORY_COLORS: Record<string, string> = {
  Core: "#F97316",
  More: "#64748B",
  Kubernetes: "#326CE5",
  Templates: "#A855F7",
};

const FILTER_TABS = ["All", "Core", "More", "Kubernetes", "Templates"];
const FILTER_LABELS: Record<string, string> = {
  All: "All",
  Core: "Compute",
  More: "Vendor",
  Kubernetes: "K8s",
  Templates: "Templates",
};

export const NodeLibrarySidebar: React.FC<NodeLibrarySidebarProps> = ({
  onDragStart,
  collapsed,
  setCollapsed,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");

  const filteredByCategory = useMemo(() => {
    const result: Record<string, typeof nodeTypesList> = {};
    const categories = activeFilter === "All" ? CATEGORY_ORDER : [activeFilter];
    for (const cat of categories) {
      const items = nodeTypesList.filter(
        (n) =>
          n.category === cat &&
          (searchTerm === "" ||
            n.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            n.type.toLowerCase().includes(searchTerm.toLowerCase())),
      );
      if (items.length > 0) result[cat] = items;
    }
    return result;
  }, [searchTerm, activeFilter]);

  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  return (
    <AnimatePresence mode="wait">
      {collapsed ? null : (
        <motion.div
          key="expanded"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 260, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-0 left-0 bottom-0 z-40 flex flex-col bg-[#121214]/80 backdrop-blur-xl border-r border-white/[0.08] shadow-[inset_-1px_0_0_rgba(255,255,255,0.05),4px_0_24px_rgba(0,0,0,0.5)] overflow-visible"
          style={{ width: 260 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
            <span className="text-[13px] font-semibold text-white/80">
              Add Component
            </span>
            <button
              onClick={() => setCollapsed(true)}
              className="w-6 h-6 flex items-center justify-center rounded-md text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all"
              title="Close sidebar"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-3 pb-3 flex-shrink-0">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-10 py-1.5 text-[12px] bg-white/[0.04] border border-white/[0.07] rounded-lg text-white/80 placeholder:text-white/20 outline-none focus:border-white/20 focus:bg-white/[0.06] transition-all"
              />
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-mono text-white/20 bg-white/[0.06] px-1.5 py-0.5 rounded border border-white/[0.06]">
                ⌘K
              </kbd>
            </div>
          </div>

          {/* Filter tabs — only 4 short ones */}
          <div className="flex items-center gap-1 px-3 pb-3 flex-shrink-0">
            {(["All", "Core", "More", "Kubernetes"] as const).map((tab) => {
              const labels: Record<string, string> = {
                All: "All",
                Core: "Compute",
                More: "Vendor",
                Kubernetes: "K8s",
              };
              return (
                <button
                  key={tab}
                  onClick={() => setActiveFilter(tab)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all flex-1 text-center ${
                    activeFilter === tab
                      ? "bg-white/[0.12] text-white border border-white/[0.12]"
                      : "text-white/30 hover:text-white/60 hover:bg-white/[0.05] border border-transparent"
                  }`}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          {/* Node list */}
          <div
            className="flex-1 overflow-y-auto px-2 pb-2"
            style={{ scrollbarWidth: "none" }}
          >
            {Object.entries(filteredByCategory).map(([category, items]) => (
              <div key={category} className="mb-3">
                {/* Section header with color accent */}
                <div className="flex items-center gap-2 px-2 mb-1.5">
                  <div
                    className="w-0.5 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[category] }}
                  />
                  <span className="text-[9px] font-bold tracking-[0.14em] text-white/30">
                    {CATEGORY_DISPLAY[category] || category.toUpperCase()}
                  </span>
                  <span className="text-[9px] text-white/20 ml-auto">
                    {items.length}
                  </span>
                </div>

                {/* Items */}
                <div className="space-y-px relative">
                  {items.map((node) => (
                    <div
                      key={node.type}
                      draggable
                      onDragStart={(e) => {
                        setHoveredNode(null);
                        onDragStart(e, node.type, node.label);
                      }}
                      onMouseEnter={() => setHoveredNode(node.type)}
                      onMouseLeave={() => setHoveredNode(null)}
                      className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-[#1C1C1F]/90 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] transition-all cursor-grab active:cursor-grabbing group border border-transparent hover:border-white/[0.05] relative"
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                        style={{
                          background: `linear-gradient(135deg, ${CATEGORY_COLORS[category]}30, ${CATEGORY_COLORS[category]}10)`,
                          border: `1px solid ${CATEGORY_COLORS[category]}40`,
                        }}
                      >
                        <node.icon
                          className="w-3.5 h-3.5"
                          style={{ color: CATEGORY_COLORS[category] }}
                        />
                      </div>
                      <span className="text-[12px] text-white/60 group-hover:text-white/90 transition-colors flex-1 truncate">
                        {node.label}
                      </span>
                      <EllipsisVerticalIcon className="w-3.5 h-3.5 text-white/0 group-hover:text-white/25 transition-colors flex-shrink-0" />

                      <AnimatePresence>
                        {hoveredNode === node.type && (
                          <motion.div
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -5 }}
                            transition={{ duration: 0.15 }}
                            className="absolute left-full ml-4 top-1/2 -translate-y-1/2 w-48 bg-[#121214] border border-white/10 rounded-lg p-2.5 z-50 shadow-2xl backdrop-blur-xl"
                            style={{ pointerEvents: "none" }}
                          >
                            <div className="text-[11px] font-semibold text-white/90 mb-1">
                              {node.label}
                            </div>
                            <div className="text-[10px] text-white/50 leading-relaxed">
                              {NODE_DESCRIPTIONS[node.type] ||
                                "Architectural component for system design."}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {Object.keys(filteredByCategory).length === 0 && (
              <div className="px-2 py-8 text-center text-[12px] text-white/20">
                No components found
              </div>
            )}
          </div>

          {/* New Component button */}
          <div className="px-3 py-3 border-t border-white/[0.06] flex-shrink-0 bg-white/[0.01]">
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-all text-[12px] font-medium">
              <PlusIcon className="w-3.5 h-3.5" />
              New Component
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
