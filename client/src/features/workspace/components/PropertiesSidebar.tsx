import React from "react";
import { Node, Edge } from "@xyflow/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Trash2,
  Box,
  X,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Palette,
  Tag,
  Sliders,
  ArrowRight,
} from "lucide-react";
import { nodeTypesList } from "@/features/workspace/utils/nodeTypes";
import type { NodeData, EdgeData, NodeStyle } from "@/types/canvas";

interface PropertiesSidebarProps {
  selectedNode: Node<NodeData> | null;
  selectedEdge?: Edge<EdgeData> | null;
  updateNodeData: (id: string, data: Partial<NodeData>) => void;
  updateNodeStyle: (id: string, style: Partial<NodeStyle>) => void;
  updateEdgeData?: (id: string, data: Partial<EdgeData>) => void;
  deleteNode: (id: string) => void;
  deleteEdge?: (id: string) => void;
  onClose?: () => void;
}

const ACCENT_COLORS = [
  "#3B82F6", // Blue
  "#6366F1", // Indigo
  "#8B5CF6", // Violet
  "#EC4899", // Pink
  "#EF4444", // Red
  "#F97316", // Orange
  "#F59E0B", // Amber
  "#10B981", // Emerald
  "#06B6D4", // Cyan
  "#64748B", // Slate
];

export const PropertiesSidebar: React.FC<PropertiesSidebarProps> = ({
  selectedNode,
  selectedEdge,
  updateNodeData,
  updateNodeStyle,
  updateEdgeData,
  deleteNode,
  deleteEdge,
  onClose,
}) => {
  const [styleExpanded, setStyleExpanded] = React.useState(false);
  const [aiExpanded, setAiExpanded] = React.useState(false);
  const [newTag, setNewTag] = React.useState("");

  // Handle when nothing is selected
  if (!selectedNode && !selectedEdge) {
    return null;
  }

  // --- NODE PROPERTIES SIDEBAR MODE ---
  if (selectedNode) {
    const nodeInfo = nodeTypesList.find((n) => n.type === selectedNode.type);
    const NodeIcon = nodeInfo?.icon || Box;
    const currentAccent = selectedNode.data?.accentColor;

    const tags = selectedNode.data?.tags ?? [];
    const nodeStyle = (selectedNode.style ?? {}) as NodeStyle;
    const backgroundColor = nodeStyle.backgroundColor ?? "";
    const borderColor = nodeStyle.borderColor ?? "";
    const borderRadius =
      nodeStyle.borderRadius !== undefined ? nodeStyle.borderRadius : 8;
    const opacity = nodeStyle.opacity !== undefined ? nodeStyle.opacity : 1;
    const fontColor = selectedNode.data?.fontColor ?? "";
    const fontSize = nodeStyle.fontSize !== undefined ? nodeStyle.fontSize : 13;
    const customIcon = selectedNode.data?.icon ?? "";
    const theme = selectedNode.data?.theme ?? "default";

    const ai = selectedNode.data?.ai || {
      summary: "",
      notes: "",
      lastAnalyzed: null,
    };

    const handleStyleChange = (
      key: keyof NodeStyle,
      value: NodeStyle[keyof NodeStyle],
    ) => {
      updateNodeStyle(selectedNode.id, { [key]: value });
    };

    const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const trimmed = newTag.trim();
        if (trimmed && !tags.includes(trimmed)) {
          updateNodeData(selectedNode.id, { tags: [...tags, trimmed] });
        }
        setNewTag("");
      }
    };

    const handleAddTagClick = () => {
      const trimmed = newTag.trim();
      if (trimmed && !tags.includes(trimmed)) {
        updateNodeData(selectedNode.id, { tags: [...tags, trimmed] });
      }
      setNewTag("");
    };

    const handleRemoveTag = (tagToRemove: string) => {
      updateNodeData(selectedNode.id, {
        tags: tags.filter((t) => t !== tagToRemove),
      });
    };

    const handleAiNotesChange = (val: string) => {
      updateNodeData(selectedNode.id, {
        ai: {
          ...ai,
          notes: val,
        },
      });
    };

    return (
      <div className="p-4 space-y-5">
        {/* ── Node Type Header ── */}
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: currentAccent
                ? `${currentAccent}20`
                : "rgba(255,255,255,0.06)",
            }}
          >
            <NodeIcon
              className="w-4 h-4"
              style={{ color: currentAccent || "rgba(255,255,255,0.6)" }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-white/90 truncate">
              {selectedNode.data?.label ?? "Untitled"}
            </div>
            <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-white/25">
              {nodeInfo?.category || "Node"}
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.05] transition-all flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="h-px bg-white/[0.04]" />

        {/* ── Name & Description ── */}
        <section className="space-y-4">
          {selectedNode.type === "note" ? (
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-white/30">
                Note Content
              </Label>
              <Textarea
                data-property-input="true"
                value={selectedNode.data?.label ?? ""}
                onChange={(e) =>
                  updateNodeData(selectedNode.id, { label: e.target.value })
                }
                className="min-h-[160px] rounded-md focus:ring-0 bg-white/5 border-white/10 text-white focus:border-white/20 text-[12px] resize-none"
                placeholder="Type your note here..."
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-widest font-bold text-white/30">
                  Display Name
                </Label>
                <Textarea
                  data-property-input="true"
                  value={selectedNode.data?.label ?? ""}
                  onChange={(e) =>
                    updateNodeData(selectedNode.id, { label: e.target.value })
                  }
                  className="min-h-[40px] max-h-[80px] py-1.5 rounded-md focus:ring-0 bg-white/5 border-white/10 text-white focus:border-white/20 text-[12px] scrollbar-thin"
                  placeholder="Node Name..."
                  rows={2}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-widest font-bold text-white/30">
                  Description
                </Label>
                <Textarea
                  value={selectedNode.data?.description ?? ""}
                  onChange={(e) =>
                    updateNodeData(selectedNode.id, {
                      description: e.target.value,
                    })
                  }
                  className="min-h-[60px] rounded-md focus:ring-0 bg-white/5 border-white/10 text-white focus:border-white/20 text-[11px] resize-none"
                  placeholder="Add notes about this component..."
                />
              </div>
            </div>
          )}
        </section>

        <div className="h-px bg-white/[0.04]" />

        {/* ── Tags Section ── */}
        <section className="space-y-3">
          <div className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-white/30" />
            <Label className="text-[10px] uppercase tracking-widest font-bold text-white/30">
              Tags
            </Label>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[10px] text-white/70 hover:bg-white/[0.08] transition-colors"
                >
                  {t}
                  <button
                    onClick={() => handleRemoveTag(t)}
                    className="w-3.5 h-3.5 flex items-center justify-center text-white/30 hover:text-white/70 rounded transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <Input
              type="text"
              placeholder="Add tag... (Press Enter)"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={handleAddTag}
              className="h-8 rounded-md bg-white/5 border-white/10 text-white text-[11px]"
            />
            <button
              onClick={handleAddTagClick}
              className="h-8 px-2.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 text-white text-[11px] font-bold transition-all"
            >
              +
            </button>
          </div>
        </section>

        <div className="h-px bg-white/[0.04]" />

        {/* ── Size (Width/Height) ── */}
        <section className="space-y-3">
          <Label className="text-[10px] uppercase tracking-widest font-bold text-white/30">
            Size
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="text-[9px] text-white/20 uppercase font-bold">
                W
              </div>
              <Input
                type="number"
                min={24}
                value={Math.round(
                  Number(
                    selectedNode.style?.width ??
                      (selectedNode as any).measured?.width ??
                      0,
                  ),
                )}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val > 0) {
                    updateNodeStyle(selectedNode.id, { width: val });
                  }
                }}
                className="h-8 rounded-md bg-white/5 border-white/10 text-white text-[11px]"
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-[9px] text-white/20 uppercase font-bold">
                H
              </div>
              <Input
                type="number"
                min={24}
                value={Math.round(
                  Number(
                    selectedNode.style?.height ??
                      (selectedNode as any).measured?.height ??
                      0,
                  ),
                )}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val > 0) {
                    updateNodeStyle(selectedNode.id, { height: val });
                  }
                }}
                className="h-8 rounded-md bg-white/5 border-white/10 text-white text-[11px]"
              />
            </div>
          </div>
        </section>

        <div className="h-px bg-white/[0.04]" />

        {/* ── Style Customization Section (Collapsible) ── */}
        <section className="space-y-2">
          <button
            onClick={() => setStyleExpanded(!styleExpanded)}
            className="w-full flex items-center justify-between py-1 text-white/40 hover:text-white/80 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-widest font-bold">
                Style Customization
              </span>
            </div>
            {styleExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {styleExpanded && (
            <div className="space-y-4 pt-2 border-t border-white/[0.02]">
              {/* Theme select */}
              <div className="space-y-1.5">
                <Label className="text-[9px] uppercase font-bold text-white/30">
                  Visual Theme
                </Label>
                <select
                  value={theme}
                  onChange={(e) =>
                    updateNodeData(selectedNode.id, { theme: e.target.value })
                  }
                  className="w-full h-8 rounded-md bg-white/5 border-white/10 text-white text-[11px] focus:ring-0 px-2 outline-none"
                >
                  <option value="default" className="bg-[#121214]">
                    Default (Solid)
                  </option>
                  <option value="neon" className="bg-[#121214]">
                    Neon Glow
                  </option>
                  <option value="glass" className="bg-[#121214]">
                    Glassmorphism
                  </option>
                  <option value="minimal" className="bg-[#121214]">
                    Minimal Outline
                  </option>
                </select>
              </div>

              {/* Background Color */}
              <div className="space-y-1.5">
                <Label className="text-[9px] uppercase font-bold text-white/30">
                  Background Color
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="e.g. #1E1E2F"
                    value={backgroundColor}
                    onChange={(e) =>
                      handleStyleChange("backgroundColor", e.target.value)
                    }
                    className="h-8 rounded-md bg-white/5 border-white/10 text-white text-[11px] font-mono flex-1"
                  />
                  <input
                    type="color"
                    value={
                      backgroundColor.startsWith("#") &&
                      backgroundColor.length === 7
                        ? backgroundColor
                        : "#1a1a2e"
                    }
                    onChange={(e) =>
                      handleStyleChange("backgroundColor", e.target.value)
                    }
                    className="w-8 h-8 rounded-md border border-white/10 bg-transparent p-0 cursor-pointer flex-shrink-0"
                  />
                </div>
              </div>

              {/* Border Color */}
              <div className="space-y-1.5">
                <Label className="text-[9px] uppercase font-bold text-white/30">
                  Border Color
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="e.g. #3A3A4F"
                    value={borderColor}
                    onChange={(e) =>
                      handleStyleChange("borderColor", e.target.value)
                    }
                    className="h-8 rounded-md bg-white/5 border-white/10 text-white text-[11px] font-mono flex-1"
                  />
                  <input
                    type="color"
                    value={
                      borderColor.startsWith("#") && borderColor.length === 7
                        ? borderColor
                        : "#555555"
                    }
                    onChange={(e) =>
                      handleStyleChange("borderColor", e.target.value)
                    }
                    className="w-8 h-8 rounded-md border border-white/10 bg-transparent p-0 cursor-pointer flex-shrink-0"
                  />
                </div>
              </div>

              {/* Border Radius */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[9px] uppercase font-bold text-white/30">
                    Border Radius
                  </Label>
                  <span className="text-[10px] text-white/30 font-mono">
                    {borderRadius}px
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="32"
                  step="1"
                  value={borderRadius}
                  onChange={(e) =>
                    handleStyleChange("borderRadius", parseInt(e.target.value))
                  }
                  className="w-full h-1 rounded-full appearance-none bg-white/10 accent-white/60"
                />
              </div>

              {/* Opacity */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[9px] uppercase font-bold text-white/30">
                    Opacity
                  </Label>
                  <span className="text-[10px] text-white/30 font-mono">
                    {Math.round(opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={opacity}
                  onChange={(e) =>
                    handleStyleChange("opacity", parseFloat(e.target.value))
                  }
                  className="w-full h-1 rounded-full appearance-none bg-white/10 accent-white/60"
                />
              </div>

              {/* Font Color */}
              <div className="space-y-1.5">
                <Label className="text-[9px] uppercase font-bold text-white/30">
                  Font Color
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="e.g. #FFFFFF"
                    value={fontColor}
                    onChange={(e) =>
                      updateNodeData(selectedNode.id, {
                        fontColor: e.target.value,
                      })
                    }
                    className="h-8 rounded-md bg-white/5 border-white/10 text-white text-[11px] font-mono flex-1"
                  />
                  <input
                    type="color"
                    value={
                      fontColor.startsWith("#") && fontColor.length === 7
                        ? fontColor
                        : "#ffffff"
                    }
                    onChange={(e) =>
                      updateNodeData(selectedNode.id, {
                        fontColor: e.target.value,
                      })
                    }
                    className="w-8 h-8 rounded-md border border-white/10 bg-transparent p-0 cursor-pointer flex-shrink-0"
                  />
                </div>
              </div>

              {/* Font Size */}
              <div className="space-y-1.5">
                <Label className="text-[9px] uppercase font-bold text-white/30">
                  Font Size
                </Label>
                <Input
                  type="number"
                  min={8}
                  max={36}
                  value={fontSize}
                  onChange={(e) =>
                    handleStyleChange(
                      "fontSize",
                      parseInt(e.target.value) || 12,
                    )
                  }
                  className="h-8 rounded-md bg-white/5 border-white/10 text-white text-[11px]"
                />
              </div>

              {/* Custom Icon Name */}
              <div className="space-y-1.5">
                <Label className="text-[9px] uppercase font-bold text-white/30">
                  Custom Lucide Icon
                </Label>
                <Input
                  type="text"
                  placeholder="e.g. Server, Database, Globe"
                  value={customIcon}
                  onChange={(e) =>
                    updateNodeData(selectedNode.id, {
                      icon: e.target.value || null,
                    })
                  }
                  className="h-8 rounded-md bg-white/5 border-white/10 text-white text-[11px]"
                />
                <span className="text-[9px] text-white/35 block leading-normal">
                  Type any valid Lucide icon name to render it dynamically.
                </span>
              </div>
            </div>
          )}
        </section>

        <div className="h-px bg-white/[0.04]" />

        {/* ── Brand Accent Color ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase tracking-widest font-bold text-white/30">
              Brand Color Accent
            </Label>
            {currentAccent && (
              <button
                onClick={() =>
                  updateNodeData(selectedNode.id, { accentColor: undefined })
                }
                className="text-[9px] text-white/20 hover:text-white/50 transition-colors flex items-center gap-1 uppercase font-bold tracking-wider"
                title="Reset to default brand color"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() =>
                  updateNodeData(selectedNode.id, { accentColor: color })
                }
                className="w-full aspect-square rounded-lg border relative transition-all hover:scale-110"
                style={{
                  backgroundColor: color,
                  borderColor:
                    currentAccent === color ? "white" : "transparent",
                  boxShadow:
                    currentAccent === color ? `0 0 12px ${color}60` : "none",
                }}
              >
                {currentAccent === color && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* ── Database Collections (the one useful technical field) ── */}
        {selectedNode.type === "database" && (
          <>
            <div className="h-px bg-white/[0.04]" />
            <section className="space-y-3">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-white/30">
                Collections / Tables
              </Label>
              <Textarea
                placeholder={"users\norders\nproducts"}
                value={(selectedNode.data?.collections ?? []).join("\n")}
                onChange={(e) => {
                  const colls = e.target.value
                    .split("\n")
                    .filter((s) => s.trim() !== "");
                  updateNodeData(selectedNode.id, { collections: colls });
                }}
                className="min-h-[80px] rounded-md focus:ring-0 bg-white/5 border-white/10 text-white focus:border-white/20 resize-none text-[11px] font-mono"
              />
            </section>
          </>
        )}

        {/* ── K8s Status (only for k8s nodes) ── */}
        {selectedNode.type?.startsWith("k8s-") && (
          <>
            <div className="h-px bg-white/[0.04]" />
            <section className="space-y-3">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-white/30">
                Status
              </Label>
              <select
                value={selectedNode.data?.status ?? ""}
                onChange={(e) =>
                  updateNodeData(selectedNode.id, {
                    status: e.target.value || undefined,
                  })
                }
                className="w-full h-8 rounded-md bg-white/5 border-white/10 text-white text-[11px] focus:ring-0 px-2 outline-none"
              >
                <option value="" className="bg-[#1a1a1a]">
                  Default
                </option>
                <option value="healthy" className="bg-[#1a1a1a]">
                  ✅ Healthy
                </option>
                <option value="error" className="bg-[#1a1a1a]">
                  ❌ Error
                </option>
                <option value="pending" className="bg-[#1a1a1a]">
                  ⏳ Pending
                </option>
              </select>
            </section>
          </>
        )}

        <div className="h-px bg-white/[0.04]" />

        {/* ── AI Context (Collapsible) ── */}
        <section className="space-y-2">
          <button
            onClick={() => setAiExpanded(!aiExpanded)}
            className="w-full flex items-center justify-between py-1 text-white/40 hover:text-white/80 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#8ab4f8]" />
              <span className="text-[10px] uppercase tracking-widest font-bold">
                AI Metadata
              </span>
            </div>
            {aiExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {aiExpanded && (
            <div className="space-y-3 pt-2 border-t border-white/[0.02] text-[11px]">
              {/* Summary */}
              <div className="space-y-1">
                <Label className="text-[9px] uppercase font-bold text-white/30">
                  AI Analysis Summary
                </Label>
                <div className="p-2.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-white/70 italic text-[11px] leading-relaxed max-h-[140px] overflow-y-auto scrollbar-thin">
                  {ai.summary ||
                    "No AI analysis summary generated yet. Ask AI Chat to analyze your canvas."}
                </div>
              </div>

              {/* AI Notes */}
              <div className="space-y-1">
                <Label className="text-[9px] uppercase font-bold text-white/30">
                  AI Collaboration Notes
                </Label>
                <Textarea
                  value={ai.notes || ""}
                  onChange={(e) => handleAiNotesChange(e.target.value)}
                  className="min-h-[80px] rounded-md focus:ring-0 bg-white/5 border-white/10 text-white focus:border-white/20 text-[11px] resize-none"
                  placeholder="Enter instructions, notes or rules for the AI about this component..."
                />
              </div>

              {/* Last Analyzed */}
              <div className="flex items-center justify-between text-[9px] text-white/20 mt-1 font-mono">
                <span>LAST ANALYZED:</span>
                <span>
                  {ai.lastAnalyzed
                    ? new Date(ai.lastAnalyzed).toLocaleString()
                    : "NEVER"}
                </span>
              </div>
            </div>
          )}
        </section>

        <div className="h-px bg-white/[0.04]" />

        {/* ── Delete Node ── */}
        <section className="pb-4">
          <button
            onClick={() => deleteNode(selectedNode.id)}
            className="w-full h-10 flex items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 transition-all font-bold text-[10px] uppercase tracking-widest"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Component
          </button>
        </section>
      </div>
    );
  }

  // --- EDGE PROPERTIES SIDEBAR MODE ---
  if (selectedEdge) {
    const edgeLabel = selectedEdge.data?.label || selectedEdge.label || "";
    const edgeDesc = selectedEdge.data?.description || "";
    const edgeAi = selectedEdge.data?.ai || { notes: "" };

    const handleEdgeFieldChange = (key: string, value: any) => {
      if (updateEdgeData) {
        updateEdgeData(selectedEdge.id, { [key]: value });
      }
    };

    const handleEdgeAiChange = (val: string) => {
      if (updateEdgeData) {
        updateEdgeData(selectedEdge.id, {
          ai: {
            ...edgeAi,
            notes: val,
          },
        });
      }
    };

    return (
      <div className="p-4 space-y-5">
        {/* ── Connection Header ── */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/[0.06] flex-shrink-0">
            <ArrowRight className="w-4 h-4 text-white/50" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-white/90 truncate">
              {(edgeLabel as string) || "Connection Line"}
            </div>
            <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-white/25">
              Flow Edge
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.05] transition-all flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="h-px bg-white/[0.04]" />

        {/* ── Name & Description ── */}
        <section className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest font-bold text-white/30">
              Connection Label
            </Label>
            <Input
              type="text"
              data-property-input="true"
              value={edgeLabel as string}
              onChange={(e) => handleEdgeFieldChange("label", e.target.value)}
              className="h-9 rounded-md bg-white/5 border-white/10 text-white text-[12px]"
              placeholder="e.g. JSON/HTTPS, gRPC, Queue Event"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest font-bold text-white/30">
              Description
            </Label>
            <Textarea
              value={edgeDesc}
              onChange={(e) =>
                handleEdgeFieldChange("description", e.target.value)
              }
              className="min-h-[80px] rounded-md focus:ring-0 bg-white/5 border-white/10 text-white focus:border-white/20 text-[11px] resize-none"
              placeholder="What does this connection represent or transmit?"
            />
          </div>
        </section>

        <div className="h-px bg-white/[0.04]" />

        {/* ── AI Notes Section ── */}
        <section className="space-y-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#8ab4f8]" />
            <Label className="text-[10px] uppercase tracking-widest font-bold text-white/30">
              AI Collaboration Notes
            </Label>
          </div>
          <Textarea
            value={edgeAi.notes || ""}
            onChange={(e) => handleEdgeAiChange(e.target.value)}
            className="min-h-[100px] rounded-md focus:ring-0 bg-white/5 border-white/10 text-white focus:border-white/20 text-[11px] resize-none"
            placeholder="Provide details about security policies, protocol requirements, data formats, or bandwidth settings for the AI..."
          />
        </section>

        <div className="h-px bg-white/[0.04]" />

        {/* ── Delete Connection ── */}
        {deleteEdge && (
          <section className="pb-4">
            <button
              onClick={() => deleteEdge(selectedEdge.id)}
              className="w-full h-10 flex items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 transition-all font-bold text-[10px] uppercase tracking-widest"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Connection
            </button>
          </section>
        )}
      </div>
    );
  }

  return null;
};
