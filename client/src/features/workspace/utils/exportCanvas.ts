import { toPng, toSvg } from "html-to-image";
import {
  getNodesBounds,
  getViewportForBounds,
  type ReactFlowInstance,
} from "@xyflow/react";
import { z } from "zod";

// ─── Constants ───────────────────────────────────────────────────────

const EXPORT_PADDING = 50;
const EXPORT_BG = "#0A0A0A";
const IMAGE_QUALITY = 2; // 2x resolution for retina

// ─── JSON Schema ─────────────────────────────────────────────────────

export const canvasJsonSchema = z.object({
  title: z
    .preprocess((val) => {
      if (val === undefined || val === null) return "Untitled";
      if (typeof val === "string" && val.trim() === "") return "Untitled";
      return val;
    }, z.string())
    .default("Untitled"),
  nodes: z.array(
    z
      .object({
        id: z.string(),
        type: z.string().optional(),
        position: z.object({ x: z.number(), y: z.number() }),
        data: z.record(z.string(), z.any()),
      })
      .passthrough(),
  ),
  edges: z.array(
    z
      .object({
        id: z.string(),
        source: z.string(),
        target: z.string(),
      })
      .passthrough(),
  ),
  exportedAt: z.string(),
  version: z.number().optional(),
});

export type CanvasJson = z.infer<typeof canvasJsonSchema>;

// ─── Helpers ─────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadText(
  content: string,
  filename: string,
  mime = "application/json",
) {
  const blob = new Blob([content], { type: mime });
  downloadBlob(blob, filename);
}

function sanitizeFilename(title: string): string {
  return (
    title
      .replace(/[^a-zA-Z0-9\-_\s]/g, "")
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "canvas"
  );
}

function getViewportElement(): HTMLElement | null {
  return document.querySelector(".react-flow__viewport");
}

// ─── Export as PNG ───────────────────────────────────────────────────

export async function exportAsPng(
  rfInstance: ReactFlowInstance,
  title = "canvas",
): Promise<void> {
  const nodes = rfInstance.getNodes();
  if (nodes.length === 0) throw new Error("No nodes to export");

  const bounds = getNodesBounds(nodes);
  const width = bounds.width + EXPORT_PADDING * 2;
  const height = bounds.height + EXPORT_PADDING * 2;

  const viewport = getViewportForBounds(
    bounds,
    width,
    height,
    0.5,
    2,
    EXPORT_PADDING,
  );

  const el = getViewportElement();
  if (!el) throw new Error("Canvas viewport element not found");

  const dataUrl = await toPng(el, {
    backgroundColor: EXPORT_BG,
    width: width * IMAGE_QUALITY,
    height: height * IMAGE_QUALITY,
    style: {
      width: String(width),
      height: String(height),
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  });

  // Convert data URL to blob for download
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  downloadBlob(blob, `${sanitizeFilename(title)}.png`);
}

// ─── Export as SVG ───────────────────────────────────────────────────

export async function exportAsSvg(
  rfInstance: ReactFlowInstance,
  title = "canvas",
): Promise<void> {
  const nodes = rfInstance.getNodes();
  if (nodes.length === 0) throw new Error("No nodes to export");

  const bounds = getNodesBounds(nodes);
  const width = bounds.width + EXPORT_PADDING * 2;
  const height = bounds.height + EXPORT_PADDING * 2;

  const viewport = getViewportForBounds(
    bounds,
    width,
    height,
    0.5,
    2,
    EXPORT_PADDING,
  );

  const el = getViewportElement();
  if (!el) throw new Error("Canvas viewport element not found");

  const svgData = await toSvg(el, {
    backgroundColor: EXPORT_BG,
    width: width * IMAGE_QUALITY,
    height: height * IMAGE_QUALITY,
    style: {
      width: String(width),
      height: String(height),
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  });

  // SVG data URL → raw SVG
  const svgContent = decodeURIComponent(svgData.split(",")[1] || "");
  downloadText(svgContent, `${sanitizeFilename(title)}.svg`, "image/svg+xml");
}

// ─── Export as JSON ──────────────────────────────────────────────────

export function exportAsJson(
  nodes: any[],
  edges: any[],
  title = "canvas",
): void {
  const payload: CanvasJson = {
    title,
    nodes,
    edges,
    exportedAt: new Date().toISOString(),
    version: 1,
  };

  const json = JSON.stringify(payload, null, 2);
  downloadText(json, `${sanitizeFilename(title)}.json`);
}

// ─── Import from JSON ────────────────────────────────────────────────

export async function importFromJson(
  file: File,
): Promise<{ nodes: any[]; edges: any[] }> {
  const text = await file.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON file");
  }

  const result = canvasJsonSchema.safeParse(parsed);
  if (!result.success) {
    const firstError = result.error.issues[0];
    throw new Error(
      `Invalid canvas file: ${firstError?.path.join(".")} — ${firstError?.message}`,
    );
  }

  return {
    nodes: result.data.nodes,
    edges: result.data.edges,
  };
}
