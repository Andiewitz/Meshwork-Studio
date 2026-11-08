import { motion } from "framer-motion";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  FiMousePointer,
  FiSquare,
  FiShare2,
  FiMinus,
  FiCornerDownRight,
  FiEdit3,
  FiMaximize2,
  FiFileText,
} from "react-icons/fi";
import { FaHand } from "react-icons/fa6";
import { Panel } from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import {
  CONNECTION_PRESETS,
  applyConnectionPreset,
  dashForStyle,
  type ConnectionPreset,
} from "@/features/workspace/utils/connectionStyles";
import type {
  EdgeType,
  EdgeStyle,
} from "@/features/workspace/utils/canvasSettings";

interface WorkspaceToolbarProps {
  drawingMode: "select" | "pan" | "annotation" | "infrastructure";
  setDrawingMode: (
    mode: "select" | "pan" | "annotation" | "infrastructure",
  ) => void;
  edgeStyle: EdgeStyle;
  setEdgeStyle: (style: EdgeStyle) => void;
  hasArrow: boolean;
  setHasArrow: (has: boolean) => void;
  edgeType: EdgeType;
  setEdgeType: (type: EdgeType) => void;
  preset: ConnectionPreset;
  setPreset: (preset: ConnectionPreset) => void;
  dark: boolean;
  canEdit: boolean;
  onUpdateSelected: (update: (edge: Edge) => Edge) => void;
  fitView: (options?: { duration?: number }) => void;
  onAddNote?: () => void;
}

export function WorkspaceToolbar({
  drawingMode,
  setDrawingMode,
  edgeStyle,
  setEdgeStyle,
  hasArrow,
  setHasArrow,
  edgeType,
  setEdgeType,
  preset,
  setPreset,
  dark,
  canEdit,
  onUpdateSelected,
  fitView,
  onAddNote,
}: WorkspaceToolbarProps) {
  return (
    <Panel
      position="bottom-center"
      className="mb-6 z-40 max-w-[calc(100%-2rem)]"
    >
      <motion.div
        initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        className="workspace-toolbar flex items-center overflow-x-auto rounded-2xl p-1 gap-0.5 ws-option backdrop-blur-2xl border ws-border shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_12px_40px_rgba(0,0,0,0.6)] select-none"
      >
        {/* Select Tool */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-pressed={drawingMode === "select"}
              onClick={() => setDrawingMode("select")}
              className={`w-8 h-8 rounded-xl transition-all ${
                drawingMode === "select"
                  ? "ws-surface-soft ws-ink shadow-sm"
                  : "ws-muted ws-hover-ink ws-hover-surface"
              }`}
            >
              <FiMousePointer className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Select tool (V)</TooltipContent>
        </Tooltip>

        {/* Pan Tool */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-pressed={drawingMode === "pan"}
              onClick={() => setDrawingMode("pan")}
              className={`w-8 h-8 rounded-xl transition-all ${
                drawingMode === "pan"
                  ? "ws-surface-soft ws-ink shadow-sm"
                  : "ws-muted ws-hover-ink ws-hover-surface"
              }`}
            >
              <FaHand className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Pan canvas (H)</TooltipContent>
        </Tooltip>

        <div className="w-px h-3.5 ws-surface-soft mx-0.5" />

        {/* Infrastructure Zone (VPC) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setDrawingMode(
                  drawingMode === "infrastructure"
                    ? "select"
                    : "infrastructure",
                )
              }
              className={`w-8 h-8 rounded-xl transition-all ${
                drawingMode === "infrastructure"
                  ? "ws-infrastructure-active bg-[#00E5A0]/20 text-[#00E5A0] border border-[#00E5A0]/30 shadow-[0_0_12px_rgba(0,229,160,0.2)]"
                  : "ws-muted ws-hover-ink ws-hover-surface"
              }`}
            >
              <FiSquare className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Infrastructure Zone (I)</TooltipContent>
        </Tooltip>

        {/* Connection Settings Popover */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Connection style"
                  className="w-8 h-8 rounded-xl ws-muted ws-hover-ink ws-hover-surface transition-all"
                >
                  <FiShare2 className="w-3.5 h-3.5" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">Connection Style</TooltipContent>
          </Tooltip>
          <PopoverContent
            className="workspace-popover w-64 max-h-[min(70vh,560px)] overflow-y-auto p-3 ws-option backdrop-blur-2xl border ws-border rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_16px_48px_rgba(0,0,0,0.8)] z-[150] space-y-3.5 ws-ink"
            side="top"
            align="center"
            sideOffset={14}
          >
            <div className="space-y-2">
              <p className="text-xs font-semibold ws-ink">Connection type</p>
              <p className="text-[11px] leading-relaxed ws-muted">
                Choose a preset for new connections or apply one to selected
                lines.
              </p>
              <div className="grid grid-cols-2 gap-1">
                {CONNECTION_PRESETS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={preset === option.id}
                    title={option.description}
                    onClick={() => {
                      const selectedPreset = option.id;
                      setPreset(selectedPreset);
                      setEdgeStyle(
                        selectedPreset === "async" ? "dashed" : "solid",
                      );
                      setHasArrow(true);
                      if (selectedPreset !== "request-response")
                        onUpdateSelected((edge) =>
                          applyConnectionPreset(edge, selectedPreset, dark),
                        );
                    }}
                    className={`rounded-lg border px-2 py-2 text-left text-[11px] disabled:opacity-50 ${preset === option.id ? "ws-primary ws-border font-semibold" : "ws-border ws-muted ws-hover-surface ws-hover-ink"}`}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 48 18"
                      className={`mb-1 h-4 w-12 ${option.id === "primary" ? "text-blue-500" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {option.id === "request-response" ? (
                        <>
                          <path d="M3 5h38m-4-3 4 3-4 3M45 13H7m4-3-4 3 4 3" />
                        </>
                      ) : (
                        <>
                          <path
                            d="M3 9h38"
                            strokeDasharray={
                              option.id === "async" ? "4 3" : undefined
                            }
                          />
                          <path d="m37 6 4 3-4 3" />
                        </>
                      )}
                    </svg>
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] leading-relaxed ws-muted">
                Request + response creates two separate, editable arrows on new
                connections.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold ws-ink">Line pattern</p>
              <div className="grid grid-cols-3 gap-1">
                {(["solid", "dashed", "dotted"] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={edgeStyle === style}
                    onClick={() => {
                      setEdgeStyle(style);
                      onUpdateSelected((edge) => ({
                        ...edge,
                        style: {
                          ...edge.style,
                          strokeDasharray: dashForStyle(style),
                        },
                      }));
                    }}
                    className={`rounded-lg border px-2 py-2 text-[11px] capitalize disabled:opacity-50 ${edgeStyle === style ? "ws-primary ws-border font-semibold" : "ws-border ws-muted ws-hover-surface ws-hover-ink"}`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold ws-ink">Arrowhead</p>
              <div className="grid grid-cols-2 gap-1">
                {[false, true].map((arrow) => (
                  <button
                    key={String(arrow)}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={hasArrow === arrow}
                    onClick={() => {
                      setHasArrow(arrow);
                      onUpdateSelected((edge) => ({
                        ...edge,
                        markerEnd: arrow
                          ? {
                              type: MarkerType.ArrowClosed,
                              color:
                                typeof edge.style?.stroke === "string"
                                  ? edge.style.stroke
                                  : dark
                                    ? "#a8b6c8"
                                    : "#46566a",
                            }
                          : undefined,
                      }));
                    }}
                    className={`rounded-lg border px-2 py-2 text-[11px] disabled:opacity-50 ${hasArrow === arrow ? "ws-primary ws-border font-semibold" : "ws-border ws-muted ws-hover-surface ws-hover-ink"}`}
                  >
                    {arrow ? "Arrow" : "None"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold ws-ink">Line shape</p>
              <div className="grid grid-cols-2 gap-1">
                {(
                  [
                    { id: "straight", label: "Straight", icon: FiMinus },
                    { id: "step", label: "Bent", icon: FiCornerDownRight },
                    {
                      id: "smoothstep",
                      label: "Rounded",
                      icon: FiCornerDownRight,
                    },
                    { id: "default", label: "Curved", icon: FiShare2 },
                  ] satisfies {
                    id: EdgeType;
                    label: string;
                    icon: typeof FiMinus;
                  }[]
                ).map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={edgeType === tool.id}
                    onClick={() => {
                      setEdgeType(tool.id);
                      onUpdateSelected((edge) => ({ ...edge, type: tool.id }));
                    }}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-[11px] disabled:opacity-50 ${edgeType === tool.id ? "ws-primary ws-border font-semibold" : "ws-border ws-muted ws-hover-surface ws-hover-ink"}`}
                  >
                    <tool.icon className="h-3.5 w-3.5" />
                    {tool.label}
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Text / Sticky Note */}
        {onAddNote && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onAddNote}
                className="w-8 h-8 rounded-xl ws-muted ws-hover-ink ws-hover-surface transition-all"
              >
                <FiFileText className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Add Sticky Note</TooltipContent>
          </Tooltip>
        )}

        {/* Annotation Tool */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setDrawingMode(
                  drawingMode === "annotation" ? "select" : "annotation",
                )
              }
              className={`w-8 h-8 rounded-xl transition-all ${
                drawingMode === "annotation"
                  ? "ws-annotation-active bg-[#FF6B35]/20 text-[#FF6B35] border border-[#FF6B35]/30 shadow-[0_0_12px_rgba(255,107,53,0.2)]"
                  : "ws-muted ws-hover-ink ws-hover-surface"
              }`}
            >
              <FiEdit3 className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Annotation Tool (A)</TooltipContent>
        </Tooltip>

        <div className="w-px h-3.5 ws-surface-soft mx-0.5" />

        {/* Fit View */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fitView({ duration: 600 })}
              className="w-8 h-8 rounded-xl ws-muted ws-hover-ink ws-hover-surface transition-all"
            >
              <FiMaximize2 className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Fit View (Ctrl+0)</TooltipContent>
        </Tooltip>
      </motion.div>
    </Panel>
  );
}
