"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Sparkles,
  Server,
  Database,
  Zap,
  Globe,
  Cpu,
  Layers,
  Shield,
  FolderKanban,
  LayoutDashboard,
  Settings,
  Users,
  Plus,
  X,
} from "lucide-react";
import { useLocation } from "wouter";

// --- Hook Definition ---
export function useDebounce<T>(value: T, delay = 200): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

// --- Interfaces & Data ---
export interface Action {
  id: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
  short?: string;
  end?: string;
  category?: string;
  onSelect?: () => void;
}

export interface SearchResult {
  actions: Action[];
}

export function getDefaultMeshworkActions(
  navigate?: (path: string) => void,
): Action[] {
  return [
    {
      id: "1",
      label: "New Workspace",
      icon: <Plus className="h-4 w-4 text-emerald-400" />,
      description: "Create fresh architecture diagram",
      short: "⌘N",
      end: "Action",
      category: "Workspaces",
      onSelect: () => {
        window.dispatchEvent(new CustomEvent("meshwork:new-workspace"));
      },
    },
    {
      id: "2",
      label: "Dashboard",
      icon: <LayoutDashboard className="h-4 w-4 text-indigo-400" />,
      description: "Overview & recent projects",
      short: "⌘H",
      end: "Navigation",
      category: "Navigation",
      onSelect: () => {
        if (navigate) navigate("/home");
        else window.location.href = "/home";
      },
    },
    {
      id: "3",
      label: "All Workspaces",
      icon: <FolderKanban className="h-4 w-4 text-purple-400" />,
      description: "Browse all saved cloud diagrams",
      short: "⌘W",
      end: "Navigation",
      category: "Navigation",
      onSelect: () => {
        if (navigate) navigate("/workspaces");
        else window.location.href = "/workspaces";
      },
    },
    {
      id: "4",
      label: "Templates Library",
      icon: <Layers className="h-4 w-4 text-violet-400" />,
      description: "Pre-built production architectures",
      short: "⌘T",
      end: "Navigation",
      category: "Navigation",
      onSelect: () => {
        if (navigate) navigate("/dev");
        else window.location.href = "/dev";
      },
    },
    {
      id: "5",
      label: "Ask Jenkos AI Co-Pilot",
      icon: <Sparkles className="h-4 w-4 text-pink-400" />,
      description: "Generate topology with AI",
      short: "⌘J",
      end: "AI Agent",
      category: "AI",
      onSelect: () => {
        window.dispatchEvent(new CustomEvent("meshwork:open-jenkos"));
        window.dispatchEvent(new CustomEvent("meshwork:open-mosh"));
      },
    },
    {
      id: "6",
      label: "Add Server Node",
      icon: <Server className="h-4 w-4 text-blue-400" />,
      description: "EC2, Compute Engine, VM",
      short: "",
      end: "Node",
      category: "Nodes",
    },
    {
      id: "7",
      label: "Add Database Node",
      icon: <Database className="h-4 w-4 text-emerald-400" />,
      description: "Postgres, MySQL, DynamoDB",
      short: "",
      end: "Node",
      category: "Nodes",
    },
    {
      id: "8",
      label: "Add Redis Cache",
      icon: <Zap className="h-4 w-4 text-amber-400" />,
      description: "In-memory caching layer",
      short: "",
      end: "Node",
      category: "Nodes",
    },
    {
      id: "9",
      label: "Add API Gateway",
      icon: <Globe className="h-4 w-4 text-sky-400" />,
      description: "Route & reverse proxy traffic",
      short: "",
      end: "Node",
      category: "Nodes",
    },
    {
      id: "10",
      label: "Add Load Balancer",
      icon: <Cpu className="h-4 w-4 text-purple-400" />,
      description: "ALB / NLB traffic distributor",
      short: "",
      end: "Node",
      category: "Nodes",
    },
    {
      id: "11",
      label: "Add Security WAF",
      icon: <Shield className="h-4 w-4 text-cyan-400" />,
      description: "Firewall & DDoS protection",
      short: "",
      end: "Node",
      category: "Nodes",
    },
    {
      id: "12",
      label: "Connectors & Team",
      icon: <Users className="h-4 w-4 text-orange-400" />,
      description: "Collaborators & real-time presence",
      short: "",
      end: "Team",
      category: "Navigation",
      onSelect: () => {
        if (navigate) navigate("/team");
        else window.location.href = "/team";
      },
    },
    {
      id: "13",
      label: "Settings",
      icon: <Settings className="h-4 w-4 text-zinc-400" />,
      description: "Preferences & security",
      short: "⌘,",
      end: "Settings",
      category: "Navigation",
      onSelect: () => {
        if (navigate) navigate("/settings");
        else window.location.href = "/settings";
      },
    },
  ];
}

interface ActionSearchBarProps {
  actions?: Action[];
  isOpen?: boolean;
  onClose?: () => void;
  isModal?: boolean;
}

// --- Main Component ---
export function ActionSearchBar({
  actions,
  isOpen = true,
  onClose,
  isModal = false,
}: ActionSearchBarProps) {
  const [, setLocation] = useLocation();
  const allActions = actions || getDefaultMeshworkActions(setLocation);

  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debouncedQuery = useDebounce(query, 120);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Auto focus on modal open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setIsFocused(true);
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResult({ actions: allActions });
      return;
    }

    const normalizedQuery = debouncedQuery.toLowerCase().trim();
    const filteredActions = allActions.filter((action) => {
      const labelMatch = action.label.toLowerCase().includes(normalizedQuery);
      const descMatch = action.description
        ?.toLowerCase()
        .includes(normalizedQuery);
      const categoryMatch = action.category
        ?.toLowerCase()
        .includes(normalizedQuery);
      return labelMatch || descMatch || categoryMatch;
    });

    setResult({ actions: filteredActions });
    setSelectedIndex(0);
  }, [debouncedQuery, allActions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleSelectAction = (action: Action) => {
    if (action.onSelect) {
      action.onSelect();
    }
    if (onClose) {
      onClose();
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const list = result?.actions || [];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        list.length > 0 ? (prev + 1) % list.length : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        list.length > 0 ? (prev - 1 + list.length) % list.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (list[selectedIndex]) {
        handleSelectAction(list[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (onClose) onClose();
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      activeEl?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const containerVariants = {
    hidden: { opacity: 0, height: 0 },
    show: {
      opacity: 1,
      height: "auto",
      transition: {
        height: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
        staggerChildren: 0.03,
      },
    },
    exit: {
      opacity: 0,
      height: 0,
      transition: {
        height: { duration: 0.2 },
        opacity: { duration: 0.15 },
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 8 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.2, ease: "easeOut" },
    },
    exit: {
      opacity: 0,
      y: -6,
      transition: { duration: 0.15 },
    },
  };

  const content = (
    <div
      className="w-full max-w-[560px] mx-auto select-none"
      onKeyDown={handleKeyDown}
    >
      <div className="relative flex flex-col justify-start items-center">
        {/* Search Input Container */}
        <div className="w-full bg-[#111115]/95 backdrop-blur-2xl border border-white/[0.09] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.7)] overflow-hidden transition-all focus-within:border-white/20">
          <div className="relative flex items-center px-4 py-3.5 border-b border-white/[0.06]">
            <Search className="w-4 h-4 text-white/35 shrink-0 mr-3" />
            <input
              ref={inputRef}
              id="search"
              type="text"
              placeholder="Search workspaces, cloud nodes, commands..."
              value={query}
              onChange={handleInputChange}
              onFocus={() => setIsFocused(true)}
              className="w-full bg-transparent text-[13.5px] text-white placeholder:text-white/30 focus:outline-none font-body selection:bg-white/20"
            />

            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <AnimatePresence mode="popLayout">
                {query.length > 0 ? (
                  <motion.button
                    key="clear"
                    onClick={() => setQuery("")}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="p-1 text-white/30 hover:text-white/80 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </motion.button>
                ) : null}
              </AnimatePresence>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-white/30 border border-white/[0.08]">
                ESC
              </kbd>
            </div>
          </div>

          {/* Results List */}
          <AnimatePresence>
            {isFocused && result && result.actions.length > 0 && (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                exit="exit"
                className="w-full overflow-hidden"
              >
                <motion.ul
                  ref={listRef}
                  className="max-h-[340px] overflow-y-auto px-2 py-2 space-y-0.5 scrollbar-thin scrollbar-thumb-white/10"
                >
                  {result.actions.map((action, idx) => {
                    const isSelected = selectedIndex === idx;
                    return (
                      <motion.li
                        key={action.id}
                        variants={itemVariants}
                        layout
                        onClick={() => handleSelectAction(action)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`px-3 py-2.5 flex items-center justify-between rounded-xl cursor-pointer transition-all duration-100 ${
                          isSelected
                            ? "bg-white/[0.08] text-white"
                            : "text-white/60 hover:bg-white/[0.04] hover:text-white/90"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border border-white/[0.07] ${
                              isSelected ? "bg-white/[0.1]" : "bg-white/[0.03]"
                            }`}
                          >
                            {action.icon}
                          </div>
                          <div className="min-w-0 flex flex-col">
                            <span
                              className={`text-[13px] font-medium leading-snug truncate ${
                                isSelected ? "text-white" : "text-white/85"
                              }`}
                            >
                              {action.label}
                            </span>
                            {action.description && (
                              <span className="text-[11px] text-white/35 truncate">
                                {action.description}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          {action.short && (
                            <kbd className="text-[9.5px] font-mono text-white/30 px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.08]">
                              {action.short}
                            </kbd>
                          )}
                          {action.end && (
                            <span className="text-[10px] font-medium text-white/25 px-1.5 py-0.5 rounded bg-white/[0.03]">
                              {action.end}
                            </span>
                          )}
                        </div>
                      </motion.li>
                    );
                  })}
                </motion.ul>

                {/* Footer hints */}
                <div className="px-4 py-2.5 border-t border-white/[0.05] flex items-center justify-between text-[11px] text-white/30 bg-white/[0.01]">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <kbd className="font-mono bg-white/[0.06] px-1 py-0.5 rounded text-[9px]">
                        ↑
                      </kbd>
                      <kbd className="font-mono bg-white/[0.06] px-1 py-0.5 rounded text-[9px]">
                        ↓
                      </kbd>
                      Navigate
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="font-mono bg-white/[0.06] px-1 py-0.5 rounded text-[9px]">
                        ↵
                      </kbd>
                      Select
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-white/25">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-pulse" />
                    <span>Meshwork Studio</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty State */}
          {isFocused && result && result.actions.length === 0 && (
            <div className="py-8 text-center text-white/35 text-[12.5px]">
              No results found for{" "}
              <span className="text-white/60">"{query}"</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (!isModal) {
    return content;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[999] flex items-start justify-center pt-[15vh] px-4">
          {/* Subtle blur & darken backdrop — NOT too blurry or dark */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 bg-black/45 backdrop-blur-[3px]"
            onClick={onClose}
          />

          {/* Smooth animated popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-[560px]"
          >
            {content}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default ActionSearchBar;
