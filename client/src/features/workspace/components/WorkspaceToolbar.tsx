import React from "react";
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
  FiArrowRight,
  FiCornerDownRight,
  FiEdit3,
  FiMaximize2,
  FiFileText,
} from "react-icons/fi";
import { FaHand } from "react-icons/fa6";
import { Panel } from "@xyflow/react";
import type { Edge } from "@xyflow/react";
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
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
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
  setEdges,
  fitView,
  onAddNote,
}: WorkspaceToolbarProps) {
  return (
    <Panel position="bottom-center" className="mb-6 z-40">
      <motion.div
        initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        className="flex items-center rounded-2xl p-1 gap-0.5 bg-[#121214]/90 backdrop-blur-2xl border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_12px_40px_rgba(0,0,0,0.6)] select-none"
      >
        {/* Select Tool */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDrawingMode("select")}
              className={`w-8 h-8 rounded-xl transition-all ${
                drawingMode === "select"
                  ? "bg-white/[0.15] text-white shadow-sm"
                  : "text-white/40 hover:text-white/80 hover:bg-white/[0.05]"
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
              onClick={() => setDrawingMode("pan")}
              className={`w-8 h-8 rounded-xl transition-all ${
                drawingMode === "pan"
                  ? "bg-white/[0.15] text-white shadow-sm"
                  : "text-white/40 hover:text-white/80 hover:bg-white/[0.05]"
              }`}
            >
              <FaHand className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Pan canvas (H)</TooltipContent>
        </Tooltip>

        <div className="w-px h-3.5 bg-white/[0.08] mx-0.5" />

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
                  ? "bg-[#00E5A0]/20 text-[#00E5A0] border border-[#00E5A0]/30 shadow-[0_0_12px_rgba(0,229,160,0.2)]"
                  : "text-white/40 hover:text-white/80 hover:bg-white/[0.05]"
              }`}
            >
              <FiSquare className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Infrastructure Zone (I)</TooltipContent>
        </Tooltip>

        {/* Connection Settings Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 rounded-xl text-white/40 hover:text-white/80 hover:bg-white/[0.05] transition-all"
                >
                  <FiShare2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Connection Style</TooltipContent>
            </Tooltip>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 p-3 bg-[#121214]/95 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_16px_48px_rgba(0,0,0,0.8)] z-[150] space-y-3.5 text-white"
            side="top"
            align="center"
            sideOffset={14}
          >
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase font-bold tracking-wider text-white/40 px-1">
                Line Style
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[
                  {
                    id: "solid",
                    label: "Solid",
                    icon: FiMinus,
                    hasArrow: false,
                  },
                  {
                    id: "dashed",
                    label: "Dashed",
                    icon: FiMinus,
                    hasArrow: false,
                  },
                  {
                    id: "arrow",
                    label: "Arrow",
                    icon: FiArrowRight,
                    hasArrow: true,
                  },
                ].map((style) => {
                  const isSelected =
                    edgeStyle ===
                      (style.id === "dashed" ? "dashed" : "solid") &&
                    hasArrow === style.hasArrow;
                  return (
                    <button
                      key={style.id}
                      onClick={() => {
                        const newStyle =
                          style.id === "dashed" ? "dashed" : "solid";
                        const newArrow = style.hasArrow;
                        setEdgeStyle(newStyle);
                        setHasArrow(newArrow);
                        setEdges((eds) =>
                          eds.map((e) => {
                            if (!e.selected) return e;
                            const s: any = {
                              ...e.style,
                              strokeDasharray: undefined,
                            };
                            if (newStyle === "dashed")
                              s.strokeDasharray = "5 5";
                            let m: any = undefined;
                            if (newArrow)
                              m = {
                                type: "arrowclosed" as const,
                                color: "#555",
                              };
                            return { ...e, style: s, markerEnd: m };
                          }),
                        );
                      }}
                      className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition-all ${
                        isSelected
                          ? "bg-white/15 border-white/20 text-white font-semibold"
                          : "border-transparent text-white/40 hover:bg-white/5 hover:text-white/70"
                      }`}
                    >
                      <style.icon className="w-3 h-3" />
                      <span className="text-[10px]">{style.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] uppercase font-bold tracking-wider text-white/40 px-1">
                Line Shape
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[
                  {
                    id: "straight",
                    label: "Straight",
                    icon: FiMinus,
                    rotate: true,
                  },
                  { id: "default", label: "Curved", icon: FiShare2 },
                  { id: "step", label: "Step", icon: FiCornerDownRight },
                ].map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => {
                      setEdgeType(tool.id as any);
                      setEdges((eds) =>
                        eds.map((e) =>
                          e.selected ? { ...e, type: tool.id } : e,
                        ),
                      );
                    }}
                    className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition-all ${
                      edgeType === tool.id
                        ? "bg-white text-black border-white shadow-md font-semibold"
                        : "border-white/5 text-white/40 hover:bg-white/5 hover:text-white/70"
                    }`}
                  >
                    <tool.icon
                      className={`w-3 h-3 ${tool.rotate ? "rotate-45" : ""}`}
                    />
                    <span className="text-[10px]">{tool.label}</span>
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
                className="w-8 h-8 rounded-xl text-white/40 hover:text-white/80 hover:bg-white/[0.05] transition-all"
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
                  ? "bg-[#FF6B35]/20 text-[#FF6B35] border border-[#FF6B35]/30 shadow-[0_0_12px_rgba(255,107,53,0.2)]"
                  : "text-white/40 hover:text-white/80 hover:bg-white/[0.05]"
              }`}
            >
              <FiEdit3 className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Annotation Tool (A)</TooltipContent>
        </Tooltip>

        <div className="w-px h-3.5 bg-white/[0.08] mx-0.5" />

        {/* Fit View */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fitView({ duration: 600 })}
              className="w-8 h-8 rounded-xl text-white/40 hover:text-white/80 hover:bg-white/[0.05] transition-all"
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
