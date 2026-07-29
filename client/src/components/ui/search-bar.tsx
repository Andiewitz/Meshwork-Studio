import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowUpAZ,
  ArrowDownAZ,
  Search,
  Package,
  ArrowRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

export interface WorkspaceSearchItem {
  id: number;
  title: string;
  description?: string | null;
  type: string;
  updatedAt?: string | Date | null;
  createdAt?: string | Date | null;
  isFavorite?: boolean | null;
}

interface SearchBarProps {
  data: WorkspaceSearchItem[];
  onCreateNew?: () => void;
  /** If true, shows the dropdown suggestions panel below (command-bar mode). */
  commandMode?: boolean;
  /** Optional extra className for the outer wrapper */
  className?: string;
}

const SearchBar = ({
  data,
  onCreateNew,
  commandMode = true,
  className,
}: SearchBarProps) => {
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | "">("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filteredData = (() => {
    const lowerQuery = query.toLowerCase().trim();
    let results = data.filter(
      (item) =>
        item.title.toLowerCase().includes(lowerQuery) ||
        item.type.toLowerCase().includes(lowerQuery),
    );
    if (sortOrder === "asc") {
      results = [...results].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortOrder === "desc") {
      results = [...results].sort((a, b) => b.title.localeCompare(a.title));
    }
    return results;
  })();

  const showDropdown =
    commandMode && isFocused && (query.length > 0 || filteredData.length > 0);

  return (
    <div
      className={cn(
        "w-full flex flex-col items-center justify-center gap-4",
        className,
      )}
    >
      {/* Input row */}
      <div className="w-full max-w-2xl flex flex-col sm:flex-row gap-3 relative z-30">
        {/* Search input */}
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 pointer-events-none transition-colors group-focus-within:text-white/50" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search blueprints, assets, or run a command..."
            className={cn(
              "w-full pl-12 pr-16 py-4 h-auto text-base bg-white/[0.03] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/10 focus-visible:border-white/20 transition-all duration-300 backdrop-blur-3xl",
              isFocused
                ? "rounded-t-2xl rounded-b-none border-white/20 bg-black/60 shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
                : "rounded-2xl hover:bg-white/[0.05]",
            )}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          />
          <kbd className="absolute right-4 top-1/2 -translate-y-1/2 px-2 py-1 bg-white/[0.06] text-[10px] text-white/30 border border-white/[0.08] rounded font-mono">
            ⌘ K
          </kbd>

          {/* Dropdown panel */}
          <AnimatePresence>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="absolute top-full left-0 right-0 bg-black/70 backdrop-blur-2xl border border-white/15 border-t-0 rounded-b-2xl overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.9)] text-left"
              >
                {filteredData.length > 0 ? (
                  <ScrollArea className="max-h-64 w-full">
                    <div className="p-2 border-b border-white/[0.06]">
                      <div className="px-3 py-2 text-[10px] font-bold text-white/30 tracking-widest uppercase">
                        Projects {query ? "Matching" : "Recent"}
                      </div>
                      {filteredData.slice(0, 6).map((item) => (
                        <Link key={item.id} href={`/workspace/${item.id}`}>
                          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.06] cursor-pointer transition-colors group/item">
                            <Package className="w-4 h-4 text-white/30 group-hover/item:text-white transition-colors flex-shrink-0" />
                            <div className="flex flex-col flex-1 min-w-0">
                              <span className="text-sm text-white/80 group-hover/item:text-white transition-colors leading-tight truncate">
                                {item.title}
                              </span>
                              <span className="text-[10px] text-white/35 tracking-wider uppercase mt-0.5">
                                {item.type} · #{item.id}
                              </span>
                            </div>
                            <ArrowRight className="w-4 h-4 text-white/20 opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0" />
                          </div>
                        </Link>
                      ))}
                    </div>
                    {onCreateNew && (
                      <div className="p-2">
                        <div className="px-3 py-2 text-[10px] font-bold text-white/30 tracking-widest uppercase">
                          Commands
                        </div>
                        <button
                          onClick={onCreateNew}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.06] cursor-pointer transition-colors group/item text-left"
                        >
                          <span className="text-sm text-white/70 group-hover/item:text-white transition-colors">
                            Create new workspace
                          </span>
                          <kbd className="ml-auto px-2 py-1 bg-white/[0.06] text-[10px] text-white/30 rounded font-mono opacity-0 group-hover/item:opacity-100 transition-opacity">
                            ↵
                          </kbd>
                        </button>
                      </div>
                    )}
                  </ScrollArea>
                ) : (
                  <p className="text-white/30 text-sm text-center py-6">
                    No results found.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sort Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-auto py-4 px-5 bg-white/[0.03] border-white/10 text-white/60 hover:text-white hover:bg-white/[0.07] rounded-2xl sm:w-auto w-full"
            >
              Sort by
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44 bg-black/80 backdrop-blur-xl border-white/10 text-white"
          >
            <DropdownMenuItem
              onClick={() => setSortOrder("asc")}
              className={cn(
                "flex justify-between items-center cursor-pointer focus:bg-white/[0.08] focus:text-white",
                sortOrder === "asc" && "text-white/90 font-semibold",
              )}
            >
              <span>Title Ascending</span>
              <ArrowUpAZ className="ml-2 h-4 w-4" />
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setSortOrder("desc")}
              className={cn(
                "flex justify-between items-center cursor-pointer focus:bg-white/[0.08] focus:text-white",
                sortOrder === "desc" && "text-white/90 font-semibold",
              )}
            >
              <span>Title Descending</span>
              <ArrowDownAZ className="ml-2 h-4 w-4" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export { SearchBar };
