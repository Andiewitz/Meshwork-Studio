// Type imports removed to avoid Vitest Node environment plugin issues

export const CANVAS_CACHE_PREFIX = "meshwork-canvas-cache-";

export interface CanvasCache {
  nodes: any[];
  edges: any[];
  timestamp: number;
  /** Monotonic client save generation; absent on caches written by older builds. */
  generation?: number;
  /** Server revision this draft was based on, if known. */
  baseRevision?: number;
  /** Live events may have been missed since the draft was last synchronized. */
  requiresReview?: boolean;
  /** Identifies the editor instance that wrote this generation. */
  owner?: string;
}

export function saveCanvasToLocalCache(
  workspaceId: string | number,
  nodes: any[],
  edges: any[],
  generation?: number,
  baseRevision?: number,
  requiresReview = false,
  owner?: string,
) {
  try {
    const cache: CanvasCache = {
      nodes,
      edges,
      timestamp: Date.now(),
      generation,
      baseRevision,
      requiresReview,
      owner,
    };
    localStorage.setItem(
      `${CANVAS_CACHE_PREFIX}${workspaceId}`,
      JSON.stringify(cache),
    );
    return true;
  } catch (e) {
    console.warn("Failed to save canvas to local cache", e);
    return false;
  }
}

export function getCanvasFromLocalCache(
  workspaceId: string | number,
): CanvasCache | null {
  try {
    const item = localStorage.getItem(`${CANVAS_CACHE_PREFIX}${workspaceId}`);
    return item ? JSON.parse(item) : null;
  } catch (e) {
    console.warn("Failed to read canvas from local cache", e);
    return null;
  }
}

export function clearCanvasLocalCache(
  workspaceId: string | number,
  acknowledgedGeneration?: number,
  acknowledgedOwner?: string,
) {
  if (acknowledgedGeneration !== undefined || acknowledgedOwner !== undefined) {
    const cache = getCanvasFromLocalCache(workspaceId);
    if (
      !cache ||
      (acknowledgedGeneration !== undefined &&
        cache.generation !== acknowledgedGeneration) ||
      (acknowledgedOwner !== undefined && cache.owner !== acknowledgedOwner)
    )
      return false;
  }
  localStorage.removeItem(`${CANVAS_CACHE_PREFIX}${workspaceId}`);
  return true;
}

/** Old or unknown baselines cannot safely overwrite a newer server canvas. */
export function isCanvasDraftCurrent(
  cache: CanvasCache,
  revision: number,
): boolean {
  return (
    !cache.requiresReview &&
    cache.baseRevision !== undefined &&
    cache.baseRevision === revision
  );
}
