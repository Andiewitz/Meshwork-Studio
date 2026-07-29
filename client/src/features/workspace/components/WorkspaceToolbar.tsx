import React from "react";
import { motion } from "framer-motion";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  MousePointer2,
  Hand,
  Square,
  Spline,
  Minus,
  ArrowRight,
  Milestone,
  Pencil,
  Maximize,
} from "lucide-react";
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
}: WorkspaceToolbarProps) {
  return (
    <Panel position="bottom-center" className="mb-6 z-50">
      <motion.div
        initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        className="flex items-center rounded-2xl p-1.5 gap-0.5 bg-[#121214]/80 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_32px_rgba(0,0,0,0.5)]"
      >
        {[
          { mode: "select" as const, icon: MousePointer2, title: "Select" },
          { mode: "pan" as const, icon: Hand, title: "Pan" },
        ].map((tool) => (
          <motion.button
            key={tool.mode}
            onClick={() => setDrawingMode(tool.mode)}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${drawingMode === tool.mode ? "bg-white/10 text-white border border-white/15 shadow-sm" : "text-white/40 hover:text-white hover:bg-white/[0.06]"}`}
            title={tool.title}
            whileTap={{ scale: 0.92 }}
          >
            <tool.icon className="w-4 h-4" />
          </motion.button>
        ))}

        <div className="w-px h-5 bg-white/[0.08] mx-1" />

        <motion.button
          onClick={() =>
            setDrawingMode(
              drawingMode === "infrastructure" ? "select" : "infrastructure",
            )
          }
          className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${drawingMode === "infrastructure" ? "bg-white/10 text-white border border-white/15 shadow-sm" : "text-white/40 hover:text-white hover:bg-white/[0.06]"}`}
          title="Infrastructure Zone"
          whileTap={{ scale: 0.92 }}
        >
          <Square className="w-4 h-4" />
        </motion.button>

        <Popover>
          <PopoverTrigger asChild>
            <motion.button
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all text-white/40 hover:text-white hover:bg-white/[0.06]`}
              title="Connection Settings"
              whileTap={{ scale: 0.92 }}
            >
              <Spline className="w-4 h-4" />
            </motion.button>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 p-3 bg-[#121214]/85 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_16px_48px_rgba(0,0,0,0.8)] z-[150] space-y-4"
            side="top"
            align="center"
            sideOffset={16}
          >
            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold tracking-widest text-white/40 px-1">
                Line Style
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[
                  {
                    id: "solid",
                    label: "Normal",
                    icon: Minus,
                    hasArrow: false,
                  },
                  {
                    id: "dashed",
                    label: "Broken",
                    icon: Minus,
                    hasArrow: false,
                  },
                  {
                    id: "arrow",
                    label: "Arrow",
                    icon: ArrowRight,
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
                      className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border transition-all ${isSelected ? "bg-white/10 border-white/20 text-white" : "border-transparent text-white/40 hover:bg-white/5 hover:text-white/80"}`}
                    >
                      <style.icon className="w-4 h-4" />
                      <span className="text-[10px]">{style.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold tracking-widest text-white/40 px-1">
                Line Shape
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[
                  {
                    id: "straight",
                    label: "Diagonal",
                    icon: Minus,
                    rotate: true,
                  },
                  { id: "default", label: "Curved", icon: Spline },
                  { id: "step", label: "Orthogonal", icon: Milestone },
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
                    className={`flex flex-col items-center justify-center gap-1.5 h-16 rounded-lg border transition-all ${edgeType === tool.id ? "bg-white text-black border-white shadow-md" : "bg-transparent text-white/60 border-white/5 hover:bg-white/5 hover:border-white/10"}`}
                  >
                    <tool.icon
                      className={`w-4 h-4 ${tool.rotate ? "rotate-45" : ""}`}
                    />
                    <span className="text-[10px] font-bold">{tool.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <motion.button
          onClick={() =>
            setDrawingMode(
              drawingMode === "annotation" ? "select" : "annotation",
            )
          }
          className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${drawingMode === "annotation" ? "bg-white/10 text-white border border-white/15 shadow-sm" : "text-white/40 hover:text-white hover:bg-white/[0.06]"}`}
          title="Annotation"
          whileTap={{ scale: 0.92 }}
        >
          <Pencil className="w-4 h-4" />
        </motion.button>

        <motion.button
          onClick={() => fitView({ duration: 800 })}
          className="w-10 h-10 flex items-center justify-center rounded-xl transition-all text-white/40 hover:text-white hover:bg-white/[0.06]"
          title="Fit View"
          whileTap={{ scale: 0.92 }}
        >
          <Maximize className="w-4 h-4" />
        </motion.button>
      </motion.div>
    </Panel>
  );
}
