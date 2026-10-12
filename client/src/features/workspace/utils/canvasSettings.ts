// Canvas settings definitions and validation
import { BackgroundVariant } from "@xyflow/react";
import { z } from "zod";

// ─── Grid settings ───────────────────────────────────────────────────

export const GRID_SIZE_MIN = 10;
export const GRID_SIZE_MAX = 50;
export const GRID_SIZE_DEFAULT = 20;

export const gridSizeSchema = z
  .number()
  .min(GRID_SIZE_MIN)
  .max(GRID_SIZE_MAX)
  .int();

// ─── Edge types ──────────────────────────────────────────────────────

export const EDGE_TYPES = [
  "step",
  "straight",
  "smoothstep",
  "default",
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const EDGE_TYPE_LABELS: Record<EdgeType, string> = {
  step: "Step",
  straight: "Straight",
  smoothstep: "Smooth",
  default: "Bezier",
};

// ─── Edge styles ─────────────────────────────────────────────────────

export const EDGE_STYLES = ["solid", "dashed", "dotted"] as const;
export type EdgeStyle = (typeof EDGE_STYLES)[number];

// ─── Background variants ────────────────────────────────────────────

export const BG_VARIANTS = ["dots", "lines", "none"] as const;
export type BgVariant = (typeof BG_VARIANTS)[number];

/** Map our background setting to React Flow's variant enum. Call only after ruling out "none". */
export function toBackgroundVariant(
  variant: Exclude<BgVariant, "none">,
): BackgroundVariant {
  return variant === "dots" ? BackgroundVariant.Dots : BackgroundVariant.Lines;
}

export const BG_VARIANT_LABELS: Record<BgVariant, string> = {
  dots: "Dots",
  lines: "Lines",
  none: "None",
};

// ─── Validation helpers ──────────────────────────────────────────────

export function clampGridSize(value: number): number {
  return Math.max(GRID_SIZE_MIN, Math.min(GRID_SIZE_MAX, Math.round(value)));
}

export function isValidEdgeType(value: string): value is EdgeType {
  return (EDGE_TYPES as readonly string[]).includes(value);
}

export function isValidEdgeStyle(value: string): value is EdgeStyle {
  return (EDGE_STYLES as readonly string[]).includes(value);
}

export function isValidBgVariant(value: string): value is BgVariant {
  return (BG_VARIANTS as readonly string[]).includes(value);
}
