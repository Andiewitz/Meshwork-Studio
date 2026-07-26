import { Workspace } from "@shared/schema";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";
import { motion } from "framer-motion";
import {
  MoreVertical,
  Pencil,
  Trash,
  ExternalLink,
  Copy,
  Star,
  Box,
  LayoutGrid,
  Server,
  Globe,
  Database,
  Shield,
  GitBranch,
  Zap,
  Cpu,
  Network,
  Cloud,
  Lock,
  BarChart3,
  Code2,
  Wifi,
  Users,
  Plus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useLocation } from "wouter";
import { useState, useRef, useEffect } from "react";
import {
  useUpdateWorkspace,
  useDuplicateWorkspace,
} from "@/hooks/use-workspaces";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, LucideIcon> = {
  server: Server,
  globe: Globe,
  box: Box,
  database: Database,
  shield: Shield,
  git: GitBranch,
  zap: Zap,
  cpu: Cpu,
  network: Network,
  cloud: Cloud,
  lock: Lock,
  chart: BarChart3,
  code: Code2,
  wifi: Wifi,
  grid: LayoutGrid,
};

// Color palette for thumbnail tints — cycles by index
const THUMBNAIL_COLORS = [
  "#ff6600", // primary orange
  "#6c63ff", // purple
  "#f25c54", // coral
  "#4fc3f7", // sky
  "#ff9800", // amber
  "#66bb6a", // green
  "#e91e63", // pink
  "#b0bec5", // slate
];

function getWorkspaceIcon(iconId?: string): LucideIcon {
  return ICON_MAP[iconId || "box"] || Box;
}

interface WorkspaceCardProps {
  workspace: Workspace;
  onDelete?: (id: number) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
  isMultiSelectMode?: boolean;
  isDeleting?: boolean;
  viewMode?: "grid" | "list";
  colorIndex?: number;
}

export function WorkspaceCard({
  workspace,
  onDelete,
  isSelected,
  onToggleSelect,
  isMultiSelectMode,
  isDeleting,
  viewMode = "grid",
  colorIndex = 0,
}: WorkspaceCardProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const updateWorkspace = useUpdateWorkspace();
  const duplicateWorkspace = useDuplicateWorkspace();
  const isShared =
    workspace.userId !== null &&
    user?.id !== undefined &&
    workspace.userId !== user.id;

  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useState(workspace.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Stable color derived from workspace id
  const color = THUMBNAIL_COLORS[workspace.id % THUMBNAIL_COLORS.length];

  useEffect(() => {
    if (isRenaming) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isRenaming]);

  const handleRename = async () => {
    if (!title.trim() || title === workspace.title) {
      setIsRenaming(false);
      setTitle(workspace.title);
      return;
    }
    try {
      await updateWorkspace.mutateAsync({
        id: workspace.id,
        title: title.trim(),
      });
      setIsRenaming(false);
    } catch {
      toast({
        title: "Error",
        description: "Failed to rename workspace.",
        variant: "destructive",
      });
    }
  };

  const handleDuplicate = async () => {
    try {
      await duplicateWorkspace.mutateAsync({
        id: workspace.id,
        title: `${workspace.title} (Copy)`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to duplicate workspace.",
        variant: "destructive",
      });
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateWorkspace.mutateAsync({
        id: workspace.id,
        isFavorite: !workspace.isFavorite,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to update favorite.",
        variant: "destructive",
      });
    }
  };

  const Icon = getWorkspaceIcon(workspace.icon || undefined);
  const displayDate = workspace.updatedAt
    ? new Date(workspace.updatedAt)
    : workspace.createdAt
      ? new Date(workspace.createdAt)
      : new Date();
  const updatedText = formatDistanceToNow(displayDate, { addSuffix: true });

  const MenuItems = () => (
    <>
      <DropdownMenuItem
        onClick={() => setLocation(`/workspace/${workspace.id}`)}
        className="cursor-figma-pointer focus:bg-[#3a3a3a] focus:text-[#e0e0e0] text-[#888] text-xs"
      >
        <ExternalLink className="w-3.5 h-3.5 mr-2" /> Open
      </DropdownMenuItem>
      {!isShared && (
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            setIsRenaming(true);
          }}
          className="cursor-figma-pointer focus:bg-[#3a3a3a] focus:text-[#e0e0e0] text-[#888] text-xs"
        >
          <Pencil className="w-3.5 h-3.5 mr-2" /> Rename
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          handleDuplicate();
        }}
        className="cursor-figma-pointer focus:bg-[#3a3a3a] focus:text-[#e0e0e0] text-[#888] text-xs"
      >
        <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
      </DropdownMenuItem>
      {!isShared && (
        <>
          <DropdownMenuSeparator className="bg-[#3a3a3a]" />
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(workspace.id);
            }}
            className="text-red-400 focus:bg-red-500/10 focus:text-red-400 cursor-figma-pointer text-xs"
          >
            <Trash className="w-3.5 h-3.5 mr-2" /> Delete
          </DropdownMenuItem>
        </>
      )}
    </>
  );

  // ── Grid card ──
  if (viewMode === "grid") {
    return (
      <ContextMenu>
        <ContextMenuTrigger>
          <motion.div
            layout
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "group rounded-lg border border-[#3a3a3a] bg-[#2c2c2c] transition-all duration-200 hover:bg-[#333] hover:shadow-lg hover:shadow-black/30 cursor-figma-pointer",
              isSelected &&
                "border-primary/50 shadow-[0_0_12px_rgba(255,102,0,0.2)]",
              isDeleting && "opacity-50 pointer-events-none grayscale",
            )}
            onClick={() =>
              isMultiSelectMode
                ? onToggleSelect?.(workspace.id)
                : setLocation(`/workspace/${workspace.id}`)
            }
          >
            {isSelected && (
              <div className="absolute inset-0 bg-primary/5 rounded-lg pointer-events-none z-10 border border-primary/30" />
            )}

            {/* Thumbnail */}
            <div
              className="relative h-[120px] w-full rounded-t-lg overflow-hidden cursor-pointer"
              style={{ backgroundColor: color + "18" }}
            >
              {/* Subtle inner panel */}
              <div
                className="absolute inset-2 rounded-md"
                style={{ backgroundColor: color + "12" }}
              />

              {/* Grid dot pattern */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] [background-size:18px_18px]" />

              {/* Center icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <Icon
                  className="w-8 h-8 transition-colors duration-300"
                  style={{ color: color + "cc" }}
                />
              </div>

              {/* Shared badge */}
              {isShared && (
                <div className="absolute top-2 left-2 z-20 flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30">
                  <Users className="w-3 h-3 text-blue-400" />
                  <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">
                    Shared
                  </span>
                </div>
              )}

              {/* Favorite star */}
              {!isShared && (
                <button
                  onClick={handleToggleFavorite}
                  className={cn(
                    "absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full transition-all duration-200 z-20",
                    workspace.isFavorite
                      ? "text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.4)]"
                      : "text-white/20 opacity-0 group-hover:opacity-100 hover:text-white/60",
                  )}
                >
                  <Star
                    className={cn(
                      "w-3.5 h-3.5",
                      workspace.isFavorite && "fill-current",
                    )}
                  />
                </button>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[#3a3a3a] px-3 py-2">
              <div className="min-w-0 flex-1">
                {isRenaming ? (
                  <input
                    ref={inputRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename();
                      if (e.key === "Escape") {
                        setIsRenaming(false);
                        setTitle(workspace.title);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-transparent text-xs font-medium text-[#e0e0e0] border-b border-primary outline-none w-full"
                  />
                ) : (
                  <p className="truncate text-xs font-medium text-[#e0e0e0]">
                    {workspace.title || "Untitled"}
                  </p>
                )}
                <p className="truncate text-[10px] text-[#888]">
                  Edited {updatedText}
                </p>
              </div>

              {/* Action buttons — visible on hover */}
              <div
                className="flex items-center gap-0.5 ml-2 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded flex items-center justify-center text-[#888] hover:text-[#e0e0e0] hover:bg-[#3a3a3a] transition-all">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="bg-[#252525] border border-[#3a3a3a] rounded-xl shadow-2xl overflow-hidden p-1 min-w-[150px] z-50"
                  >
                    <MenuItems />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </motion.div>
        </ContextMenuTrigger>

        <ContextMenuContent className="bg-[#252525] border border-[#3a3a3a] rounded-xl shadow-2xl p-1 min-w-[150px]">
          <MenuItems />
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  // ── List row ──
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <motion.div
          layout
          whileHover={{ x: 2 }}
          transition={{ duration: 0.12 }}
          className={cn(
            "group flex items-center gap-4 rounded-lg border border-[#3a3a3a] bg-[#2c2c2c] px-4 py-3 cursor-figma-pointer transition-all duration-200 hover:bg-[#333] hover:shadow-md hover:shadow-black/20",
            isSelected && "border-primary/50",
            isDeleting && "opacity-50 pointer-events-none grayscale",
          )}
          onClick={() =>
            isMultiSelectMode
              ? onToggleSelect?.(workspace.id)
              : setLocation(`/workspace/${workspace.id}`)
          }
        >
          {/* Thumbnail mini */}
          <div
            className="h-10 w-16 rounded shrink-0 relative overflow-hidden"
            style={{ backgroundColor: color + "18" }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <Icon className="w-5 h-5" style={{ color: color + "cc" }} />
            </div>
          </div>

          {/* Title + date */}
          <div className="flex-1 min-w-0">
            {isRenaming ? (
              <input
                ref={inputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") {
                    setIsRenaming(false);
                    setTitle(workspace.title);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="bg-transparent text-sm font-medium text-[#e0e0e0] border-b border-primary outline-none w-full"
              />
            ) : (
              <p className="text-sm font-medium text-[#e0e0e0] truncate">
                {workspace.title || "Untitled"}
              </p>
            )}
            <p className="text-[10px] text-[#888] uppercase tracking-tight">
              Edited {updatedText}
            </p>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 shrink-0">
            {isShared && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30">
                <Users className="w-3 h-3 text-blue-400" />
                <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">
                  Shared
                </span>
              </div>
            )}
            {workspace.isFavorite && (
              <Star className="w-3.5 h-3.5 text-yellow-400 fill-current" />
            )}
          </div>

          {/* Actions */}
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {!isShared && (
              <button
                onClick={handleToggleFavorite}
                className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded text-[#888] hover:text-yellow-400 hover:bg-[#3a3a3a] transition-all"
                title="Toggle favorite"
              >
                <Star
                  className={cn(
                    "w-3.5 h-3.5",
                    workspace.isFavorite && "fill-current text-yellow-400",
                  )}
                />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded text-[#888] hover:text-[#e0e0e0] hover:bg-[#3a3a3a] transition-all">
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-[#252525] border border-[#3a3a3a] rounded-xl shadow-2xl overflow-hidden p-1 min-w-[150px] z-50"
              >
                <MenuItems />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </motion.div>
      </ContextMenuTrigger>

      <ContextMenuContent className="bg-[#252525] border border-[#3a3a3a] rounded-xl shadow-2xl p-1 min-w-[150px]">
        <MenuItems />
      </ContextMenuContent>
    </ContextMenu>
  );
}
