import React, { useCallback, useEffect, useState, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  Panel,
  useReactFlow,
  ConnectionMode,
  SelectionMode,
  ReactFlowProvider,
  useViewport,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import {
  useCanvas,
  saveCanvasToLocalCache,
  getCanvasFromLocalCache,
} from "@/hooks/use-canvas";
import {
  useWorkspace,
  useDeleteWorkspace,
  useWorkspaceRole,
  useWorkspaceMembers,
  useUpdateMemberRole,
  useUpdateWorkspace,
  useDuplicateWorkspace,
} from "@/hooks/use-workspaces";
import {
  canDelete as canDeleteWorkspace,
  canEdit as canEditWorkspace,
  canManage as canManageWorkspace,
  isOwner,
} from "@shared/permissions";
import { useParams, Link, useLocation } from "wouter";
import {
  ArrowDownTrayIcon as Download,
  DocumentCheckIcon as Save,
  ArrowPathIcon as Loader2,
  PlayIcon as Play,
  ChevronLeftIcon as ChevronLeft,
  Squares2X2Icon as LayersIcon,
  CursorArrowRaysIcon as MousePointer2,
  StopIcon as Square,
  HashtagIcon as Type,
  PencilIcon as Pencil,
  ShareIcon as Share2,
  Cog6ToothIcon as Settings,
  QuestionMarkCircleIcon as HelpCircle,
  ServerIcon as Server,
  CircleStackIcon as Database,
  CpuChipIcon as Cpu,
  GlobeAltIcon as Globe,
  ChatBubbleLeftRightIcon as MessageSquare,
  CircleStackIcon as HardDrive,
  BoltIcon as Zap,
  PlusIcon as Plus,
  CubeIcon as Box,
  TrashIcon as Trash2,
  DocumentDuplicateIcon as Copy,
  PencilSquareIcon as Edit2,
  Squares2X2Icon as Grid,
  ComputerDesktopIcon as Monitor,
  CloudIcon as Cloud,
  CodeBracketIcon as GitBranch,
  ShieldCheckIcon as Shield,
  LockClosedIcon as Lock,
  KeyIcon as Key,
  ChartBarIcon as Activity,
  ChartBarIcon as BarChart3,
  ChartPieIcon as PieChart,
  CreditCardIcon as CreditCard,
  ChatBubbleLeftIcon as MessageCircle,
  ShoppingCartIcon as ShoppingCart,
  PlayCircleIcon as PlayCircle,
  CommandLineIcon as Terminal,
  Squares2X2Icon as Layers,
  Squares2X2Icon as Layout,
  BriefcaseIcon as Briefcase,
  MagnifyingGlassIcon as Search,
  UserIcon,
  ArrowsPointingOutIcon as Maximize,
  ChevronDownIcon as ChevronDown,
  ChevronRightIcon as ChevronRight,
  MinusIcon as Minus,
  MinusIcon as Circle,
  ArrowsUpDownIcon as AlignVerticalJustifyCenter,
  ArrowsRightLeftIcon as AlignHorizontalJustifyCenter,
  ArrowPathIcon as RotateCw,
  SparklesIcon as Spline,
  ArrowUpRightIcon as ArrowUpRight,
  MapPinIcon as Milestone,
  ArrowRightIcon as ArrowRight,
  CheckCircleIcon as CheckCircle2,
  CloudArrowUpIcon as CloudUpload,
  ExclamationTriangleIcon as AlertCircle,
  CubeIcon as Package,
  Bars3Icon as GripVertical,
  HandRaisedIcon as Hand,
  ArrowUturnLeftIcon as Undo2,
  ArrowUturnRightIcon as Redo2,
  Bars3Icon as Menu,
  ArrowRightStartOnRectangleIcon as LogOut,
  ShieldCheckIcon,
  EyeIcon as Eye,
  PencilIcon as Pen,
  SparklesIcon as Crown,
  UserGroupIcon as Users,
  ChevronUpIcon as ChevronUp,
  PhotoIcon as Image,
  ArrowDownTrayIcon as FileDown,
  ArrowUpTrayIcon as FileUp,
  DocumentTextIcon as FileJson,
  LinkIcon as Link2,
  ArrowsPointingOutIcon as Maximize2,
  ArrowsPointingInIcon as Minimize2,
  CommandLineIcon as Keyboard,
  ViewColumnsIcon as PanelLeftOpen,
  ShieldCheckIcon as ShieldCheck,
} from "@heroicons/react/24/outline";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  SparklesIcon as Sparkles,
  TagIcon as LucideTag,
  XMarkIcon as X,
} from "@heroicons/react/24/outline";
import { SystemNode, nodeBrands } from "@/components/canvas/nodes/SystemNode";

import {
  nodeTypes,
  nodeTypesList,
  DEFAULT_FAVORITES as favoriteNodes,
  trackNodeUsage,
  EXPANDABLE_TYPES,
  NODE_DESCRIPTIONS,
} from "@/features/workspace/utils/nodeTypes";
import {
  registerEnterNodeHandler,
  unregisterEnterNodeHandler,
} from "@/features/workspace/utils/canvasEvents";
import { nodeDimensions } from "@/features/workspace/utils/dimensions";
import { generateTemplate } from "@/features/workspace/utils/templates";
import { PropertiesSidebar } from "@/features/workspace/components/PropertiesSidebar";
import { WorkspaceHeader } from "@/features/workspace/components/WorkspaceHeader";
import { WorkspaceLeftSidebar } from "@/features/workspace/components/WorkspaceLeftSidebar";
import { WorkspaceToolbar } from "@/features/workspace/components/WorkspaceToolbar";
import {
  calculateContainment,
  calculateGlobalPosition,
} from "@/features/workspace/utils/containment";
import { usePresence } from "@/hooks/use-presence";
import {
  CollaboratorCursors,
  PresenceIndicator,
} from "@/components/canvas/CollaboratorCursors";
import {
  exportAsPng,
  exportAsSvg,
  exportAsJson,
  importFromJson,
} from "@/features/workspace/utils/exportCanvas";

import {
  EDGE_TYPES,
  EDGE_TYPE_LABELS,
  EDGE_STYLES,
  BG_VARIANTS,
  BG_VARIANT_LABELS,
  GRID_SIZE_MIN,
  GRID_SIZE_MAX,
  type EdgeType,
  type EdgeStyle,
  type BgVariant,
} from "@/features/workspace/utils/canvasSettings";

function WorkspaceView() {
  const { id } = useParams();
  const workspaceId = Number(id);
  const {
    data: canvasData,
    isLoading: isCanvasLoading,
    sync,
    isSyncing,
    isError: isCanvasError,
  } = useCanvas(workspaceId);
  const {
    data: workspace,
    isLoading: isWorkspaceLoading,
    isError: isWorkspaceError,
  } = useWorkspace(workspaceId);

  const isLoading = isCanvasLoading || isWorkspaceLoading;
  const isError = isCanvasError || isWorkspaceError;
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    screenToFlowPosition,
    fitView,
    zoomIn,
    zoomOut,
    getViewport,
    setViewport,
  } = useReactFlow();
  const [, setLocation] = useLocation();
  const deleteWorkspace = useDeleteWorkspace();
  const updateWorkspace = useUpdateWorkspace();
  const duplicateWorkspace = useDuplicateWorkspace();

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"layers" | "properties">("layers");
  const [isSimulating, setIsSimulating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [snapToGrid, setSnapToGrid] = useState(true);

  // Workspace Settings States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [wsDescription, setWsDescription] = useState("");
  const [wsAuthor, setWsAuthor] = useState("");
  const [wsAiContext, setWsAiContext] = useState("");
  const [wsTags, setWsTags] = useState<string[]>([]);
  const [newWsTag, setNewWsTag] = useState("");
  const [wsGroups, setWsGroups] = useState<string[]>([]);
  const [newWsGroup, setNewWsGroup] = useState("");
  const [edgeType, setEdgeType] = useState<EdgeType>("step");
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>("solid");
  const [hasArrow, setHasArrow] = useState(false);
  const [drawingMode, setDrawingMode] = useState<
    "select" | "pan" | "annotation" | "infrastructure"
  >("select");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"ai" | "nodes">("ai");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [gridSize, setGridSize] = useState(20);
  const [bgVariant, setBgVariant] = useState<BgVariant>("dots");
  const [activeView, setActiveView] = useState<"ai" | "canvas" | "properties">(
    "canvas",
  );

  // ── Role-based access control ──
  const { data: roleData } = useWorkspaceRole(workspaceId);
  const userRole = roleData?.role || "none";
  const canEdit = canEditWorkspace(userRole);
  const canManage = canManageWorkspace(userRole);
  const canDelete = canDeleteWorkspace(userRole);

  // ── Members list for role management ──
  const { data: membersData } = useWorkspaceMembers(workspaceId);
  const updateRole = useUpdateMemberRole();
  const teamMembers = membersData?.members || [];
  const teamId = membersData?.teamId;

  // ── Export / Import handlers ──
  const importFileRef = useRef<HTMLInputElement>(null);
  const rfInstance = useReactFlow();

  const handleExportPng = useCallback(async () => {
    try {
      await exportAsPng(rfInstance, workspace?.title);
      toast({ title: "Exported as PNG" });
    } catch (e: unknown) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  }, [rfInstance, workspace?.title, toast]);

  const handleExportSvg = useCallback(async () => {
    try {
      await exportAsSvg(rfInstance, workspace?.title);
      toast({ title: "Exported as SVG" });
    } catch (e: unknown) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  }, [rfInstance, workspace?.title, toast]);

  const handleExportJson = useCallback(() => {
    exportAsJson(nodes, edges, workspace?.title || "canvas");
    toast({ title: "Exported as JSON" });
  }, [nodes, edges, workspace?.title, toast]);

  const handleImportJson = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const { nodes: importedNodes, edges: importedEdges } =
          await importFromJson(file);
        setNodes(importedNodes as Node[]);
        setEdges(importedEdges as Edge[]);
        toast({ title: `Imported ${importedNodes.length} nodes` });
      } catch (err: unknown) {
        toast({
          title: "Import failed",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      }
      e.target.value = ""; // Reset file input
    },
    [setNodes, setEdges, toast],
  );

  // ── Rename state ──
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const handleStartRename = useCallback(() => {
    setRenameValue(workspace?.title || "");
    setIsRenaming(true);
  }, [workspace?.title]);

  const handleRename = useCallback(() => {
    const trimmed = renameValue.trim();
    const finalTitle = trimmed === "" ? "Untitled" : trimmed;
    if (finalTitle === workspace?.title) {
      setIsRenaming(false);
      return;
    }
    updateWorkspace.mutate(
      { id: workspaceId, title: finalTitle },
      {
        onSuccess: () => {
          toast({ title: "Renamed" });
          setIsRenaming(false);
        },
        onError: (e: Error) => {
          toast({
            title: "Rename failed",
            description: e.message,
            variant: "destructive",
          });
        },
      },
    );
  }, [renameValue, workspace?.title, workspaceId, updateWorkspace, toast]);

  const handleDuplicate = useCallback(() => {
    duplicateWorkspace.mutate(
      { id: workspaceId, title: `Copy of ${workspace?.title || "Untitled"}` },
      {
        onSuccess: (ws: { title?: string }) => {
          toast({ title: `Duplicated as "${ws.title}"` });
        },
        onError: () => {
          toast({ title: "Duplicate failed", variant: "destructive" });
        },
      },
    );
  }, [workspaceId, workspace?.title, duplicateWorkspace, toast]);

  const handleCopyInvite = useCallback(async () => {
    if (!teamId) {
      toast({ title: "Not shared with a team" });
      return;
    }
    // Fetch team details to get invite code
    try {
      const res = await fetch(`/api/v1/teams/${teamId}`, {
        credentials: "include",
      });
      const team = await res.json();
      if (team.inviteCode) {
        await navigator.clipboard.writeText(team.inviteCode);
        toast({ title: "Invite code copied!", description: team.inviteCode });
      }
    } catch {
      toast({ title: "Failed to get invite code", variant: "destructive" });
    }
  }, [teamId, toast]);

  // ── Keyboard shortcuts modal + fullscreen ──
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  // Listen for ? and F11 keys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "?") {
        e.preventDefault();
        setMenuOpen((prev) => !prev);
      }
      if (e.key === "F11") {
        e.preventDefault();
        handleToggleFullscreen();
      }
    };
    window.addEventListener("keydown", handler);

    // Sync fullscreen state on external changes (e.g. Esc)
    const fsHandler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fsHandler);

    return () => {
      window.removeEventListener("keydown", handler);
      document.removeEventListener("fullscreenchange", fsHandler);
    };
  }, [handleToggleFullscreen]);

  // ── Real-time collaboration (cursors & presence) ──
  const isRemoteUpdate = useRef(false);

  const handleRemoteNodeMove = useCallback(
    (nodeId: string, x: number, y: number, parentId?: string | null) => {
      isRemoteUpdate.current = true;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId) {
            return {
              ...n,
              position: { x, y },
              ...(parentId !== undefined
                ? { parentId: parentId || undefined }
                : {}),
            };
          }
          return n;
        }),
      );
      // Reset after React processes the batch
      requestAnimationFrame(() => {
        isRemoteUpdate.current = false;
      });
    },
    [setNodes],
  );

  const handleRemoteNodesChange = useCallback(
    (changes: NodeChange[]) => {
      isRemoteUpdate.current = true;
      setNodes((nds) => applyNodeChanges(changes, nds));
      requestAnimationFrame(() => {
        isRemoteUpdate.current = false;
      });
    },
    [setNodes],
  );

  const handleRemoteEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      isRemoteUpdate.current = true;
      setEdges((eds) => applyEdgeChanges(changes, eds));
      requestAnimationFrame(() => {
        isRemoteUpdate.current = false;
      });
    },
    [setEdges],
  );

  const {
    collaborators,
    isConnected: isPresenceConnected,
    sendCursor,
    sendNodeMove,
    sendNodesChange,
    sendEdgesChange,
  } = usePresence(
    workspaceId,
    handleRemoteNodeMove,
    undefined, // onCanvasSync unused
    handleRemoteNodesChange,
    handleRemoteEdgesChange,
  );
  const lastCursorSent = useRef(0);
  const lastNodeMoveSent = useRef(0);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      // Prevent broadcasting updates caused by remote changes
      if (!isRemoteUpdate.current) {
        sendNodesChange(changes);
      }
    },
    [setNodes, sendNodesChange],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
      if (!isRemoteUpdate.current) {
        sendEdgesChange(changes);
      }
    },
    [setEdges, sendEdgesChange],
  );

  // Throttled cursor broadcast on mouse move (uses React Flow's native event)
  const handlePaneMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const now = Date.now();
      if (now - lastCursorSent.current < 50) return; // Throttle to ~20fps
      lastCursorSent.current = now;
      try {
        const pos = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        sendCursor(pos.x, pos.y);
      } catch {
        // screenToFlowPosition may throw if ReactFlow isn't ready
      }
    },
    [screenToFlowPosition, sendCursor],
  );

  // ── Nested canvas navigation stack ──
  interface CanvasLevel {
    nodeId: string;
    label: string;
    nodes: Node[];
    edges: Edge[];
    viewport: { x: number; y: number; zoom: number };
  }
  const [canvasStack, setCanvasStack] = useState<CanvasLevel[]>([]);
  const isNested = canvasStack.length > 0;
  const [canvasTransition, setCanvasTransition] = useState<
    "idle" | "entering" | "exiting"
  >("idle");

  // Smooth enter: zoom into node → fade → swap → fade back
  const enterNode = useCallback(
    (node: Node) => {
      if (canvasTransition !== "idle") return;
      setCanvasTransition("entering");

      const viewport = getViewport();
      // Save current state
      setCanvasStack((prev) => [
        ...prev,
        {
          nodeId: node.id,
          label: (node.data?.label as string) || "Untitled",
          nodes: JSON.parse(JSON.stringify(nodes)),
          edges: JSON.parse(JSON.stringify(edges)),
          viewport,
        },
      ]);

      // Phase 1: zoom into the node (200ms)
      const nodeW =
        (node.style?.width as number) || node.measured?.width || 200;
      const nodeH =
        (node.style?.height as number) || node.measured?.height || 100;
      const targetZoom =
        Math.min(4, window.innerWidth / nodeW, window.innerHeight / nodeH) *
        0.6;
      setViewport(
        {
          x:
            -(node.position.x + nodeW / 2) * targetZoom + window.innerWidth / 2,
          y:
            -(node.position.y + nodeH / 2) * targetZoom +
            window.innerHeight / 2,
          zoom: targetZoom,
        },
        { duration: 250 },
      );

      // Phase 2: after zoom, swap content and fade in
      setTimeout(() => {
        const subCanvas = (node.data?.subCanvas as
          { nodes?: Node[]; edges?: Edge[] } | undefined) ?? {
          nodes: [],
          edges: [],
        };
        setNodes(subCanvas.nodes || []);
        setEdges(subCanvas.edges || []);
        setSelectedNodeId(null);
        setTimeout(() => {
          fitView({ duration: 300, padding: 0.2 });
          setCanvasTransition("idle");
        }, 50);
      }, 250);
    },
    [
      canvasTransition,
      nodes,
      edges,
      setNodes,
      setEdges,
      getViewport,
      setViewport,
      fitView,
    ],
  );

  // Smooth exit: fade → swap → restore viewport
  const exitToLevel = useCallback(
    (targetIndex: number) => {
      if (canvasStack.length === 0 || canvasTransition !== "idle") return;
      setCanvasTransition("exiting");

      // Save current sub-canvas into the parent node's data
      const currentLevel = canvasStack[canvasStack.length - 1];
      const parentNodes = currentLevel.nodes.map((n) => {
        if (n.id === currentLevel.nodeId) {
          return { ...n, data: { ...n.data, subCanvas: { nodes, edges } } };
        }
        return n;
      });

      // Cascade save if jumping multiple levels
      let restoredNodes = parentNodes;
      let restoredEdges = currentLevel.edges;
      let restoredViewport = currentLevel.viewport;

      if (targetIndex < canvasStack.length - 1) {
        for (let i = canvasStack.length - 2; i >= targetIndex; i--) {
          const level = canvasStack[i];
          restoredNodes = level.nodes.map((n) => {
            if (n.id === level.nodeId) {
              return {
                ...n,
                data: {
                  ...n.data,
                  subCanvas: { nodes: restoredNodes, edges: restoredEdges },
                },
              };
            }
            return n;
          });
          restoredEdges = level.edges;
          restoredViewport = level.viewport;
        }
      }

      // Phase 1: fade out (200ms via CSS), then swap
      setTimeout(() => {
        setNodes(restoredNodes);
        setEdges(restoredEdges);
        setCanvasStack((prev) => prev.slice(0, targetIndex));
        setSelectedNodeId(null);
        setTimeout(() => {
          setViewport(restoredViewport, { duration: 300 });
          setCanvasTransition("idle");
        }, 50);
      }, 200);
    },
    [
      canvasStack,
      canvasTransition,
      nodes,
      edges,
      setNodes,
      setEdges,
      setViewport,
    ],
  );

  useEffect(() => {
    const updateMousePosition = (ev: PointerEvent) => {
      document.documentElement.style.setProperty(
        "--mouse-x",
        `${ev.clientX}px`,
      );
      document.documentElement.style.setProperty(
        "--mouse-y",
        `${ev.clientY}px`,
      );
    };
    window.addEventListener("pointermove", updateMousePosition);
    return () => window.removeEventListener("pointermove", updateMousePosition);
  }, []);

  // Register enter-node event bus handler (arrow badge in SystemNode fires this)
  useEffect(() => {
    registerEnterNodeHandler((nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) enterNode(node);
    });
    return () => unregisterEnterNodeHandler();
  }, [nodes, enterNode]);

  const history = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const redoStack = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const lastLoadedId = useRef<number | null>(null);

  type SaveStatus = "saved" | "saving" | "unsaved" | "offline_saved";
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoad = useRef(true);

  const takeSnapshot = useCallback(() => {
    history.current.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    });
    if (history.current.length > 50) history.current.shift();
    redoStack.current = [];
  }, [nodes, edges]);

  const undo = useCallback(() => {
    if (history.current.length === 0) return;
    const prevState = history.current.pop();
    if (prevState) {
      redoStack.current.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      });
      setNodes(prevState.nodes);
      setEdges(prevState.edges);
    }
  }, [nodes, edges, setNodes, setEdges]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const nextState = redoStack.current.pop();
    if (nextState) {
      history.current.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      });
      setNodes(nextState.nodes);
      setEdges(nextState.edges);
    }
  }, [nodes, edges, setNodes, setEdges]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          undo();
        } else if (e.key === "y" || (e.key === "Z" && e.shiftKey)) {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const [menu, setMenu] = useState<{
    id: string;
    top: number;
    left: number;
    type: "node" | "pane";
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const focusNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        fitView({
          nodes: [node],
          duration: 800,
          padding: 1.2,
        });
        setSelectedNodeId(nodeId);
      }
    },
    [nodes, fitView],
  );

  useEffect(() => {
    if (canvasData && lastLoadedId.current !== workspaceId) {
      const localCache = getCanvasFromLocalCache(workspaceId);

      if (localCache && localCache.nodes && localCache.edges) {
        setNodes(localCache.nodes);
        setEdges(localCache.edges);
        setSaveStatus("offline_saved");
        toast({
          title: "Restored Unsaved Changes",
          description:
            "We found unsaved changes locally and restored them. They will sync automatically soon.",
        });
      } else {
        setNodes(canvasData.nodes || []);
        setEdges(canvasData.edges || []);
      }
      lastLoadedId.current = workspaceId;

      setTimeout(() => {
        isInitialLoad.current = false;
      }, 500);
    }
  }, [canvasData, workspaceId, setNodes, setEdges, toast]);

  useEffect(() => {
    if (isInitialLoad.current) return;
    if (isRemoteUpdate.current) return;

    // Slow persist to DB (3s debounce)
    saveCanvasToLocalCache(workspaceId, nodes, edges);
    setSaveStatus("unsaved");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus("saving");
      sync(
        { nodes, edges },
        {
          onSuccess: () => {
            setSaveStatus("saved");
          },
          onError: (err: Error) => {
            toast({
              title: "Offline Save",
              description: "Could not reach the server. Changes saved locally.",
              variant: "destructive",
            });
          },
        },
      );
    }, 3000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [nodes, edges, workspaceId, sync, toast]);

  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge): Edge => {
        const currentStyle = (edge.style as Record<string, unknown>) ?? {};
        const newStyle = {
          ...currentStyle,
          stroke: isSimulating ? "#FFFFFF" : "#555",
        };

        const prevMarkerEnd = edge.markerEnd;
        const newMarkerEnd =
          prevMarkerEnd && typeof prevMarkerEnd === "object"
            ? {
                ...(prevMarkerEnd as Record<string, unknown>),
                color: isSimulating ? "#FFFFFF" : "#555",
              }
            : prevMarkerEnd;

        return {
          ...edge,
          animated: isSimulating,
          style: newStyle,
          markerEnd: newMarkerEnd as Edge["markerEnd"],
        };
      }),
    );
  }, [isSimulating, setEdges]);

  useEffect(() => {
    const handleClickOutside = () => {
      setMenu(null);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const addNode = useCallback(
    (type: string, label: string, position = { x: 100, y: 100 }) => {
      takeSnapshot();
      const nodeTypeInfo = nodeTypesList.find((n) => n.type === type);
      const dim = nodeDimensions[type] || { w: 168, h: 96 };
      const brand = nodeBrands[type] || {
        color: "#4F46E5",
        borderColor: "#4338CA",
      };

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        style: {
          width: dim.w,
          height: dim.h,
          backgroundColor: brand.color,
          borderColor: brand.borderColor,
          borderRadius: 8,
          opacity: 1,
          fontSize: 13,
        },
        data: {
          label: label,
          category: nodeTypeInfo?.category || "Core",
          description: NODE_DESCRIPTIONS[type] || "",
          tags: [],
          fontColor: "#ffffff",
          icon: null,
          theme: "default",
          ai: {
            summary: "",
            notes: "",
            lastAnalyzed: null,
          },
        },
      };
      setNodes((nds) => nds.concat(newNode));
      trackNodeUsage(type);
      return newNode;
    },
    [takeSnapshot, setNodes],
  );

  const deleteNodes = useCallback(
    (ids: string[]) => {
      takeSnapshot();
      setNodes((nds) => nds.filter((node) => !ids.includes(node.id)));
      setEdges((eds) =>
        eds.filter(
          (edge) => !ids.includes(edge.source) && !ids.includes(edge.target),
        ),
      );
      if (selectedNodeId && ids.includes(selectedNodeId))
        setSelectedNodeId(null);
    },
    [takeSnapshot, setNodes, setEdges, selectedNodeId],
  );

  const deleteNode = useCallback(
    (id: string) => deleteNodes([id]),
    [deleteNodes],
  );

  const updateNodeData = useCallback(
    (id: string, newData: Partial<Record<string, unknown>>) => {
      takeSnapshot();
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === id) {
            return { ...node, data: { ...node.data, ...newData } };
          }
          return node;
        }),
      );
    },
    [takeSnapshot, setNodes],
  );

  const updateNodeStyle = useCallback(
    (id: string, style: Partial<Record<string, unknown>>) => {
      takeSnapshot();
      const snappedStyle: Record<string, unknown> = { ...style };

      if (typeof snappedStyle.width === "number")
        snappedStyle.width = Math.round(snappedStyle.width / 24) * 24;
      if (typeof snappedStyle.height === "number")
        snappedStyle.height = Math.round(snappedStyle.height / 24) * 24;

      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === id) {
            return { ...node, style: { ...node.style, ...snappedStyle } };
          }
          return node;
        }),
      );
    },
    [takeSnapshot, setNodes],
  );

  const updateEdgeData = useCallback(
    (id: string, newData: Partial<Record<string, unknown>>) => {
      takeSnapshot();
      setEdges((eds) =>
        eds.map((edge): Edge => {
          if (edge.id === id) {
            const labelVal =
              newData.label !== undefined
                ? newData.label
                : edge.data?.label || edge.label || "";
            return {
              ...edge,
              label: labelVal as string | undefined,
              data: { ...edge.data, ...newData },
            };
          }
          return edge;
        }),
      );
    },
    [takeSnapshot, setEdges],
  );

  const deleteEdge = useCallback(
    (id: string) => {
      takeSnapshot();
      setEdges((eds) => eds.filter((edge) => edge.id !== id));
      if (selectedEdgeId === id) setSelectedEdgeId(null);
    },
    [takeSnapshot, setEdges, selectedEdgeId],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      takeSnapshot();
      const style: React.CSSProperties = { stroke: "#555", strokeWidth: 2 };
      if (edgeStyle === "dashed") style.strokeDasharray = "5 5";
      if (edgeStyle === "dotted") style.strokeDasharray = "2 2";

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: edgeType,
            style,
            animated: isSimulating,
            markerEnd: hasArrow
              ? { type: "arrowclosed" as const, color: "#555" }
              : undefined,
            data: {
              label: "",
              description: "what this connection represents",
              ai: { notes: "" },
            },
          },
          eds,
        ),
      );
    },
    [setEdges, isSimulating, takeSnapshot, edgeType, edgeStyle, hasArrow],
  );

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      if (drawingMode === "annotation") {
        addNode("annotation", "Click to edit...", position);
      } else if (drawingMode === "infrastructure") {
        addNode("vpc", "New VPC", position);
      }
    },
    [drawingMode, screenToFlowPosition, addNode],
  );

  const handleSave = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveStatus("saving");
    sync(
      { nodes, edges },
      {
        onSuccess: () => {
          setSaveStatus("saved");
          toast({
            title: "Workspace changes saved",
            description:
              "Your architecture has been successfully synchronized.",
          });
        },
        onError: (err: any) => {
          setSaveStatus("offline_saved");
          toast({
            title: "Failed to save changes",
            description:
              err.message ||
              "An error occurred while saving. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  useEffect(() => {
    if (workspace && isSettingsOpen) {
      setWsDescription(workspace.description || "");
      setWsAuthor(workspace.author || "");
      setWsAiContext(workspace.aiContext || "");
      setWsTags(workspace.tags || []);
      setWsGroups(workspace.groups || []);
    }
  }, [workspace, isSettingsOpen]);

  const handleSaveWorkspaceSettings = () => {
    updateWorkspace.mutate(
      {
        id: workspaceId,
        description: wsDescription,
        author: wsAuthor,
        aiContext: wsAiContext,
        tags: wsTags,
        groups: wsGroups,
      },
      {
        onSuccess: () => {
          toast({ title: "Workspace settings updated successfully" });
          setIsSettingsOpen(false);
        },
        onError: (err: any) => {
          toast({
            title: "Failed to update workspace settings",
            description: err.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setMenu({
        id: node.id,
        top: event.clientY,
        left: event.clientX,
        type: "node",
      });
    },
    [setMenu],
  );

  const onSelectionContextMenu = useCallback(
    (event: React.MouseEvent, nodesList: Node[]) => {
      event.preventDefault();
      if (nodesList.length === 0) return;
      setMenu({
        id: "selection",
        top: event.clientY,
        left: event.clientX,
        type: "node", // Reuses the node menu but enables multi-select features organically
      });
    },
    [setMenu],
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setMenu({
        id: edge.id,
        top: event.clientY,
        left: event.clientX,
        type: "pane", // reuse pane menu style or handle separately
      });
    },
    [setMenu],
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setMenu({
        id: "pane",
        top: event.clientY,
        left: event.clientX,
        type: "pane",
      });
    },
    [setMenu],
  );

  const onDragStart = (
    event: React.DragEvent,
    nodeType: string,
    label: string,
  ) => {
    event.dataTransfer.setData(
      "application/reactflow",
      JSON.stringify({ type: nodeType, label }),
    );
    event.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const applyTemplate = (
    templateType: string,
    position: { x: number; y: number },
  ) => {
    takeSnapshot();
    const { nodes: newNodes, edges: newEdges } = generateTemplate(
      templateType,
      position,
    );

    setNodes((nds) => nds.concat(newNodes));
    setEdges((eds) => eds.concat(newEdges));
  };

  const onDelete = (id: string) => {
    deleteNode(id);
  };

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const dataJSON = event.dataTransfer.getData("application/reactflow");
      if (!dataJSON) return;
      const data = JSON.parse(dataJSON);
      if (!data.type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const snappedPosition = {
        x: Math.round(position.x / 12) * 12,
        y: Math.round(position.y / 12) * 12,
      };

      if (data.type.startsWith("template:")) {
        applyTemplate(data.type, snappedPosition);
      } else {
        addNode(data.type, data.label, snappedPosition);
      }
    },
    [screenToFlowPosition, addNode, takeSnapshot, setNodes, setEdges],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isEditing =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA";

      // Escape — exit nested canvas or deselect
      if (e.key === "Escape") {
        if (isEditing) return;
        if (canvasStack.length > 0) {
          exitToLevel(canvasStack.length - 1);
          return;
        }
        setSelectedNodeId(null);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (isEditing) return;
        if (selectedNodeId) {
          deleteNode(selectedNodeId);
        } else if (selectedEdgeId) {
          deleteEdge(selectedEdgeId);
        }
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "s") {
          e.preventDefault();
          if (!isSyncing) {
            handleSave();
          }
        } else if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          zoomIn();
        } else if (e.key === "-") {
          e.preventDefault();
          zoomOut();
        } else if (e.key === "0") {
          e.preventDefault();
          fitView({ duration: 400 });
        } else if (e.key === "d" && selectedNodeId) {
          e.preventDefault();
          duplicateNode(selectedNodeId);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, deleteNode, isSyncing, nodes, edges]);

  const duplicateNode = useCallback(
    (id: string) => {
      takeSnapshot();
      const node = nodes.find((n) => n.id === id);
      if (node) {
        const newNode = {
          ...node,
          id: `${node.id}-copy-${Date.now()}`,
          position: { x: node.position.x + 20, y: node.position.y + 20 },
          selected: false,
        };
        setNodes((nds) => nds.concat(newNode));
      }
    },
    [nodes, setNodes, takeSnapshot],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setActiveTab("properties");
  }, []);

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    // Double-click always opens properties for inline editing
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setActiveTab("properties");
    setTimeout(() => {
      const input = document.querySelector('[data-property-input="true"]');
      if (input instanceof HTMLElement) {
        input.focus();
        if (
          input instanceof HTMLTextAreaElement ||
          input instanceof HTMLInputElement
        ) {
          input.select();
        }
      }
    }, 50);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    setActiveTab("properties");
  }, []);

  const onNodeDragStart = useCallback(() => {
    takeSnapshot();
  }, [takeSnapshot]);

  const onNodeDrag = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const now = Date.now();
      if (now - lastNodeMoveSent.current < 50) return; // Throttle to ~20fps
      lastNodeMoveSent.current = now;
      sendNodeMove(node.id, node.position.x, node.position.y, node.parentId);
    },
    [sendNodeMove],
  );

  const duplicateSelection = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      takeSnapshot();
      const newNodes: Node[] = [];
      ids.forEach((id) => {
        const node = nodes.find((n) => n.id === id);
        if (node) {
          newNodes.push({
            ...node,
            id: `${node.id}-copy-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            position: { x: node.position.x + 20, y: node.position.y + 20 },
            selected: true,
          });
        }
      });
      setNodes((nds) => [
        ...nds.map((n) => ({ ...n, selected: false })),
        ...newNodes,
      ]);
    },
    [nodes, setNodes, takeSnapshot],
  );

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const { parentId, localPosition } = calculateContainment(node, nodes);

      if (parentId) {
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id === node.id) {
              return { ...n, parentId, position: localPosition! };
            }
            return n;
          }),
        );
        sendNodeMove(node.id, localPosition!.x, localPosition!.y, parentId);
      } else {
        // Check if we dragged out of a parent
        const containers = nodes.filter(
          (n) =>
            ["vpc", "region", "k8s-namespace"].includes(n.type!) &&
            n.id !== node.id,
        );
        const w = node.measured?.width || (node.style?.width as number) || 120;
        const h = node.measured?.height || (node.style?.height as number) || 80;
        const centerX = node.position.x + w / 2;
        const centerY = node.position.y + h / 2;

        const isStillInParent = containers.some((c) => {
          const cw = (c.style?.width as number) || 0;
          const ch = (c.style?.height as number) || 0;
          return (
            centerX >= c.position.x &&
            centerX <= c.position.x + cw &&
            centerY >= c.position.y &&
            centerY <= c.position.y + ch
          );
        });

        if (!isStillInParent && node.parentId) {
          const globalPos = calculateGlobalPosition(node, nodes);
          if (globalPos) {
            setNodes((nds) =>
              nds.map((n) => {
                if (n.id === node.id) {
                  return {
                    ...n,
                    parentId: undefined,
                    extent: undefined,
                    position: globalPos,
                  };
                }
                return n;
              }),
            );
            sendNodeMove(node.id, globalPos.x, globalPos.y, null);
          }
        } else {
          // Send final position even if no containment change
          sendNodeMove(
            node.id,
            node.position.x,
            node.position.y,
            node.parentId,
          );
        }
      }
    },
    [nodes, setNodes, sendNodeMove],
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) || null;

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#000000]">
        <Loader2 className="w-8 h-8 animate-spin text-white/10" />
      </div>
    );
  }

  if (isError || (!isLoading && !workspace)) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#000000] text-white font-sans">
        <Box className="w-16 h-16 text-white/10 mb-6" />
        <h1 className="text-2xl font-black uppercase tracking-widest mb-3">
          Project Not Found
        </h1>
        <p className="text-white/40 mb-8 max-w-md text-center text-sm leading-relaxed">
          The architecture project you are looking for does not exist, has been
          deleted, or you do not have permission to access it.
        </p>
        <Link href="/">
          <button className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md transition-colors text-[11px] font-bold tracking-[0.2em] uppercase text-white/80 hover:text-white">
            Return to Library
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden font-sans text-sm selection:bg-white/10 bg-[#09090b] text-white flex flex-col relative">
      <Helmet>
        <title>
          {workspace?.title
            ? `${workspace.title} — Meshwork Studio`
            : "Workspace — Meshwork Studio"}
        </title>
      </Helmet>

      {/* Top Navigation Header & Project Menu (Image 3) */}
      <WorkspaceHeader
        workspace={workspace}
        workspaceId={workspaceId}
        user={user}
        userRole={userRole}
        canEdit={canEdit}
        canManage={canManage}
        canDelete={canDelete}
        saveStatus={saveStatus}
        isSimulating={isSimulating}
        setIsSimulating={setIsSimulating}
        undo={undo}
        redo={redo}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        collaborators={collaborators}
        teamMembers={teamMembers}
        teamId={teamId}
        updateRole={updateRole}
        handleExportPng={handleExportPng}
        handleExportSvg={handleExportSvg}
        handleExportJson={handleExportJson}
        handleImportJson={handleImportJson}
        handleDuplicate={handleDuplicate}
        handleCopyInvite={handleCopyInvite}
        handleDeleteWorkspace={() => {
          if (confirm("Delete this project?")) {
            deleteWorkspace.mutate(workspaceId, {
              onSuccess: () => {
                toast({ title: "Deleted" });
                setLocation("/home");
              },
            });
          }
        }}
        handleRename={(newTitle) => {
          updateWorkspace.mutate(
            { id: workspaceId, title: newTitle },
            {
              onSuccess: () => toast({ title: "Renamed project" }),
              onError: (e: Error) =>
                toast({
                  title: "Rename failed",
                  description: e.message,
                  variant: "destructive",
                }),
            },
          );
        }}
        openSettings={() => setIsSettingsOpen(true)}
        snapToGrid={snapToGrid}
        setSnapToGrid={setSnapToGrid}
        gridSize={gridSize}
        setGridSize={setGridSize}
        hasArrow={hasArrow}
        setHasArrow={setHasArrow}
        edgeType={edgeType}
        setEdgeType={setEdgeType}
        edgeStyle={edgeStyle}
        setEdgeStyle={setEdgeStyle}
        bgVariant={bgVariant}
        setBgVariant={setBgVariant}
        canvasStack={canvasStack}
        exitToLevel={exitToLevel}
        nodesCount={nodes.length}
        edgesCount={edges.length}
        activeView={activeView}
        setActiveView={setActiveView}
      />

      {/* Main Workspace Layout: Sidebar connected to header + framed Canvas */}
      <div className="flex-1 min-h-0 overflow-hidden flex transition-all duration-300 ease-in-out">
        {/* Collapsible Left Sidebar connected flush to Header */}
        <div
          className={`min-h-0 overflow-hidden transition-all duration-300 ease-in-out border-r border-white/[0.08] bg-[#111114] shrink-0 ${
            isSidebarOpen && canEdit
              ? "w-[360px] opacity-100"
              : "w-0 opacity-0 pointer-events-none border-r-0"
          }`}
        >
          <WorkspaceLeftSidebar
            isOpen={isSidebarOpen && canEdit}
            onClose={() => setIsSidebarOpen(false)}
          />
        </div>

        {/* Framed Canvas & Properties Section */}
        <div
          className="flex-1 min-h-0 p-2 grid gap-2 overflow-hidden"
          style={{
            gridTemplateColumns:
              selectedNode || selectedEdge ? "1fr minmax(260px, 24%)" : "1fr",
          }}
        >
          {/* Framed Canvas Viewport */}
          <motion.main
            ref={canvasWrapperRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="h-full relative bg-[#0A0A0A] overflow-hidden rounded-2xl border border-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.4)]"
            data-cursor={drawingMode}
            style={{ cursor: drawingMode === "pan" ? "grab" : undefined }}
          >
            {/* ── Canvas transition overlay ── */}
            <AnimatePresence>
              {canvasTransition !== "idle" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeInOut" }}
                  className="absolute inset-0 z-[999] bg-[#0A0A0A] pointer-events-none"
                />
              )}
            </AnimatePresence>

            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onEdgeClick={onEdgeClick}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onNodeContextMenu={onNodeContextMenu}
              onSelectionContextMenu={onSelectionContextMenu}
              onEdgeContextMenu={onEdgeContextMenu}
              onPaneContextMenu={onPaneContextMenu as any}
              onNodesDelete={() => takeSnapshot()}
              onEdgesDelete={() => takeSnapshot()}
              onPaneClick={onPaneClick}
              onDragOver={onDragOver}
              onDrop={onDrop}
              nodeTypes={nodeTypes}
              fitView
              className={
                drawingMode === "select"
                  ? "[&_.react-flow__pane]:!cursor-default"
                  : ""
              }
              defaultEdgeOptions={{
                type: "step",
                style: { stroke: "#555", strokeWidth: 2 },
              }}
              snapToGrid={snapToGrid}
              snapGrid={[gridSize, gridSize]}
              colorMode="dark"
              connectionMode={ConnectionMode.Loose}
              panOnScroll={true}
              panOnDrag={drawingMode === "pan" ? true : [1, 2]}
              selectionOnDrag={
                drawingMode === "select" ||
                drawingMode === "infrastructure" ||
                drawingMode === "annotation"
              }
              selectionMode={SelectionMode.Partial}
              nodesDraggable={canEdit && drawingMode === "pan"}
              elementsSelectable={canEdit}
              onMouseMove={handlePaneMouseMove}
            >
              <Controls
                position="bottom-left"
                className="!bg-[#161616]/90 !backdrop-blur-2xl !border-white/[0.06] !text-white/50 !shadow-[0_8px_40px_rgba(0,0,0,0.7)] !rounded-2xl overflow-hidden !m-6 [&_button]:!bg-transparent [&_button]:!border-white/[0.05] [&_button]:hover:!bg-white/10 [&_button_svg]:!fill-white/70"
              />
              <MiniMap
                position="bottom-right"
                className="!bg-[#161616]/90 !backdrop-blur-2xl !border-white/[0.06] !shadow-[0_8px_40px_rgba(0,0,0,0.7)] !rounded-2xl !mr-6 !mb-6 overflow-hidden [&_.react-flow__minimap-mask]:!fill-white/80"
              />
              {bgVariant !== "none" && (
                <Background
                  variant={bgVariant as any}
                  gap={gridSize}
                  size={1.2}
                  color="#ffffff22"
                />
              )}

              {/* Collaborator cursors */}
              <CollaboratorCursors collaborators={collaborators} />

              {/* Mouse glow mask */}
              <div
                className="absolute inset-0 pointer-events-none z-[0]"
                style={{
                  WebkitMaskImage:
                    "radial-gradient(circle at var(--mouse-x, -1000px) var(--mouse-y, -1000px), black 0px, transparent 350px)",
                  maskImage:
                    "radial-gradient(circle at var(--mouse-x, -1000px) var(--mouse-y, -1000px), black 0px, transparent 350px)",
                }}
              >
                {bgVariant !== "none" && (
                  <Background
                    variant={bgVariant as any}
                    gap={gridSize}
                    size={1.5}
                    color="#FFFFFF"
                    className="opacity-50"
                  />
                )}
              </div>

              {menu && (
                <motion.div
                  ref={menuRef}
                  initial={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  transition={{ type: "spring", damping: 20, stiffness: 300 }}
                  style={{ top: menu.top, left: menu.left }}
                  className="fixed rounded-xl py-1.5 z-[100] min-w-[200px] bg-[#121214]/85 backdrop-blur-2xl border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_16px_48px_rgba(0,0,0,0.8)]"
                  onClick={() => setMenu(null)}
                >
                  {menu.type === "node" ? (
                    (() => {
                      const selectedNodes = nodes.filter(
                        (n) => n.selected || n.id === menu.id,
                      );
                      const isMultiSelect = selectedNodes.length > 1;

                      return (
                        <>
                          {!isMultiSelect && (
                            <button
                              onClick={() => {
                                setSelectedNodeId(menu.id);
                                setActiveTab("properties");
                              }}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] transition-colors hover:bg-white/[0.06] text-white/70 hover:text-white"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span className="flex-1 text-left">
                                Edit Properties
                              </span>
                              <span className="text-[10px] text-white/20 font-mono">
                                Dbl-click
                              </span>
                            </button>
                          )}
                          <button
                            onClick={() =>
                              isMultiSelect
                                ? duplicateSelection(
                                    selectedNodes.map((n) => n.id),
                                  )
                                : duplicateNode(menu.id)
                            }
                            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] transition-colors hover:bg-white/[0.06] text-white/70 hover:text-white"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span className="flex-1 text-left">
                              Duplicate{isMultiSelect ? " All" : ""}
                            </span>
                            <span className="text-[10px] text-white/20 font-mono">
                              ⌘D
                            </span>
                          </button>
                          <div className="h-px my-1 mx-2 bg-white/[0.04]" />
                          <button
                            onClick={() => {
                              takeSnapshot();
                              setNodes((nds) =>
                                nds.map((n) => {
                                  if (n.selected || n.id === menu.id) {
                                    const currentW =
                                      (n.style?.width as number) ||
                                      n.measured?.width ||
                                      120;
                                    const currentH =
                                      (n.style?.height as number) ||
                                      n.measured?.height ||
                                      80;
                                    return {
                                      ...n,
                                      position: {
                                        x: Math.round(n.position.x / 12) * 12,
                                        y: Math.round(n.position.y / 12) * 12,
                                      },
                                      style: {
                                        ...n.style,
                                        width: Math.round(currentW / 24) * 24,
                                        height: Math.round(currentH / 24) * 24,
                                      },
                                    };
                                  }
                                  return n;
                                }),
                              );
                            }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] transition-colors hover:bg-white/[0.06] text-white/70 hover:text-white"
                          >
                            <Grid className="w-3.5 h-3.5" />
                            <span className="flex-1 text-left">
                              Snap to Grid
                            </span>
                          </button>
                          {selectedNodes.length >= 2 && (
                            <>
                              <button
                                onClick={() => {
                                  if (selectedNodes.length < 2) return;
                                  takeSnapshot();
                                  const anchor = selectedNodes[0];
                                  const anchorW =
                                    (anchor.style?.width as number) ||
                                    anchor.measured?.width ||
                                    0;
                                  const targetCenterX =
                                    anchor.position.x + anchorW / 2;
                                  setNodes((nds) =>
                                    nds.map((n) => {
                                      if (n.selected || n.id === menu.id) {
                                        const w =
                                          (n.style?.width as number) ||
                                          n.measured?.width ||
                                          0;
                                        return {
                                          ...n,
                                          position: {
                                            ...n.position,
                                            x:
                                              Math.round(
                                                (targetCenterX - w / 2) / 12,
                                              ) * 12,
                                          },
                                        };
                                      }
                                      return n;
                                    }),
                                  );
                                }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] transition-colors hover:bg-white/[0.06] text-white/70 hover:text-white"
                              >
                                <AlignVerticalJustifyCenter className="w-3.5 h-3.5" />
                                <span className="flex-1 text-left">
                                  Align Vertical
                                </span>
                              </button>
                              <button
                                onClick={() => {
                                  if (selectedNodes.length < 2) return;
                                  takeSnapshot();
                                  const anchor = selectedNodes[0];
                                  const anchorH =
                                    (anchor.style?.height as number) ||
                                    anchor.measured?.height ||
                                    0;
                                  const targetCenterY =
                                    anchor.position.y + anchorH / 2;
                                  setNodes((nds) =>
                                    nds.map((n) => {
                                      if (n.selected || n.id === menu.id) {
                                        const h =
                                          (n.style?.height as number) ||
                                          n.measured?.height ||
                                          0;
                                        return {
                                          ...n,
                                          position: {
                                            ...n.position,
                                            y:
                                              Math.round(
                                                (targetCenterY - h / 2) / 12,
                                              ) * 12,
                                          },
                                        };
                                      }
                                      return n;
                                    }),
                                  );
                                }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] transition-colors hover:bg-white/[0.06] text-white/70 hover:text-white"
                              >
                                <AlignHorizontalJustifyCenter className="w-3.5 h-3.5" />
                                <span className="flex-1 text-left">
                                  Align Horizontal
                                </span>
                              </button>
                            </>
                          )}
                          <div className="h-px my-1 mx-2 bg-white/[0.04]" />
                          <button
                            onClick={() => {
                              const selectedIds = nodes
                                .filter((n) => n.selected)
                                .map((n) => n.id);
                              if (
                                menu.id !== "selection" &&
                                !selectedIds.includes(menu.id)
                              )
                                selectedIds.push(menu.id);
                              deleteNodes(selectedIds);
                            }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] hover:bg-red-500/10 transition-colors text-red-400/80 hover:text-red-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="flex-1 text-left">
                              Delete
                              {selectedNodes.length > 1
                                ? ` (${selectedNodes.length})`
                                : ""}
                            </span>
                            <span className="text-[10px] text-red-400/30 font-mono">
                              ⌫
                            </span>
                          </button>
                        </>
                      );
                    })()
                  ) : (
                    /* ── Pane context menu: quick-add favorites ── */
                    <>
                      <div className="px-3.5 py-1.5 text-[9px] uppercase font-bold text-white/20 tracking-[0.15em]">
                        Quick Add
                      </div>
                      {favoriteNodes.map((node) => (
                        <button
                          key={node.type}
                          onClick={() => {
                            const pos = screenToFlowPosition({
                              x: menu.left,
                              y: menu.top,
                            });
                            addNode(node.type, node.label, {
                              x: Math.round(pos.x / 12) * 12,
                              y: Math.round(pos.y / 12) * 12,
                            });
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] transition-colors hover:bg-white/[0.06] text-white/70 hover:text-white"
                        >
                          <node.icon className="w-3.5 h-3.5 text-white/40" />
                          {node.label}
                        </button>
                      ))}
                      <div className="h-px my-1 mx-2 bg-white/[0.04]" />
                      <button
                        onClick={() => {
                          const pos = screenToFlowPosition({
                            x: menu.left,
                            y: menu.top,
                          });
                          addNode("note", "Note...", {
                            x: Math.round(pos.x / 12) * 12,
                            y: Math.round(pos.y / 12) * 12,
                          });
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] transition-colors hover:bg-white/[0.06] text-white/70 hover:text-white"
                      >
                        <Type className="w-3.5 h-3.5 text-white/40" />
                        Sticky Note
                      </button>
                      <button
                        onClick={() => {
                          const pos = screenToFlowPosition({
                            x: menu.left,
                            y: menu.top,
                          });
                          addNode("junction", "Junction", {
                            x: Math.round(pos.x / 12) * 12,
                            y: Math.round(pos.y / 12) * 12,
                          });
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] transition-colors hover:bg-white/[0.06] text-white/70 hover:text-white"
                      >
                        <Circle className="w-3.5 h-3.5 text-white/40" />
                        Junction
                      </button>
                    </>
                  )}
                </motion.div>
              )}

              {/* ── Bottom-center horizontal toolbar ── */}
              <WorkspaceToolbar
                drawingMode={drawingMode}
                setDrawingMode={setDrawingMode}
                edgeStyle={edgeStyle}
                setEdgeStyle={setEdgeStyle}
                hasArrow={hasArrow}
                setHasArrow={setHasArrow}
                edgeType={edgeType}
                setEdgeType={setEdgeType}
                setEdges={setEdges}
                fitView={fitView}
                onAddNote={() => {
                  const pos = screenToFlowPosition({
                    x: window.innerWidth / 2,
                    y: window.innerHeight / 2,
                  });
                  addNode("note", "Sticky Note", {
                    x: Math.round(pos.x / 12) * 12,
                    y: Math.round(pos.y / 12) * 12,
                  });
                }}
              />
            </ReactFlow>
            <MoshZoneOverlay />
          </motion.main>

          {/* ── Right properties panel (3rd grid column) ── */}
          <AnimatePresence>
            {(selectedNode || selectedEdge) && (
              <motion.div
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="min-h-0 overflow-hidden"
              >
                <div className="h-full rounded-2xl bg-[#111114]/95 backdrop-blur-2xl border border-white/[0.06] overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
                  <div
                    className="h-full overflow-y-auto"
                    style={{ scrollbarWidth: "none" }}
                  >
                    <PropertiesSidebar
                      selectedNode={selectedNode}
                      selectedEdge={selectedEdge}
                      updateNodeData={updateNodeData}
                      updateNodeStyle={updateNodeStyle}
                      updateEdgeData={updateEdgeData}
                      deleteNode={onDelete}
                      deleteEdge={deleteEdge}
                      onClose={() => {
                        setSelectedNodeId(null);
                        setSelectedEdgeId(null);
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Workspace Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-[480px] w-full bg-[#0E0E0E]/95 backdrop-blur-2xl border border-[#252525] shadow-[0_32px_64px_rgba(0,0,0,0.7)] rounded-2xl text-white p-6 space-y-4">
          <DialogHeader className="border-b border-white/[0.06] pb-3">
            <DialogTitle className="text-[15px] font-bold uppercase tracking-wider flex items-center gap-2">
              <Settings className="w-4 h-4 text-white/50" />
              Workspace Settings
            </DialogTitle>
            <DialogDescription className="text-[11px] text-white/40">
              Edit details for your architecture project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1 scrollbar-thin">
            {/* Author */}
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-white/40">
                Author / Architect
              </Label>
              <Input
                type="text"
                value={wsAuthor}
                onChange={(e) => setWsAuthor(e.target.value)}
                className="h-9 rounded-lg bg-white/5 border-white/10 text-white text-[12px]"
                placeholder="e.g. garden-hoser67"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-white/40">
                Project Description
              </Label>
              <Textarea
                value={wsDescription}
                onChange={(e) => setWsDescription(e.target.value)}
                className="min-h-[80px] rounded-lg bg-white/5 border-white/10 text-white text-[12px] resize-none"
                placeholder="Describe the system architecture, its components and layout..."
              />
            </div>

            {/* AI Context */}
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-white/40 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#8ab4f8]" />
                AI Architectural Context
              </Label>
              <Textarea
                value={wsAiContext}
                onChange={(e) => setWsAiContext(e.target.value)}
                className="min-h-[100px] rounded-lg bg-white/5 border-white/10 text-white text-[12px] resize-none"
                placeholder="Provide specific guidelines, design rules, or background context..."
              />
              <span className="text-[9px] text-white/30 block leading-normal">
                This context helps the AI understand the intent of this diagram
                during architectural reviews.
              </span>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-white/40">
                Workspace Tags
              </Label>
              {wsTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {wsTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[10px] text-white/70"
                    >
                      {tag}
                      <button
                        onClick={() =>
                          setWsTags(wsTags.filter((t) => t !== tag))
                        }
                        className="w-3.5 h-3.5 flex items-center justify-center text-white/30 hover:text-white/75 rounded"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Add tag... (Press Enter)"
                  value={newWsTag}
                  onChange={(e) => setNewWsTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const trimmed = newWsTag.trim();
                      if (trimmed && !wsTags.includes(trimmed)) {
                        setWsTags([...wsTags, trimmed]);
                      }
                      setNewWsTag("");
                    }
                  }}
                  className="h-8 rounded-lg bg-white/5 border-white/10 text-white text-[11px]"
                />
                <button
                  onClick={() => {
                    const trimmed = newWsTag.trim();
                    if (trimmed && !wsTags.includes(trimmed)) {
                      setWsTags([...wsTags, trimmed]);
                    }
                    setNewWsTag("");
                  }}
                  className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white text-[11px] font-bold"
                >
                  +
                </button>
              </div>
            </div>

            {/* Groups */}
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-white/40">
                Architectural Groups
              </Label>
              {wsGroups.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {wsGroups.map((group) => (
                    <span
                      key={group}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[10px] text-white/70"
                    >
                      {group}
                      <button
                        onClick={() =>
                          setWsGroups(wsGroups.filter((g) => g !== group))
                        }
                        className="w-3.5 h-3.5 flex items-center justify-center text-white/30 hover:text-white/75 rounded"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Add group name... (Press Enter)"
                  value={newWsGroup}
                  onChange={(e) => setNewWsGroup(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const trimmed = newWsGroup.trim();
                      if (trimmed && !wsGroups.includes(trimmed)) {
                        setWsGroups([...wsGroups, trimmed]);
                      }
                      setNewWsGroup("");
                    }
                  }}
                  className="h-8 rounded-lg bg-white/5 border-white/10 text-white text-[11px]"
                />
                <button
                  onClick={() => {
                    const trimmed = newWsGroup.trim();
                    if (trimmed && !wsGroups.includes(trimmed)) {
                      setWsGroups([...wsGroups, trimmed]);
                    }
                    setNewWsGroup("");
                  }}
                  className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white text-[11px] font-bold"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-3 mt-2">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="px-4 py-2 text-[12px] font-medium text-white/60 hover:text-white rounded-lg hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveWorkspaceSettings}
              className="bg-[#1a73e8] hover:brightness-110 text-white text-[12px] font-semibold px-5 py-2 rounded-lg transition-all"
            >
              Save Settings
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Workspace() {
  return (
    <ReactFlowProvider>
      <WorkspaceView />
    </ReactFlowProvider>
  );
}

function MoshZoneOverlay() {
  const [zone, setZone] = useState<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0,
    y: 0,
  });
  const { x, y, zoom } = useViewport();

  useEffect(() => {
    const handleDesigning = (e: Event) => {
      const detail = (
        e as CustomEvent<{ active?: boolean; x?: number; y?: number }>
      ).detail;
      if (detail?.active) {
        setZone({ active: true, x: detail.x ?? 0, y: detail.y ?? 0 });
      } else {
        setZone((prev) => ({ ...prev, active: false }));
      }
    };
    window.addEventListener("mosh:designing", handleDesigning);
    return () => window.removeEventListener("mosh:designing", handleDesigning);
  }, []);

  if (!zone.active) return null;

  // Fixed size for the fake node
  const width = 800;
  const height = 600;

  // Project canvas coordinates to screen coordinates
  const screenX = zone.x * zoom + x;
  const screenY = zone.y * zoom + y;

  return (
    <div
      className="absolute top-0 left-0 pointer-events-none z-[10]"
      style={{
        transform: `translate(${screenX - (width * zoom) / 2}px, ${screenY - (height * zoom) / 2}px) scale(${zoom})`,
        transformOrigin: "top left",
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0"
        >
          <div className="absolute inset-0 border border-white/10 bg-white/[0.02] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.05)] overflow-hidden">
            {/* Scanning Laser */}
            <motion.div
              className="absolute left-0 right-0 h-[1px] bg-white shadow-[0_0_16px_2px_rgba(255,255,255,0.6)]"
              animate={{ top: ["0%", "100%", "0%"] }}
              transition={{ duration: 3, ease: "linear", repeat: Infinity }}
            />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
