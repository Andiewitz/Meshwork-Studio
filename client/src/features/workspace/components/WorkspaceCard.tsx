import { Workspace } from "@shared/schema";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";
import { motion } from "framer-motion";
import {
  EllipsisVerticalIcon,
  PencilIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  DocumentDuplicateIcon,
  StarIcon,
  CubeIcon,
  Squares2X2Icon,
  ServerIcon,
  GlobeAltIcon,
  CircleStackIcon,
  ShieldCheckIcon,
  ShareIcon,
  BoltIcon,
  CpuChipIcon,
  CloudIcon,
  LockClosedIcon,
  ChartBarIcon,
  CodeBracketIcon,
  WifiIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";
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
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  server: ServerIcon,
  globe: GlobeAltIcon,
  box: CubeIcon,
  database: CircleStackIcon,
  shield: ShieldCheckIcon,
  git: ShareIcon,
  zap: BoltIcon,
  cpu: CpuChipIcon,
  network: ShareIcon,
  cloud: CloudIcon,
  lock: LockClosedIcon,
  chart: ChartBarIcon,
  code: CodeBracketIcon,
  wifi: WifiIcon,
  grid: Squares2X2Icon,
};

function getWorkspaceIcon(iconId?: string): React.ComponentType<any> {
  return ICON_MAP[iconId || "box"] || CubeIcon;
}

interface WorkspaceCardProps {
  workspace: Workspace;
  onDelete?: (id: number) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
  isMultiSelectMode?: boolean;
  isDeleting?: boolean;
  viewMode?: "grid" | "list";
}

export function WorkspaceCard({
  workspace,
  onDelete,
  isSelected,
  onToggleSelect,
  isMultiSelectMode,
  isDeleting,
  viewMode = "grid",
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
        className="cursor-figma-pointer focus:bg-surface-container-high focus:text-primary"
      >
        <ArrowTopRightOnSquareIcon className="w-4 h-4 mr-2" /> Open
      </DropdownMenuItem>
      {!isShared && (
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            setIsRenaming(true);
          }}
          className="cursor-figma-pointer focus:bg-surface-container-high focus:text-white"
        >
          <PencilIcon className="w-4 h-4 mr-2" /> Rename
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          handleDuplicate();
        }}
        className="cursor-figma-pointer focus:bg-surface-container-high focus:text-white"
      >
        <DocumentDuplicateIcon className="w-4 h-4 mr-2" /> Duplicate
      </DropdownMenuItem>
      {!isShared && (
        <>
          <DropdownMenuSeparator className="bg-outline-variant/20" />
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(workspace.id);
            }}
            className="text-error focus:bg-error/10 focus:text-error cursor-figma-pointer"
          >
            <TrashIcon className="w-4 h-4 mr-2" /> Delete
          </DropdownMenuItem>
        </>
      )}
    </>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <motion.div
          layout
          whileHover={viewMode === "grid" ? { y: -4 } : { x: 4 }}
          className={cn(
            "group transition-all duration-300 cursor-figma-pointer relative glass-card glass-card-hover",
            viewMode === "grid"
              ? "p-1 rounded-xl flex flex-col"
              : "p-3 rounded-xl flex flex-row items-center gap-6",
            isSelected && "border-primary/50 shadow-md",
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
            className={cn(
              "overflow-hidden rounded-sm relative shrink-0 technical-gradient",
              viewMode === "grid"
                ? "aspect-video mb-3 w-full"
                : "w-32 aspect-video",
            )}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,var(--color-outline-variant)_1px,transparent_0)] [background-size:20px_20px] opacity-20" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Icon className="w-10 h-10 text-outline group-hover:text-primary transition-colors duration-500 group-hover:scale-110" />
            </div>

            {/* Shared badge */}
            {isShared && (
              <div className="absolute top-3 left-3 z-20 flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30 backdrop-blur-sm">
                <UserGroupIcon className="w-3 h-3 text-blue-400" />
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
                  "absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full transition-all duration-200 z-20",
                  workspace.isFavorite
                    ? "text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]"
                    : "text-white/20 opacity-0 group-hover:opacity-100 hover:text-white/60",
                )}
              >
                {workspace.isFavorite ? (
                  <StarSolid className="w-4 h-4 fill-current" />
                ) : (
                  <StarIcon className="w-4 h-4" />
                )}
              </button>
            )}
          </div>

          <div
            className={cn(
              "flex-1 flex",
              viewMode === "grid"
                ? "px-3 pb-3 flex-col justify-between"
                : "items-center justify-between pr-4",
            )}
          >
            <div>
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
                  className="bg-transparent font-sans font-semibold text-white border-b border-primary outline-none py-0 w-full mb-2"
                />
              ) : (
                <h4
                  className={cn(
                    "font-sans font-semibold text-white group-hover:text-primary transition-colors",
                    viewMode === "grid" ? "text-sm mb-1.5" : "text-lg mb-1",
                  )}
                >
                  {workspace.title || "Untitled"}
                </h4>
              )}
              {viewMode === "list" && (
                <span className="text-[10px] text-outline font-label tracking-tight uppercase">
                  Last edited {updatedText}
                </span>
              )}
            </div>

            <div
              className={cn(
                "flex items-center",
                viewMode === "grid" ? "justify-between mt-auto" : "gap-8",
              )}
            >
              {viewMode === "grid" && (
                <span className="text-[10px] text-outline font-label tracking-tight uppercase truncate mr-4">
                  Last edited {updatedText}
                </span>
              )}

              {/* 3-dot vertical menu */}
              <div onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="w-7 h-7 rounded-md flex items-center justify-center text-[#555] hover:text-white hover:bg-white/5 transition-all opacity-0 group-hover:opacity-100 cursor-figma-pointer">
                      <EllipsisVerticalIcon className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="bg-surface-container-highest border border-outline-variant/20 rounded-xl shadow-2xl overflow-hidden p-1 min-w-[160px] z-50"
                  >
                    <MenuItems />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </motion.div>
      </ContextMenuTrigger>

      <ContextMenuContent className="bg-surface-container-highest border border-outline-variant/20 rounded-xl shadow-2xl p-1 min-w-[160px]">
        <MenuItems />
      </ContextMenuContent>
    </ContextMenu>
  );
}
